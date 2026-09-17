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

  // A partially visible body's bottom must survive rewrap in both directions.
  // Real handle moves also exercise delayed scroll events from prior compensation.
  await page.reload();
  await page.getByRole('checkbox', { name: 'Show anchor element' }).check();
  async function resizeTo(width, steps = 1) {
    const current = await size();
    const origin = await begin(page.getByRole('button', { name: 'Resize width', exact: true }));
    for (let index = 1; index <= steps; index++) {
      await page.mouse.move(origin.x + ((width - current.width) * index) / steps, origin.y);
      await page.waitForTimeout(40);
      if (steps > 1) await assertReadingAnchor();
    }
    await page.mouse.up();
    await page.waitForTimeout(100);
  }
  const viewport = page.locator('[data-slot="chat-scroll-viewport"]');
  const readingPosition = () =>
    viewport.evaluate((element) => {
      const body = element.querySelector('[data-message-id="message-93"]');
      const selected = element.querySelector('[data-chat-reading-anchor]');
      return {
        id: selected?.dataset.messageId,
        bottom: body.getBoundingClientRect().bottom - element.getBoundingClientRect().top,
        scrollTop: element.scrollTop,
      };
    });
  async function assertReadingAnchor() {
    const position = await readingPosition();
    assert.equal(position.id, 'message-93', `Resize must retain the partial message: ${JSON.stringify(position)}`);
    assert.ok(Math.abs(position.bottom - 10) <= 1, `Reading bottom stays at 10px: ${JSON.stringify(position)}`);
  }
  await resizeTo(394);
  await viewport.evaluate((element) => {
    const body = element.querySelector('[data-message-id="message-93"]');
    element.scrollTop += body.getBoundingClientRect().bottom - element.getBoundingClientRect().top - 10;
  });
  await page.waitForTimeout(100);
  const original = await readingPosition();
  await assertReadingAnchor();
  for (const steps of [1, 24]) {
    await resizeTo(624, steps);
    await assertReadingAnchor();
    await resizeTo(394, steps);
    await assertReadingAnchor();
    assert.ok(Math.abs((await readingPosition()).scrollTop - original.scrollTop) <= 1, 'Round trip restores scrollTop');
  }
  // Screen coordinates change, but the reading offset belongs to the viewport.
  await window.evaluate((element) => {
    element.style.marginTop = '100px';
  });
  await resizeTo(624);
  await assertReadingAnchor();
  await window.evaluate((element) => {
    element.style.marginTop = '';
  });
  await resizeTo(394);
  await assertReadingAnchor();
  console.log('PASS: bottom anchor survives single and continuous resize, including container translation');

  await page.getByRole('button', { name: '0.1×', exact: true }).click();
  for (const [placement, insertedId] of [
    ['before', 'message-121'],
    ['after', 'message-122'],
  ]) {
    await page.evaluate((insertedId) => {
      const viewport = document.querySelector('[data-slot="chat-scroll-viewport"]');
      const anchor = viewport.querySelector('[data-message-id="message-93"]');
      const read = () => {
        const row = viewport.querySelector(`[data-chat-row-id="${insertedId}"]`);
        return {
          id: viewport.querySelector('[data-chat-reading-anchor]')?.dataset.messageId,
          bottom: anchor.getBoundingClientRect().bottom - viewport.getBoundingClientRect().top,
          scrollTop: viewport.scrollTop,
          mode: document.querySelector('#storybook-root strong')?.textContent,
          animating: row?.hasAttribute('data-chat-inserting') ?? false,
          height: row?.getBoundingClientRect().height ?? 0,
        };
      };
      const baseline = read();
      const frames = [];
      let frame;
      const tick = () => {
        frames.push(read());
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      window.stopAnchorProbe = () => {
        cancelAnimationFrame(frame);
        frames.push(read());
        return { baseline, frames };
      };
    }, insertedId);
    await page.getByRole('button', { name: `Insert incoming ${placement} first visible message`, exact: true }).click();
    const adjacent =
      placement === 'before' ? `[data-chat-row-id="${insertedId}"] + li` : '[data-chat-row-id="message-93"] + li';
    assert.equal(
      await page.locator(adjacent).getAttribute('data-chat-row-id'),
      placement === 'before' ? 'message-93' : insertedId
    );
    await page.waitForFunction(() => !document.querySelector('[data-chat-inserting], [data-chat-entrance]'));
    // Include queued scroll delivery and the final natural-layout handoff.
    await page.waitForTimeout(100);
    const { baseline, frames } = await page.evaluate(() => window.stopAnchorProbe());
    const final = frames.at(-1);
    assert.ok(frames.length > 10, `${placement}: sample the full insertion animation`);
    assert.ok(
      frames.some((frame) => frame.animating && frame.height > 1 && frame.height < final.height - 1),
      `${placement}: sample a genuinely intermediate slot height`
    );
    assert.ok(
      frames.every((frame) => frame.id === baseline.id),
      `${placement}: anchor identity stays stable`
    );
    const maxDrift = Math.max(...frames.map((frame) => Math.abs(frame.bottom - baseline.bottom)));
    assert.ok(
      maxDrift <= 1,
      `${placement}: anchor bottom drift must stay within rounding tolerance, got ${maxDrift}px`
    );
    assert.ok(
      frames.every((frame) => frame.mode === 'detached'),
      `${placement}: insertion never requests catch-up`
    );
    if (placement === 'before') {
      assert.ok(final.scrollTop > baseline.scrollTop + 10, 'Insertion above the anchor actually compensates scrolling');
    } else {
      assert.ok(
        frames.every((frame) => Math.abs(frame.scrollTop - baseline.scrollTop) <= 1),
        'Insertion below the anchor leaves scrollTop unchanged'
      );
    }
    await assertReadingAnchor();
    console.log(
      `PASS: ${placement} insertion preserves anchor identity and bottom across ${frames.length} frames (max drift ${maxDrift}px)`
    );
  }
  await page.getByText('State: detached', { exact: false }).waitFor();
  const viewportBox = await viewport.boundingBox();
  await page.mouse.move(viewportBox.x + viewportBox.width / 2, viewportBox.y + viewportBox.height / 2);
  await page.mouse.wheel(0, -150);
  await page.waitForFunction(
    () => document.querySelector('[data-chat-reading-anchor]')?.dataset.messageId !== 'message-93'
  );
  console.log('PASS: user scrolling selects a new reading anchor');
  await page.screenshot({ path: '/tmp/chat-resizable-window.png', fullPage: true });
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
