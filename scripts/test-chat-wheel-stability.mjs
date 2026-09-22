/** Settled chat scrolling must preserve wheel movement and its native continuation. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

import { chromium } from 'playwright';

const base = process.env.STORYBOOK_URL ?? 'http://localhost:6009';
const requestedDistance = 240;
const tolerance = 0.5;
const browser = await chromium.launch();
const results = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 900 },
    deviceScaleFactor: 2,
    reducedMotion: 'no-preference',
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const story of ['resizable-message-input', 'with-message-input', 'long-list']) {
    for (const driver of ['wheel', 'native-continuation']) {
      await page.goto(
        `${base}/iframe.html?id=components-chat-scroll-container--${story}&viewMode=story&reactScan=false`
      );
      const viewport = page.locator('[data-slot="chat-scroll-viewport"]');
      await viewport.waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction((distance) => {
        const node = document.querySelector('[data-slot="chat-scroll-viewport"]');
        return (
          node && node.scrollTop > distance && Math.abs(node.scrollHeight - node.clientHeight - node.scrollTop) < 1
        );
      }, requestedDistance);
      // Let initial measurement callbacks drain before instrumenting idle scrolling.
      await page.evaluate(async () => {
        for (let frame = 0; frame < 3; frame++) await new Promise(requestAnimationFrame);
      });
      const bounds = await viewport.boundingBox();
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      const probe = await viewport.evaluateHandle((node) => {
        const row = [...node.querySelectorAll('[data-message-id]')].find(
          (candidate) => candidate.getBoundingClientRect().bottom > node.getBoundingClientRect().top + 100
        );
        if (!row) throw new Error('Expected a visible reading row');
        const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
        const original = Object.getOwnPropertyDescriptor(node, 'scrollTop');
        const started = performance.now();
        const writes = [];
        // Observe controller assignments without replacing the browser's native motion.
        Object.defineProperty(node, 'scrollTop', {
          configurable: true,
          get() {
            return descriptor.get.call(this);
          },
          set(value) {
            writes.push({ time: performance.now() - started, value, stack: new Error().stack });
            descriptor.set.call(this, value);
          },
        });
        const read = () => ({
          time: performance.now() - started,
          top: node.scrollTop,
          height: node.scrollHeight,
          y: row.isConnected ? row.getBoundingClientRect().top - node.getBoundingClientRect().top : null,
        });
        const before = read();
        const frames = [];
        let frame;
        const sample = () => {
          frames.push(read());
          frame = requestAnimationFrame(sample);
        };
        sample();
        return {
          stop() {
            cancelAnimationFrame(frame);
            if (original) Object.defineProperty(node, 'scrollTop', original);
            else delete node.scrollTop;
            return { before, after: read(), frames, writes };
          },
        };
      });
      let samples;
      try {
        if (driver === 'wheel') await page.mouse.wheel(0, -requestedDistance);
        else {
          await viewport.evaluate((node, distance) => {
            // CDP wheel can finish in one step. Exercise later native frames separately;
            // this is not a replay of physical mouse or trackpad hardware.
            node.dispatchEvent(new WheelEvent('wheel', { deltaY: -distance, bubbles: true }));
            node.scrollBy({ top: -distance, behavior: 'smooth' });
          }, requestedDistance);
        }
        // Sample beyond native completion to catch delayed anchor pull-back.
        await page.waitForTimeout(1000);
      } finally {
        samples = await probe.evaluate((value) => value.stop());
        await probe.dispose();
        results.push({ story, driver, ...samples });
      }
      const context = `${story}/${driver}`;
      assert.equal(samples.after.height, samples.before.height, `${context}: fixture height changed`);
      assert.ok(
        samples.frames.every((frame) => frame.y !== null),
        `${context}: reading row disappeared`
      );
      assert.notEqual(samples.after.y, null, `${context}: reading row disappeared`);
      assert.ok(
        Math.abs(samples.after.y - samples.before.y - requestedDistance) <= tolerance,
        `${context}: expected ${requestedDistance}px visible movement, got ${samples.after.y - samples.before.y}px`
      );
      const frames = [...samples.frames, samples.after];
      assert.ok(
        frames.every((frame, index) => !index || frame.top <= frames[index - 1].top + tolerance),
        `${context}: scrolling reversed toward bottom`
      );
      assert.equal(samples.writes.length, 0, `${context}: programmatic position writes during idle scrolling`);
      if (driver === 'native-continuation') {
        assert.ok(
          samples.frames.some(
            (frame) => frame.top < samples.before.top - tolerance && frame.top > samples.after.top + tolerance
          ),
          `${context}: browser did not produce an intermediate native scroll frame`
        );
      }
      console.log(`PASS ${context}: full ${requestedDistance}px movement, no reversal or position writes.`);
    }
  }
  assert.deepEqual(errors, [], 'No browser runtime errors');
} finally {
  try {
    // The shared runner collects this evidence on success and assertion failure.
    await writeFile('/tmp/chat-wheel-stability.json', JSON.stringify({ browser: browser.version(), results }, null, 2));
  } finally {
    await browser.close();
  }
}
