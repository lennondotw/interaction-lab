/** Atomic gap changes and bounded geometry work, including 10,000 mounted rows. */
import assert from 'node:assert/strict';

import { chromium } from 'playwright';

const browser = await chromium.launch();
const base = process.env.STORYBOOK_URL ?? 'http://localhost:6010';
try {
  const page = await browser.newPage({ viewport: { width: 940, height: 868 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(
    `${base}/iframe.html?id=components-chat-scroll-container--insert-in-history&viewMode=story&globals=outline:!true`
  );
  await page.getByText('0.1×', { exact: true }).click();
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const viewport = document.querySelector('[data-slot="chat-scroll-viewport"]');
    const list = viewport.firstElementChild;
    const last = [...list.querySelectorAll('[data-chat-row-id]')].at(-1);
    const before = viewport.scrollTop;
    // oxlint-disable-next-line typescript/unbound-method -- The probe forwards the original receiver with apply/call.
    const original = Element.prototype.getBoundingClientRect;
    const dips = [];
    Element.prototype.getBoundingClientRect = function (...args) {
      const rect = original.apply(this, args);
      if (viewport.scrollTop < before - 0.5) dips.push(viewport.scrollTop);
      return rect;
    };
    window.firstLayout = new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (!list.querySelector('[data-chat-inserting]')) return;
        observer.disconnect();
        Element.prototype.getBoundingClientRect = original;
        resolve({
          before,
          after: viewport.scrollTop,
          dips,
          gap: Number.parseFloat(last.firstElementChild.style.marginTop),
        });
      });
      observer.observe(list, { subtree: true, attributes: true, childList: true });
    });
  });
  await page.getByRole('button', { name: 'Insert outgoing in history', exact: true }).click();
  const first = await page.evaluate(() => window.firstLayout);
  assert.deepEqual(first.dips, [], `No transient range clamp inside the layout commit: ${JSON.stringify(first)}`);
  assert.ok(Math.abs(first.after - first.before) <= 0.5, 'Insertion starts without moving the settled viewport');
  assert.equal(first.gap, 8, 'The existing neighbor restores its previous gap before the first paint');
  await page.waitForFunction(() => !document.querySelector('[data-chat-inserting], [data-chat-entrance]'));
  assert.equal(
    await page
      .locator('[data-slot="chat-scroll-viewport"] > ol > [data-chat-row-id]')
      .last()
      .evaluate((row) => getComputedStyle(row).paddingTop),
    '3px'
  );
  await page.screenshot({ path: '/tmp/chat-layout-gap-fixed.png' });

  // A DOM fixture exercises the production layout manager without React render
  // cost or entrance-copy measurements obscuring the geometry-work budget.
  const results = [];
  for (const count of [100, 10_000]) {
    results.push(
      await page.evaluate(async (count) => {
        const { createChatInsertions } = await import('/src/components/chat-scroll-container/chat-insertions.ts');
        const { finalChatBottom } = await import('/src/components/chat-scroll-container/chat-layout.ts');
        // Rows take their gap padding and flex layout from the production list styles.
        const { default: styles } =
          await import('/src/components/chat-scroll-container/chat-scroll-container.module.css');
        const host = document.createElement('section');
        host.style.cssText = 'position:fixed;inset:0;background:white;z-index:99999;';
        const viewport = document.createElement('div');
        viewport.dataset.slot = 'chat-scroll-viewport';
        viewport.style.cssText = 'height:300px;width:500px;overflow:auto;overflow-anchor:none';
        const content = document.createElement('ol');
        content.style.cssText = 'display:flex;flex-direction:column;overflow:clip;margin:0;padding:0;list-style:none';
        const makeRow = (id, gap = 3) => {
          const row = document.createElement('li');
          row.dataset.chatItem = '';
          row.className = styles.item;
          row.style.setProperty('--chat-item-gap', `${gap}px`);
          const body = document.createElement('div');
          body.dataset.chatItemId = String(id);
          body.style.cssText = 'height:33px;flex-shrink:0';
          body.textContent = `Message ${id}`;
          row.append(body);
          return row;
        };
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < count; i++) fragment.append(makeRow(i, i === 0 ? 0 : i === count - 1 ? 8 : 3));
        content.append(fragment);
        viewport.append(content);
        host.append(viewport);
        document.body.append(host);
        const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
        const settle = async () => {
          for (let i = 0; i < 400 && content.querySelector('[data-chat-inserting]'); i++) await frame();
          if (content.querySelector('[data-chat-inserting]')) throw new Error('Layout did not settle');
        };
        const manager = createChatInsertions(viewport, content, () => {
          viewport.scrollTop = viewport.scrollHeight;
        });
        manager.updateOptions(0.25, false);
        await frame();
        await frame();
        viewport.scrollTop = viewport.scrollHeight;
        manager.remember();
        const last = content.lastElementChild;
        const row = makeRow('inserted', 8);
        const before = viewport.scrollTop;
        // oxlint-disable-next-line typescript/unbound-method -- The probe forwards the original receiver with apply/call.
        const original = Element.prototype.getBoundingClientRect;
        let reads = 0;
        const measuredBodies = new Set();
        Element.prototype.getBoundingClientRect = function (...args) {
          if (content.contains(this)) {
            reads++;
            if (this.hasAttribute('data-chat-item-id')) measuredBodies.add(this);
          }
          return original.apply(this, args);
        };
        try {
          content.insertBefore(row, last);
          last.style.setProperty('--chat-item-gap', '3px');
          manager.register(row);
          manager.insert(new Set(['inserted']), false, undefined, new Set([row, last]));
          const commitReads = reads;
          const commitBodies = measuredBodies.size;
          const after = viewport.scrollTop;
          const finalTarget = finalChatBottom(viewport);
          let maxFrameReads = 0;
          let previousReads = reads;
          for (let i = 0; i < 25; i++) {
            await frame();
            maxFrameReads = Math.max(maxFrameReads, reads - previousReads);
            previousReads = reads;
          }
          await settle();
          const targetError = Math.abs(viewport.scrollHeight - viewport.clientHeight - finalTarget);

          // A settled body can grow without a list insertion (e.g. an image loads).
          // Observation updates the baseline without creating animation intent.
          last.firstElementChild.style.height = '90px';
          for (let i = 0; i < 5; i++) await frame();
          const resizeStarted = last.hasAttribute('data-chat-inserting');
          await settle();
          const grownHeight = original.call(last).height;
          last.firstElementChild.style.height = '33px';
          for (let i = 0; i < 5; i++) await frame();
          const shrinkStarted = last.hasAttribute('data-chat-inserting');
          await settle();
          const shrunkHeight = original.call(last).height;
          // A declared content edit still animates from the refreshed baseline.
          last.firstElementChild.style.height = '70px';
          manager.insert(new Set(), false, undefined, new Set([last]));
          const explicitStarted = last.hasAttribute('data-chat-inserting');
          const explicitStartHeight = original.call(last).height;
          await settle();
          const explicitEndHeight = original.call(last).height;
          return {
            count,
            commitReads,
            commitBodies,
            maxFrameReads,
            before,
            after,
            targetError,
            resizeStarted,
            grownHeight,
            shrinkStarted,
            shrunkHeight,
            explicitStarted,
            explicitStartHeight,
            explicitEndHeight,
          };
        } finally {
          Element.prototype.getBoundingClientRect = original;
          manager.dispose();
          host.remove();
        }
      }, count)
    );
  }
  for (const result of results) {
    assert.equal(result.before, result.after, 'Atomic initialization preserves the scroll position');
    assert.ok(result.commitReads < 50, `Bounded commit geometry reads: ${JSON.stringify(result)}`);
    assert.ok(result.commitBodies <= 3, 'Only dirty bodies and the visible reading anchor are measured');
    assert.ok(result.maxFrameReads < 150, `No whole-history scan in animation ticks: ${JSON.stringify(result)}`);
    assert.ok(result.targetError <= 1, 'Projected final height survives the handoff to natural layout');
    assert.ok(
      !result.resizeStarted && !result.shrinkStarted,
      'Observed growth and shrinkage do not create animation intent'
    );
    assert.ok(result.explicitStarted, 'A declared content change creates a layout animation');
    assert.equal(result.explicitStartHeight, result.shrunkHeight, 'Declared edits use the observed baseline');
    assert.equal(result.explicitEndHeight, 73);
    assert.equal(result.grownHeight, 93);
    assert.equal(result.shrunkHeight, 36);
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS: atomic 8px-to-3px gap change, natural resizing, explicit content animation, and bounded geometry work.'
  );
  console.table(results);
} finally {
  await browser.close();
}
