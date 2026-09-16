/** Outgoing history insertion preserves reading intent; an explicit send still requests bottom catch-up. */
import assert from 'node:assert/strict';

import { chromium } from 'playwright';

const base = process.env.STORYBOOK_URL ?? 'http://localhost:6010';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 940, height: 1000 }, reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const distance of [8, 100]) {
    await page.goto(
      `${base}/iframe.html?id=components-chat-scroll-container--insert-in-history&viewMode=story&globals=outline:!true`
    );
    await page.getByText('0.1×', { exact: true }).click();
    const viewport = page.locator('[data-slot="chat-scroll-viewport"]');
    await page.waitForFunction(() => {
      const v = document.querySelector('[data-slot="chat-scroll-viewport"]');
      return (
        document.querySelector('#storybook-root strong')?.textContent === 'following' &&
        v.scrollHeight - v.clientHeight - v.scrollTop <= 1
      );
    });
    await viewport.hover();
    await page.mouse.wheel(0, -distance);
    await page.waitForFunction((distance) => {
      const v = document.querySelector('[data-slot="chat-scroll-viewport"]');
      return (
        document.querySelector('#storybook-root strong')?.textContent === 'detached' &&
        Math.abs(v.scrollHeight - v.clientHeight - v.scrollTop - distance) <= 1
      );
    }, distance);
    await page.evaluate(() => {
      const viewport = document.querySelector('[data-slot="chat-scroll-viewport"]');
      const content = viewport.firstElementChild;
      const anchor = [...content.querySelectorAll('[data-message-id]')].find(
        (node) => node.getBoundingClientRect().bottom > viewport.getBoundingClientRect().top
      );
      const read = () => ({
        top: viewport.scrollTop,
        anchorTop: anchor.getBoundingClientRect().top,
        height: content.getBoundingClientRect().height,
        mode: document.querySelector('#storybook-root strong').textContent,
        flights: document.querySelectorAll('[data-chat-send-flight]').length,
      });
      window.historyProbe = { baseline: read(), frames: [] };
      let running = true;
      const tick = () => {
        window.historyProbe.frames.push(read());
        if (running) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      window.stopHistoryProbe = () => {
        running = false;
        window.historyProbe.frames.push(read());
        return window.historyProbe;
      };
    });
    await page.getByRole('button', { name: 'Insert outgoing in history', exact: true }).click();
    await page.waitForFunction(() =>
      window.historyProbe.frames.some((frame) => frame.height > window.historyProbe.baseline.height + 2)
    );
    await page.waitForFunction(() => !document.querySelector('[data-chat-inserting], [data-chat-entrance]'));
    await page.waitForTimeout(100);
    const { baseline, frames } = await page.evaluate(() => window.stopHistoryProbe());
    assert.ok(frames.length > 10, 'Sample intermediate insertion frames');
    assert.ok(
      frames.every((frame) => frame.mode === 'detached'),
      'History insertion must not request catch-up'
    );
    assert.ok(
      frames.every((frame) => Math.abs(frame.top - baseline.top) <= 1),
      'Insertion below the reading anchor preserves scroll position'
    );
    assert.ok(
      frames.every((frame) => Math.abs(frame.anchorTop - baseline.anchorTop) <= 1),
      'Visible reading anchor stays in place'
    );
    assert.ok(
      frames.every((frame) => frame.flights === 0),
      'History uses ordinary presence, not composer flight'
    );
    // Distinguish history insertion from local send intent in the same story.
    const input = page.getByRole('textbox', { name: 'Message', exact: true });
    await input.fill('1');
    await input.press('Enter');
    await page.waitForFunction(() => {
      const v = document.querySelector('[data-slot="chat-scroll-viewport"]');
      return (
        document.querySelector('#storybook-root strong')?.textContent === 'following' &&
        v.scrollHeight - v.clientHeight - v.scrollTop <= 1 &&
        !document.querySelector('[data-chat-send-flight], [data-chat-inserting]')
      );
    });
    console.log(
      `PASS: ${distance}px above bottom: outgoing history preserves reading position; local send still catches up.`
    );
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
