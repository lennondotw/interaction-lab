/** Story resizer ownership: real capture plus missing-release and cancellation paths. */
import assert from 'node:assert/strict';

import { chromium } from 'playwright';

const browser = await chromium.launch();
const base = process.env.STORYBOOK_URL ?? 'http://localhost:6009';
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/iframe.html?id=components-chat-scroll-container--resizable-message-input&viewMode=story`);
  const window = page.getByRole('region', { name: 'Resizable chat window' });
  await window.waitFor();
  const size = () => window.evaluate((element) => ({ width: element.offsetWidth, height: element.offsetHeight }));
  const handle = page.getByRole('button', { name: 'Resize window', exact: true });
  const begin = async (target = handle) => {
    const box = await target.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    return { x, y };
  };
  const moveBy = (point, x, y) => page.mouse.move(point.x + x, point.y + y, { steps: 5 });
  const dispatch = (type, options = {}) =>
    handle.evaluate(
      (element, { type, options }) => {
        element.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            buttons: 1,
            ...options,
          })
        );
      },
      { type, options }
    );

  // Resize must preserve the existing demo instance, including the draft.
  await page.getByRole('textbox').fill('Keep this draft');
  const initial = await size();
  let point = await begin();
  await moveBy(point, -100, 40);
  await page.mouse.up();
  assert.deepEqual(await size(), { width: initial.width - 100, height: initial.height + 40 });
  assert.equal(await page.getByRole('textbox').inputValue(), 'Keep this draft');
  console.log('PASS: real corner drag resizes both axes without remounting the chat');

  for (const [label, dx, dy] of [
    ['Resize width', 30, 0],
    ['Resize height', 0, -30],
  ]) {
    const before = await size();
    point = await begin(page.getByRole('button', { name: label, exact: true }));
    await moveBy(point, dx, dy);
    await page.mouse.up();
    assert.deepEqual(await size(), { width: before.width + dx, height: before.height + dy });
  }

  // Start with real input so setPointerCapture has a live pointer. Inject the
  // return-with-no-buttons event without delivering pointerup to the component.
  point = await begin();
  await moveBy(point, 20, 20);
  const heldSize = await size();
  await dispatch('pointermove', { buttons: 0, clientX: point.x + 100, clientY: point.y + 100 });
  await dispatch('pointermove', { buttons: 0, clientX: point.x + 180, clientY: point.y + 180 });
  assert.deepEqual(await size(), heldSize);
  await page.mouse.up();
  console.log('PASS: a missing pointerup stops at the last held position');

  for (const exit of ['pointercancel', 'Escape', 'lostpointercapture']) {
    const before = await size();
    point = await begin();
    await moveBy(point, 25, 25);
    const moved = await size();
    // A second pointer cannot take ownership or cancel the active drag.
    await dispatch('pointerdown', { pointerId: 2, isPrimary: false });
    await dispatch('pointercancel', { pointerId: 2 });
    assert.deepEqual(await size(), moved);
    if (exit === 'Escape') await page.keyboard.press('Escape');
    else if (exit === 'lostpointercapture') {
      await handle.evaluate((element) => element.releasePointerCapture(1));
      await page.mouse.move(point.x + 25, point.y + 25);
    } else await dispatch(exit);
    await dispatch('pointermove', { clientX: point.x + 150, clientY: point.y + 150 });
    assert.deepEqual(await size(), exit === 'lostpointercapture' ? moved : before);
    await page.mouse.up();
  }
  console.log('PASS: cancel/Escape revert, capture loss commits, and other pointers cannot hijack');

  await handle.focus();
  const beforeKeyboard = await size();
  await page.keyboard.press('Shift+ArrowRight');
  assert.deepEqual(await size(), { ...beforeKeyboard, width: beforeKeyboard.width + 10 });

  // Observe attributes as well as animation frames: a short-lived slot must not
  // escape the assertion just because it finishes between samples.
  await page.waitForFunction(() => !document.querySelector('[data-chat-inserting]'));
  await page.getByRole('button', { name: '0.1×', exact: true }).click();
  await page.evaluate(() => {
    window.animatedRows = new Set();
    window.slotObserver = new MutationObserver((records) => {
      for (const record of records) window.animatedRows.add(record.target.dataset.chatRowId);
    });
    window.slotObserver.observe(document.querySelector('[data-slot="chat-scroll-viewport"]'), {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-chat-inserting'],
    });
  });
  const widthHandle = page.getByRole('button', { name: 'Resize width', exact: true });
  for (const dx of [-160, 160, -120, 120]) {
    point = await begin(widthHandle);
    await moveBy(point, dx, 0);
    await page.mouse.up();
    await page.waitForTimeout(80);
  }
  assert.equal(
    await page.evaluate(() => window.animatedRows.size),
    0,
    'Natural reflow never creates layout animations'
  );
  console.log('PASS: repeated width changes leave settled bubbles idle');

  await page
    .getByRole('textbox')
    .fill(
      'Good coffee and a quiet table outside near the garden.\nA walk by the park afterward, with time to explore.'
    );
  await page.getByRole('textbox').press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-chat-inserting]'));
  await page.waitForTimeout(120);
  const slot = page.locator('[data-chat-inserting]').last();
  const id = await slot.getAttribute('data-chat-row-id');
  const beforeResize = await slot.evaluate((row) => row.getBoundingClientRect().height);
  const beforeTarget = await slot.evaluate((row) => row.firstElementChild.getBoundingClientRect().height);
  await page.evaluate(() => window.animatedRows.clear());
  point = await begin(widthHandle);
  await moveBy(point, -100, 0);
  await page.mouse.up();
  const afterResize = await slot.evaluate((row) => row.getBoundingClientRect().height);
  const afterTarget = await slot.evaluate((row) => row.firstElementChild.getBoundingClientRect().height);
  assert.ok(afterResize >= beforeResize, 'Active expansion keeps its progress through resize');
  assert.ok(afterTarget > beforeTarget, 'The active bubble actually rewraps to a taller target');
  const changedRows = await page.evaluate(() => [...window.animatedRows]);
  assert.deepEqual(changedRows, [id], 'Resize only updates the existing animation');
  await page.waitForFunction(() => !document.querySelector('[data-chat-inserting]'));
  const final = await page.locator(`[data-chat-row-id="${id}"]`).evaluate((row) => ({
    height: row.getBoundingClientRect().height,
    target: row.firstElementChild.getBoundingClientRect().height + Number.parseFloat(getComputedStyle(row).paddingTop),
    width: row.style.width,
  }));
  assert.ok(Math.abs(final.height - final.target) < 0.1, 'Completed slot matches natural content');
  assert.equal(final.width, '', 'Temporary width is released after completion');
  await page.evaluate(() => window.slotObserver.disconnect());
  console.log('PASS: resize preserves an active insertion and hands off to its new natural dimensions');
  await page.screenshot({ path: '/tmp/chat-resizable-window.png', fullPage: true });
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
