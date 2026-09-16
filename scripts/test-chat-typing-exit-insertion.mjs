/** A committed typing exit keeps its own footprint when unrelated incoming items arrive. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

import { chromium } from 'playwright';

const base = process.env.STORYBOOK_URL ?? 'http://localhost:6010';
const browser = await chromium.launch();
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 940, height: 1000 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const cases = ['Insert incoming in history', 'Receive a message'].flatMap((button) =>
    [100, 700].map((delay) => ({ button, delay }))
  );
  for (const { button, delay } of cases) {
    await page.goto(
      `${base}/iframe.html?id=components-chat-scroll-container--insert-in-history&viewMode=story&globals=outline:!true`
    );
    await page.getByText('0.1×', { exact: true }).click();
    await page.evaluate(() => {
      Math.random = () => 0;
    });
    const toggle = page.getByRole('button', { name: /^Typing (on|off)$/ });
    await toggle.click();
    await page.waitForFunction(() => document.querySelector('[data-slot="chat-typing-row"]'));
    await page.evaluate((button) => {
      const viewport = document.querySelector('[data-slot="chat-scroll-viewport"]');
      const content = viewport.firstElementChild;
      const oldLast =
        content.querySelector('[data-chat-row-id]:last-of-type') ??
        [...content.querySelectorAll('[data-chat-row-id]')].at(-1);
      const ids = new Set([...content.querySelectorAll('[data-chat-row-id]')].map((row) => row.dataset.chatRowId));
      const read = () => {
        const typing = content.querySelector('[data-slot="typing-bubble"]');
        const inserted = [...content.querySelectorAll('[data-chat-row-id]')].find(
          (row) => !ids.has(row.dataset.chatRowId)
        );
        return {
          time: performance.now(),
          end:
            content.getBoundingClientRect().bottom -
            Number.parseFloat(getComputedStyle(content).paddingBottom) -
            viewport.getBoundingClientRect().top,
          oldTop: oldLast.getBoundingClientRect().top,
          mode: document.querySelector('#storybook-root strong').textContent,
          insertedHeight: inserted?.getBoundingClientRect().height,
          typing: typing && {
            height: typing.parentElement.getBoundingClientRect().height,
            top: typing.getBoundingClientRect().top,
            slot: typing.parentElement.dataset.slot,
          },
        };
      };
      let active = false;
      let running = true;
      window.exitInsertion = { frames: [] };
      const record = () => {
        if (!active) return;
        const sample = read();
        window.exitInsertion.frames.push(sample);
        if (sample.insertedHeight !== undefined && !window.exitInsertion.after) window.exitInsertion.after = sample;
      };
      const observer = new MutationObserver(record);
      observer.observe(content, { childList: true, attributes: true, subtree: true });
      document.addEventListener(
        'click',
        (event) => {
          if (event.target.closest('button')?.textContent !== button) return;
          window.exitInsertion.before = read();
          active = true;
        },
        true
      );
      const tick = () => {
        record();
        if (running) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      window.stopExitInsertion = () => {
        running = false;
        observer.disconnect();
        return window.exitInsertion;
      };
    }, button);
    await toggle.click();
    await page.waitForTimeout(delay);
    await page.getByRole('button', { name: button, exact: true }).click();
    await page.waitForFunction(
      () => !document.querySelector('[data-slot="typing-bubble"], [data-chat-inserting], [data-chat-entrance]')
    );
    const result = await page.evaluate(() => window.stopExitInsertion());
    results.push({ button, delay, ...result });
    await writeFile('/tmp/chat-typing-exit-insertion.json', JSON.stringify(results));
    const { before, after, frames } = result;
    assert.ok(
      before.typing.height > 1 && before.typing.slot === 'typing-exit-placeholder',
      'Insert during an active exit'
    );
    assert.ok(after && frames.length > 5, 'Capture the insertion commit and intermediate animation frames');
    assert.ok(
      after.insertedHeight <= 1,
      `New insertion starts at zero, not typing's remaining height: ${after.insertedHeight}px`
    );
    assert.ok(Math.abs(after.oldTop - before.oldTop) <= 1, 'Existing last message does not jump at commit');
    assert.ok(Math.abs(after.typing.top - before.typing.top) <= 1, 'Typing does not jump to the insertion site');
    assert.ok(Math.abs(after.typing.height - before.typing.height) <= 1, 'Typing retains its current exit footprint');
    assert.ok(
      frames.every((frame) => !frame.typing || frame.typing.slot === 'typing-exit-placeholder'),
      'No late replacement hijacks the exit'
    );
    assert.ok(
      frames.every((frame) => frame.mode === 'following'),
      'Following never becomes a catch-up animation'
    );
    assert.ok(
      frames.every((frame) => Math.abs(frame.end - before.end) <= 1),
      'Content end remains pinned during both animations'
    );
    console.log(`PASS: ${button} ${delay}ms into typing exit; no footprint transfer or position jump.`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
