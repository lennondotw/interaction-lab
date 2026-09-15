/** Shared layout and default entrance for messages and arbitrary list content. */
import assert from 'node:assert/strict';

import { chromium } from 'playwright';

const browser = await chromium.launch();
const base = process.env.STORYBOOK_URL ?? 'http://localhost:6010';
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(
    `${base}/iframe.html?id=components-chat-scroll-container--mixed-items&viewMode=story&reactScan=false`
  );
  const viewport = page.locator('[data-slot="chat-scroll-viewport"]');
  const insert = page.getByRole('button', { name: 'Insert date before last item', exact: true });
  await insert.waitFor();
  const settle = () =>
    page.waitForFunction(() => !document.querySelector('[data-chat-inserting], [data-chat-entrance]'));
  const sample = () =>
    page.evaluate(() => {
      window.itemFrames = [];
      window.captureItems = true;
      const capture = () => {
        const v = document.querySelector('[data-slot="chat-scroll-viewport"]');
        const rows = [...v.querySelectorAll('[data-chat-item]')];
        const lastMessage = [...v.querySelectorAll('[data-message-id]')].at(-1);
        window.itemFrames.push({
          distance: v.scrollHeight - v.clientHeight - v.scrollTop,
          anchor: lastMessage.getBoundingClientRect().top,
          adjacency: rows
            .slice(1)
            .map((row, i) => row.getBoundingClientRect().top - rows[i].getBoundingClientRect().bottom),
          slots: rows
            .filter((row) => row.hasAttribute('data-chat-inserting'))
            .map((row) => {
              const body = row.firstElementChild;
              const style = getComputedStyle(body);
              return {
                height: row.getBoundingClientRect().height,
                bodyHeight: body.getBoundingClientRect().height,
                gap: Number.parseFloat(style.marginTop) + Number.parseFloat(getComputedStyle(row).paddingTop),
                inset: body.getBoundingClientRect().top - row.getBoundingClientRect().top,
                overflow: getComputedStyle(row).overflow,
              };
            }),
          visuals: [...document.querySelectorAll('[data-chat-entrance]')].map((visual) => ({
            opacity: Number(getComputedStyle(visual).opacity),
            y: new DOMMatrixReadOnly(getComputedStyle(visual).transform).m42,
          })),
        });
        if (window.captureItems) requestAnimationFrame(capture);
      };
      capture();
    });
  const frames = () =>
    page.evaluate(() => {
      window.captureItems = false;
      return window.itemFrames;
    });

  await settle();
  const before = await viewport.evaluate((v) => {
    const messages = [...v.querySelectorAll('[data-message-id]')];
    return {
      tail: messages.at(-2).hasAttribute('data-tail'),
      gap: messages.at(-1).getBoundingClientRect().top - messages.at(-2).getBoundingClientRect().bottom,
    };
  });
  assert.equal(before.tail, false);
  assert.equal(before.gap, 3);
  await sample();
  await insert.click();
  assert.equal(
    await viewport.locator('[data-message-id]').nth(-2).getAttribute('data-tail'),
    'true',
    'Splitting a group immediately changes its tail'
  );
  await settle();
  const inserted = await frames();
  assert.ok(
    inserted.some((f) => f.slots.some((slot) => slot.height > 0 && slot.height < slot.bodyHeight)),
    'Custom content expands through partial layout heights'
  );
  assert.ok(
    inserted.some((f) => f.visuals.some((v) => v.opacity > 0 && v.opacity < 1 && v.y > 0)),
    'Custom content defaults to a fade from below'
  );
  for (const frame of inserted) {
    assert.ok(frame.distance <= 1, 'Custom insertion preserves settled following');
    assert.ok(
      frame.adjacency.every((gap) => Math.abs(gap) < 0.02),
      'Item boxes always touch'
    );
    for (const slot of frame.slots) {
      assert.equal(slot.overflow, 'visible');
      assert.ok(Math.abs(slot.inset - slot.gap) < 0.02, 'Bodies stay at the top after their owned gap');
    }
  }
  const after = await viewport.evaluate((v) => {
    const rows = [...v.querySelectorAll('[data-chat-item]')];
    const date = rows.at(-2);
    const last = rows.at(-1);
    return {
      dateGap: date.firstElementChild.getBoundingClientRect().top - date.getBoundingClientRect().top,
      nextGap: last.firstElementChild.getBoundingClientRect().top - last.getBoundingClientRect().top,
      footprint: date.getBoundingClientRect().height,
      body: date.firstElementChild.getBoundingClientRect().height,
    };
  });
  assert.equal(after.dateGap, 16);
  assert.equal(after.nextGap, 8, 'The next item owns the new boundary spacing');
  assert.equal(after.footprint, after.body + 16);

  // Insert above the visible reader; the existing final body remains the reading anchor.
  await viewport.evaluate((v) => {
    v.style.height = '40px';
  });
  await page.waitForFunction(() => {
    const v = document.querySelector('[data-slot="chat-scroll-viewport"]');
    return v.scrollHeight - v.clientHeight - v.scrollTop <= 1;
  });
  await viewport.evaluate((v) => {
    const last = [...v.querySelectorAll('[data-message-id]')].at(-1);
    v.scrollTop += last.getBoundingClientRect().top - v.getBoundingClientRect().top;
  });
  await page.waitForTimeout(100);
  await sample();
  await insert.click();
  await settle();
  const history = await frames();
  assert.ok(
    Math.max(...history.map((f) => f.anchor)) - Math.min(...history.map((f) => f.anchor)) <= 1.1,
    `A custom item inserted above history preserves the reading anchor: ${JSON.stringify({ first: history[0], last: history.at(-1), min: Math.min(...history.map((f) => f.anchor)), max: Math.max(...history.map((f) => f.anchor)) })}`
  );
  const oldTop = await viewport.evaluate((v) => v.scrollTop);
  await page.getByRole('button', { name: 'Append notice', exact: true }).click();
  await settle();
  assert.equal(
    await viewport.evaluate((v) => v.scrollTop),
    oldTop,
    'Custom content below a detached reader does not pull them down'
  );

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await insert.click();
  await settle();
  assert.equal(await page.locator('[data-chat-entrance]').count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: generic item insertion, owned spacing, neighbor gap changes, default upward fade, top alignment, reading anchors, detached append, reduced motion.'
  );
} finally {
  await browser.close();
}
