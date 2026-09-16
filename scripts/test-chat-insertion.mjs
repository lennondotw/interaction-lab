/** Frame-level checks for shared insertion layout, final targets, and reading anchors. */
import assert from 'node:assert/strict';

import { chromium } from 'playwright';

const browser = await chromium.launch();
const base = process.env.STORYBOOK_URL ?? 'http://localhost:6009';
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/iframe.html?id=components-chat-scroll-container--insert-in-history&viewMode=story`);
  const viewport = page.locator('[data-slot="chat-scroll-viewport"]');
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  const toggle = page.getByRole('button', { name: /^Typing (on|off)$/ });
  const receiveWhileTyping = page.getByRole('button', { name: 'Receive a message', exact: true });
  const receive = page.getByRole('button', { name: 'Receive a message and turn typing off', exact: true });
  const settle = async () => {
    await page.waitForFunction(() => {
      const viewport = document.querySelector('[data-slot="chat-scroll-viewport"]');
      return (
        viewport &&
        !viewport.querySelector('[data-chat-inserting]') &&
        !document.querySelector('[data-chat-send-flight], [data-chat-entrance]')
      );
    });
    await page.waitForTimeout(80);
  };
  const sample = () =>
    page.evaluate(() => {
      window.frames = [];
      window.sampling = true;
      const capture = () => {
        const v = document.querySelector('[data-slot="chat-scroll-viewport"]');
        const t = v.querySelector('[data-slot="typing-bubble"]');
        const a = window.readingAnchor;
        window.frames.push({
          time: performance.now(),
          typing: t?.getBoundingClientRect().top,
          typingEdge: t
            ? t.getBoundingClientRect().top +
              (Number.parseFloat(getComputedStyle(v.firstElementChild).paddingBottom) +
                (v.querySelector('[data-slot="chat-bottom-space"]')?.getBoundingClientRect().height ?? 0))
            : undefined,
          top: v.scrollTop,
          distance: v.scrollHeight - v.clientHeight - v.scrollTop,
          entranceOffsets: [...document.querySelectorAll('[data-chat-entrance]')].map(
            (visual) => new DOMMatrixReadOnly(getComputedStyle(visual).transform).m42
          ),
          slots: [...v.querySelectorAll('[data-chat-inserting]')].map((e) => e.getBoundingClientRect().height),
          unclipped: [...v.querySelectorAll('[data-chat-inserting]')].every(
            (row) => getComputedStyle(row).overflow === 'visible'
          ),
          mode: document.querySelector('#storybook-root strong').textContent,
          anchor: a?.isConnected ? a.getBoundingClientRect().top : undefined,
        });
        if (window.sampling) requestAnimationFrame(capture);
      };
      capture();
    });
  const frames = () =>
    page.evaluate(() => {
      window.sampling = false;
      return window.frames;
    });
  const smooth = (values, key, max = 6) => {
    for (let i = 1; i < values.length; i++) {
      if (values[i][key] === undefined || values[i - 1][key] === undefined) continue;
      const allowance = max * Math.max(1, (values[i].time - values[i - 1].time) / (1000 / 60));
      assert.ok(
        Math.abs(values[i][key] - values[i - 1][key]) <= allowance,
        `No ${key} jump: ${JSON.stringify(values.slice(i - 1, i + 1))}`
      );
    }
  };
  await input.waitFor();
  await settle();
  assert.equal(await viewport.locator('[data-chat-inserting]').count(), 0, 'Initial history has no entry slots');
  await page.getByText('0.25×', { exact: true }).click();
  await toggle.click();
  await page.waitForTimeout(2200);

  for (const text of ['1', 'First line\nSecond line\nThird line']) {
    await input.fill(text);
    await page.waitForTimeout(120);
    await sample();
    await input.press('Enter');
    await settle();
    const captured = await frames();
    assert.ok(
      captured.every((frame) => frame.unclipped),
      'Layout slots never clip their bubbles'
    );
    assert.ok(
      captured.some((f) => f.slots.some((h) => h > 0 && h < 30)),
      'Insertion expands through intermediate heights'
    );
    assert.ok(
      captured.every((f) => f.mode === 'following' && f.distance <= 1),
      'Settled following uses the layout animation directly'
    );
    // Multiline submission clears the composer, intentionally moving its safety area.
    if (text === '1')
      assert.ok(
        Math.max(...captured.map((f) => f.typing)) - Math.min(...captured.map((f) => f.typing)) <= 1.1,
        'Typing stays fixed during insertion before it'
      );
    else
      assert.ok(
        Math.max(...captured.map((f) => f.typingEdge)) - Math.min(...captured.map((f) => f.typingEdge)) <= 1.1,
        'Typing follows the composer clearance without additional layout displacement'
      );
  }

  // Receiving without changing typing inserts a regular message before the indicator.
  await sample();
  await receiveWhileTyping.click();
  await settle();
  const continuedTyping = await frames();
  assert.equal(await viewport.locator('[data-slot="typing-bubble"]').count(), 1);
  assert.equal(await viewport.locator('[data-slot="typing-replacement"]').count(), 0);
  assert.equal(await viewport.locator('[data-message-id]').last().getAttribute('data-tail'), null);
  assert.ok(
    continuedTyping.some((f) => f.entranceOffsets.some((offset) => offset > 0)),
    'Receive uses the default upward entrance when typing stays on'
  );
  assert.ok(continuedTyping.every((f) => f.distance <= 1 && f.mode === 'following'));

  await page.evaluate(() => {
    Math.random = () => 0.8;
  });
  await sample();
  await receive.click();
  await settle();
  const replacement = await frames();
  assert.ok(
    replacement.some((f) => f.slots.length),
    'Typing replacement uses the same layout transition'
  );
  assert.ok(replacement.every((f) => f.distance <= 1 && f.mode === 'following'));
  smooth(replacement, 'top');
  assert.equal(await viewport.locator('[data-slot="typing-bubble"]').count(), 0);

  // Insert before the visible history: adjust scrollTop by the layout displacement,
  // keeping the actual message on screen fixed rather than preserving a stale number.
  // A short viewport lets the final multiline row be the first visible reading anchor.
  await viewport.evaluate((v) => {
    v.style.height = '100px';
  });
  await page.waitForFunction(() => {
    const v = document.querySelector('[data-slot="chat-scroll-viewport"]');
    return (
      document.querySelector('#storybook-root strong').textContent === 'following' &&
      v.scrollHeight - v.clientHeight - v.scrollTop <= 1
    );
  });
  await viewport.evaluate((v) => {
    const message = [...v.querySelectorAll('[data-message-id]')].at(-1);
    v.scrollTop += message.getBoundingClientRect().top - v.getBoundingClientRect().top;
    window.readingAnchor = message;
  });
  await page.waitForFunction(() => document.querySelector('#storybook-root strong').textContent === 'detached');
  await sample();
  await page.getByRole('button', { name: 'Insert incoming in history', exact: true }).click();
  await settle();
  const history = await frames();
  assert.ok(
    await viewport.evaluate((v) => [...v.querySelectorAll('[data-message-id]')].at(-1) === window.readingAnchor),
    'Insertion keeps the original final message last'
  );
  assert.ok(
    history.every((f) => f.mode === 'detached'),
    'Middle insertion never resumes following'
  );
  assert.ok(
    Math.max(...history.map((f) => f.anchor)) - Math.min(...history.map((f) => f.anchor)) <= 1.1,
    `Reading anchor stays fixed through insertion and handoff: ${Math.min(...history.map((f) => f.anchor))}..${Math.max(...history.map((f) => f.anchor))}`
  );
  assert.ok(history.at(-1).top > history[0].top + 30, 'Scroll position compensates for content inserted above');

  // Appending below the reader leaves scrollTop unchanged.
  const oldTop = await viewport.evaluate((v) => v.scrollTop);
  await receive.click();
  await settle();
  assert.equal(await viewport.evaluate((v) => v.scrollTop), oldTop);

  // Local sends still catch up from history, and native input can interrupt them.
  await input.fill('A local message from history.');
  await input.press('Enter');
  await page.waitForFunction(() => document.querySelector('#storybook-root strong').textContent === 'animating');
  await viewport.hover();
  await page.mouse.wheel(0, -80);
  await page.waitForFunction(() => document.querySelector('#storybook-root strong').textContent === 'detached');
  await settle();
  assert.equal(await page.locator('[data-chat-send-flight]').count(), 0);
  const interruptedTop = await viewport.evaluate((v) => v.scrollTop);
  await page.waitForTimeout(250);
  assert.equal(await viewport.evaluate((v) => v.scrollTop), interruptedTop);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await receive.click();
  await settle();
  assert.equal(await viewport.locator('[data-chat-inserting]').count(), 0);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: '/tmp/chat-insertion-history.png' });
  console.log(
    'PASS: initial layout, zero-to-natural insertion, typing stability, replacement, middle insertion reading anchor, detached append, native interruption, reduced motion.'
  );
} finally {
  await browser.close();
}
