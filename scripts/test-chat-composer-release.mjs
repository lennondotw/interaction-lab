/** Composer reset transfers clearance without a native range dip or message-owned lifetime. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

import { chromium } from 'playwright';

const browser = await chromium.launch();
const results = [];
const base = process.env.STORYBOOK_URL ?? 'http://localhost:6010';
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 }, reducedMotion: 'no-preference' });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const scenario of [
    { speed: 0.1, distance: 0, count: 1 },
    { speed: 1, distance: 0, count: 2, typing: true },
    { speed: 0.1, distance: 100, count: 2 },
    { speed: 0.1, distance: 0, count: 2, typing: true, interrupt: true },
    { speed: 1, distance: 100, count: 1, typing: true },
  ]) {
    await page.goto(`${base}/iframe.html?id=components-chat-scroll-container--with-message-input&viewMode=story`);
    await page.getByText(`${scenario.speed}×`, { exact: true }).click();
    if (scenario.typing) await page.getByRole('button', { name: 'Typing off', exact: true }).click();
    await page.waitForFunction(() => {
      const viewport = document.querySelector('[data-slot="chat-scroll-viewport"]');
      return (
        !viewport.querySelector('[data-slot="typing-entry-placeholder"]') &&
        document.querySelector('#storybook-root strong')?.textContent === 'following'
      );
    });
    const field = page.locator('textarea');
    const draft = '- Good coffee\n- A quiet table outside\n- A walk by the park afterward';
    await field.fill(draft);
    await page.waitForFunction(() => {
      const space = document.querySelector('[data-slot="chat-bottom-space"]');
      return (
        Math.abs(
          space.getBoundingClientRect().height - document.querySelector('form').getBoundingClientRect().height - 12
        ) < 0.1
      );
    });
    if (scenario.distance) {
      await page.locator('[data-slot="chat-scroll-viewport"]').hover();
      await page.mouse.wheel(0, -scenario.distance);
      await page.waitForFunction(() => document.querySelector('#storybook-root strong')?.textContent === 'detached');
    }
    await page.evaluate(async () => {
      const { finalChatBottom } = await import('/src/components/chat-scroll-container/chat-layout.ts');
      const viewport = document.querySelector('[data-slot="chat-scroll-viewport"]');
      const space = viewport.querySelector('[data-slot="chat-bottom-space"]');
      const form = document.querySelector('form');
      const old = [...viewport.querySelectorAll('[data-chat-row-id]')].at(-1);
      const read = () => ({
        t: performance.now(),
        top: viewport.scrollTop,
        bottom: viewport.scrollHeight - viewport.clientHeight,
        target: finalChatBottom(viewport),
        oldTop: old.getBoundingClientRect().top,
        space: space.getBoundingClientRect().height,
        composer: form.getBoundingClientRect().height,
        mode: document.querySelector('#storybook-root strong').textContent,
        count: viewport.querySelectorAll('[data-message-id]').length,
        flying: document.querySelectorAll('[data-chat-send-flight]').length,
      });
      const probe = { sends: [], frames: [] };
      let frame;
      const tick = () => {
        probe.frames.push(read());
        frame = requestAnimationFrame(tick);
      };
      tick();
      window.submitComposerProbe = () => {
        const send = { before: read() };
        probe.sends.push(send);
        const observer = new MutationObserver(() => {
          const after = read();
          if (after.count === send.before.count || after.composer === send.before.composer) return;
          send.after = after;
          observer.disconnect();
        });
        observer.observe(viewport.parentElement.parentElement, { subtree: true, attributes: true, childList: true });
        form.requestSubmit();
      };
      window.readComposerRelease = read;
      window.stopComposerRelease = () => {
        cancelAnimationFrame(frame);
        return probe;
      };
    });
    for (let index = 0; index < scenario.count; index++) {
      if (index) await field.fill(draft);
      await page.evaluate(() => window.submitComposerProbe());
      await page.waitForFunction(() => document.querySelector('textarea').value === '');
    }
    let interrupted;
    if (scenario.interrupt) {
      const before = await page.evaluate(() => window.readComposerRelease());
      await page.locator('[data-slot="chat-scroll-viewport"]').hover();
      await page.mouse.wheel(0, -100);
      await page.waitForFunction(() => document.querySelector('#storybook-root strong')?.textContent === 'detached');
      interrupted = await page.evaluate(() => window.readComposerRelease());
      assert.ok(before.space - before.composer - 12 > 20, 'Interrupt during outstanding compensation');
      assert.ok(interrupted.space - interrupted.composer - 12 > 10, 'Interruption retains the layout footprint');
      assert.equal(interrupted.flying, 0, 'Upward input hands off flight immediately');
    }
    // Flight hands off within one CSS pixel; the 15/1 catch-up spring may still be
    // settling its sub-pixel tail afterwards, especially at 0.1x. Wait for that too.
    await page.waitForFunction(() => {
      const viewport = document.querySelector('[data-slot="chat-scroll-viewport"]');
      return (
        !document.querySelector('[data-chat-send-flight], [data-chat-inserting], [data-chat-entrance]') &&
        document.querySelector('#storybook-root strong')?.textContent !== 'animating' &&
        Math.abs(
          viewport.querySelector('[data-slot="chat-bottom-space"]').getBoundingClientRect().height -
            document.querySelector('form').getBoundingClientRect().height -
            12
        ) < 0.1
      );
    });
    const end = await page.evaluate(() => window.readComposerRelease());
    const probe = await page.evaluate(() => window.stopComposerRelease());
    for (const send of probe.sends) {
      assert.ok(send.after, 'Witness the actual reset commit');
      assert.equal(send.before.composer - send.after.composer, 34);
      assert.ok(
        Math.abs(send.after.space - send.before.space) <= 1,
        `Clearance conserved at reset: ${JSON.stringify(send)}`
      );
      assert.ok(send.after.top >= send.before.top - 1, 'No backward native clamp at send');
    }
    if (scenario.count === 2 && scenario.speed === 0.1) {
      const second = probe.sends[1].after;
      assert.ok(
        second.space - second.composer - 12 > 50,
        'Consecutive releases coexist instead of replacing each other'
      );
    }
    assert.equal(end.mode, scenario.interrupt ? 'detached' : 'following');
    assert.ok(
      Math.abs(end.space - end.composer - 12) < 0.1,
      `Temporary space is fully released: ${JSON.stringify(end)}`
    );
    if (!scenario.distance && !scenario.interrupt) {
      assert.ok(
        probe.frames.every((frame) => frame.mode === 'following'),
        'Settled following never starts a catch-up spring'
      );
      assert.ok(
        probe.frames.every((frame) => Math.abs(frame.bottom - frame.top) <= 1),
        'Settled following stays pinned throughout the release'
      );
    }
    if (!scenario.interrupt) {
      assert.ok(Math.abs(end.bottom - end.top) <= 1, 'Settles at actual bottom without rescue input');
      // State reporting is deferred to rAF; the first commit may still display the
      // pre-send detached report. Once catch-up is reported it must never escape.
      const active = probe.frames.findIndex(
        (frame) => frame.count > probe.sends[0].before.count && frame.mode !== 'detached'
      );
      assert.ok(active >= 0);
      assert.ok(
        probe.frames.slice(active).every((frame) => frame.mode !== 'detached'),
        'No false user escape after sending'
      );
    } else {
      assert.ok(Math.abs(end.top - interrupted.top) <= 1, 'Release continues without pulling detached reading');
    }
    assert.ok(
      probe.frames.some((frame) => frame.space > frame.composer + 13),
      'Sample the animated intermediate footprint'
    );
    results.push({ scenario, sends: probe.sends, end, frames: probe.frames });
    console.log(`PASS: composer release ${JSON.stringify(scenario)} (${probe.frames.length} frames)`);
  }

  // The layout primitive has no message identity. Exercise a multi-item commit,
  // overlapping releases, ordinary edits, duplicate updates, and lifecycle cleanup.
  const primitive = await page.evaluate(async () => {
    const { createChatBottomSpace } = await import('/src/components/chat-scroll-container/chat-bottom-space.ts');
    const { finalChatBottom, hasChatLayoutAnimation } =
      await import('/src/components/chat-scroll-container/chat-layout.ts');
    const viewport = document.createElement('div');
    viewport.style.cssText = 'height:100px;width:300px;overflow:auto';
    const content = document.createElement('div');
    const rows = document.createElement('div');
    rows.style.height = '300px';
    const space = document.createElement('div');
    content.append(rows, space);
    viewport.append(content);
    document.body.append(viewport);
    let callbacks = 0;
    const manager = createChatBottomSpace(viewport, space, () => callbacks++);
    manager.updateOptions(0.1, false);
    manager.update({ height: 105 });
    const first = Symbol();
    manager.update({ height: 71, release: first });
    const start = space.getBoundingClientRect().height;
    const projected = finalChatBottom(viewport);
    manager.update({ height: 71, release: first });
    const duplicate = space.getBoundingClientRect().height;
    manager.update({ height: 105 }); // Draft edited while the previous release is active.
    manager.update({ height: 71, release: Symbol() });
    const overlap = space.getBoundingClientRect().height;
    // Date, outgoing, and custom content share the same geometry transaction.
    for (const height of [20, 67, 40]) {
      const item = document.createElement('div');
      item.style.height = `${height}px`;
      rows.append(item);
    }
    rows.style.height = 'auto';
    const batchTarget = finalChatBottom(viewport);
    manager.updateOptions(1, true);
    const reduced = { height: space.getBoundingClientRect().height, active: hasChatLayoutAnimation(viewport) };
    manager.update({ height: 105 });
    manager.updateOptions(0.1, false);
    manager.update({ height: 71, release: Symbol() });
    manager.dispose();
    const disposed = { active: hasChatLayoutAnimation(viewport), callbacks };
    await new Promise((resolve) => setTimeout(resolve, 100));
    const later = callbacks;
    viewport.remove();
    return { start, duplicate, projected, overlap, batchTarget, reduced, disposed, later };
  });
  assert.equal(primitive.start, 105);
  assert.equal(primitive.duplicate, 105);
  assert.equal(primitive.projected, 271, 'Final bottom excludes temporary compensation');
  assert.equal(primitive.overlap, 139, 'Two independent 34px releases');
  assert.equal(primitive.batchTarget, 98, 'Projection is independent of inserted item count and type');
  assert.deepEqual(primitive.reduced, { height: 71, active: false });
  assert.equal(primitive.disposed.active, false);
  assert.equal(primitive.later, primitive.disposed.callbacks, 'Unmount cancels all future layout callbacks');
  assert.deepEqual(errors, []);
  console.log('PASS: batch-independent projection, duplicate delivery, overlapping release, reduced motion, disposal');
  await writeFile('/tmp/chat-composer-release.json', JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
