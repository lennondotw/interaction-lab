/** Frame-level checks for the composer-to-bubble flight. Requires a running Storybook. */
import assert from 'node:assert/strict';

import { chromium } from 'playwright';

const browser = await chromium.launch();
const base = process.env.STORYBOOK_URL ?? 'http://localhost:6009';
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(
    `${base}/iframe.html?id=components-chat-scroll-container--with-message-input&viewMode=story&globals=theme:dark&reactScan=false`
  );
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  const viewport = page.locator('[data-slot="chat-scroll-viewport"]');
  async function settled() {
    await page.waitForFunction(() => {
      const viewport = document.querySelector('[data-slot="chat-scroll-viewport"]');
      return (
        document.querySelector('#storybook-root strong')?.textContent === 'following' &&
        viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop < 1
      );
    });
  }
  await settled();
  await input.fill('A note before we go.\nTake the scenic route.\nThere is no hurry.');
  await settled();
  const origin = await page.locator('[data-slot="message-input"]').boundingBox();
  await page.evaluate(() => {
    window.flightFrames = [];
    const read = () => {
      const carrier = document.querySelector('[data-chat-send-flight]');
      if (!carrier) return;
      const target = document.querySelector(
        `[data-slot="chat-scroll-viewport"] [data-message-id="${carrier.dataset.messageId}"]`
      );
      const content = carrier.querySelector('[data-slot="message-bubble-content"]');
      const matrix = new DOMMatrix(getComputedStyle(carrier).transform);
      const inverse = new DOMMatrix(getComputedStyle(content).transform);
      const viewport = document.querySelector('[data-slot="chat-scroll-viewport"]');
      window.flightFrames.push({
        time: performance.now(),
        rect: carrier.getBoundingClientRect().toJSON(),
        target: target.getBoundingClientRect().toJSON(),
        scale: [matrix.a, matrix.d],
        contentScale: [inverse.a, inverse.d],
        tail: Number(getComputedStyle(carrier).getPropertyValue('--message-bubble-tail-opacity')),
        visibility: getComputedStyle(target).visibility,
        inScroller: viewport.contains(carrier),
        scrollHeight: viewport.scrollHeight,
      });
    };
    const observer = new MutationObserver(read);
    observer.observe(document.querySelector('#storybook-root'), {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    });
    window.stopFlightSampling = () => observer.disconnect();
  });
  await input.press('Enter');
  await page.waitForFunction(() => window.flightFrames.length > 0);
  await page.waitForTimeout(95);
  await page.screenshot({ path: '/tmp/chat-send-flight-mid.png' });
  await page.waitForFunction(() => !document.querySelector('[data-chat-send-flight]'));
  await settled();
  const frames = await page.evaluate(() => {
    window.stopFlightSampling();
    return window.flightFrames;
  });
  assert.ok(frames.length > 8, 'Flight has intermediate frames');
  const first = frames[0];
  for (const key of ['x', 'y', 'width', 'height'])
    assert.ok(Math.abs(first.rect[key] - origin[key]) < 1, `Departure ${key} matches the expanded composer`);
  assert.ok(
    frames.every((frame) => !frame.inScroller),
    'Flight cannot inflate the scrolling content'
  );
  assert.ok(
    frames.every((frame) => frame.visibility === 'hidden'),
    'Only one visual bubble during flight'
  );
  for (const frame of frames) {
    assert.ok(Math.abs(frame.scale[0] * frame.contentScale[0] - 1) < 0.001);
    assert.ok(Math.abs(frame.scale[1] * frame.contentScale[1] - 1) < 0.001);
  }
  assert.equal(first.tail, 0);
  assert.ok(
    frames.some((frame) => frame.tail > 0.9),
    'Tail appears near arrival'
  );
  const last = frames.at(-1);
  assert.ok(
    Math.abs(last.rect.x - last.target.x) < 1 && Math.abs(last.rect.y - last.target.y) < 1,
    'Flight converges on the moving list anchor'
  );
  assert.equal(
    await viewport
      .locator('[data-message-id]')
      .last()
      .evaluate((element) => element.style.visibility),
    ''
  );

  // The button fills a wide composer before sending. Final bubble wrapping is
  // taller, so its unscaled text must stay inside the animated body.
  await page.evaluate(() => {
    window.longFlightFrames = [];
    window.originalRandom = Math.random;
    Math.random = () => 0.8;
    const observer = new MutationObserver(() => {
      const carrier = document.querySelector('[data-chat-send-flight]');
      if (!carrier) return;
      const clip = carrier.querySelector('[data-slot="chat-send-flight-clip"]');
      window.longFlightFrames.push({
        body: carrier.getBoundingClientRect().toJSON(),
        clip: clip.getBoundingClientRect().toJSON(),
        text: clip.firstElementChild.getBoundingClientRect().toJSON(),
        overflow: getComputedStyle(clip).overflow,
      });
    });
    observer.observe(document.querySelector('#storybook-root'), { subtree: true, childList: true, attributes: true });
    window.stopLongSampling = () => {
      observer.disconnect();
      Math.random = window.originalRandom;
    };
  });
  await page.getByRole('button', { name: 'Send a message', exact: true }).click();
  await page.waitForFunction(() => window.longFlightFrames.length > 0);
  await page.screenshot({ path: '/tmp/chat-send-flight-long-clipped.png' });
  await page.waitForFunction(() => !document.querySelector('[data-chat-send-flight]'));
  const longFrames = await page.evaluate(() => {
    window.stopLongSampling();
    return window.longFlightFrames;
  });
  assert.ok(
    longFrames.some((frame) => frame.text.height > frame.body.height + 10),
    'Exercise wrapping taller than the departure box'
  );
  for (const frame of longFrames) {
    assert.equal(frame.overflow, 'clip');
    assert.ok(Math.abs(frame.text.top - frame.body.top - 9) < 1, 'First line retains its top inset');
    for (const key of ['x', 'y', 'width', 'height']) {
      assert.ok(Math.abs(frame.clip[key] - frame.body[key]) < 1, 'Text clipping follows the visual body');
    }
  }
  await settled();

  // Sending from old history flies to the final bottom position while the
  // original row is still offscreen, then hands off only when that row arrives.
  await viewport.hover();
  await page.mouse.wheel(0, -10000);
  await page.waitForFunction(() => document.querySelector('[data-slot="chat-scroll-viewport"]').scrollTop === 0);
  await page.evaluate(() => {
    window.historyFrames = [];
    let messageId;
    function sample() {
      const viewport = document.querySelector('[data-slot="chat-scroll-viewport"]');
      const carrier = document.querySelector('[data-chat-send-flight]');
      if (carrier) messageId = carrier.dataset.messageId;
      const target = messageId && viewport.querySelector(`[data-message-id="${messageId}"]`);
      if (target) {
        const remaining = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
        window.historyFrames.push({
          time: performance.now(),
          flying: Boolean(carrier),
          top: (carrier ?? target).getBoundingClientRect().top,
          predicted: target.getBoundingClientRect().top - remaining,
          remaining,
          visibility: getComputedStyle(target).visibility,
        });
      }
      if (!target || carrier) requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  await input.fill('A reply from the top.');
  await input.press('Enter');
  await page.waitForFunction(() => window.historyFrames.some((frame) => !frame.flying));
  const historyFrames = await page.evaluate(() => window.historyFrames);
  const departure = historyFrames[0];
  assert.ok(departure.remaining > 1000, 'Start far from the bottom');
  assert.ok(
    historyFrames.some((frame) => frame.flying && frame.remaining <= 1),
    'The faster scroll reaches the bottom before the flight finishes'
  );
  assert.ok(
    historyFrames.every((frame) => Math.abs(frame.predicted - departure.predicted) < 1),
    'The predicted destination remains stable during catch-up scrolling'
  );
  assert.ok(
    historyFrames.every((frame) => frame.top <= departure.top + 1),
    'Flight never dives toward the offscreen row'
  );
  const handoff = historyFrames.at(-1);
  assert.ok(handoff.remaining <= 1, 'Only hand off once the actual row arrives');
  assert.equal(handoff.visibility, 'visible');
  await settled();

  // Interrupt an active flight through real wheel input, then ensure history stays put.
  await input.fill('A second note.');
  await input.press('Enter');
  await page.waitForSelector('[data-chat-send-flight]');
  await viewport.hover();
  await page.mouse.wheel(0, -80);
  await page.waitForFunction(
    () =>
      document.querySelector('#storybook-root strong')?.textContent === 'detached' &&
      !document.querySelector('[data-chat-send-flight]')
  );
  await page.waitForTimeout(150);
  const stoppedTop = await viewport.evaluate((element) => element.scrollTop);
  await page.waitForTimeout(650);
  assert.equal(await viewport.evaluate((element) => element.scrollTop), stoppedTop);

  // Burst sends retain separate identities and release every hidden original.
  await page.getByRole('button', { name: 'Send a message', exact: true }).click();
  await settled();
  await input.fill('One');
  await input.press('Enter');
  await input.fill('Two');
  await input.press('Enter');
  await page.waitForFunction(() => !document.querySelector('[data-chat-send-flight]'));
  assert.equal(await viewport.locator('[data-message-id][style*="hidden"]').count(), 0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await input.fill('Without motion.');
  await input.press('Enter');
  assert.equal(await page.locator('[data-chat-send-flight]').count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    `PASS: ${frames.length} flight samples; measured multi-line departure, moving arrival, text scale, tail, interruption, burst cleanup, reduced motion.`
  );
} finally {
  await browser.close();
}
