/** Interrupted typing entry transfers its current footprint, velocity, and visual offset. */
import assert from 'node:assert/strict';

import { chromium } from 'playwright';

const browser = await chromium.launch();
const base = process.env.STORYBOOK_URL ?? 'http://localhost:6010';
try {
  const page = await browser.newPage({ viewport: { width: 940, height: 868 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const { delay, reopen, longReply } of [
    { delay: 0 },
    { delay: 250 },
    { delay: 250, longReply: true },
    { delay: 700, reopen: true },
    { delay: 5000 },
  ]) {
    await page.goto(
      `${base}/iframe.html?id=components-chat-scroll-container--insert-in-history&viewMode=story&globals=outline:!true`
    );
    await page.getByText('0.1×', { exact: true }).click();
    await page.evaluate(async (longReply) => {
      // Short replies share typing's 41px target; a long reply also changes the target.
      Math.random = () => (longReply ? 0.8 : 0);
      const { chatLayoutSpring } = await import('/src/components/chat-scroll-container/chat-presence.ts');
      const v = document.querySelector('[data-slot="chat-scroll-viewport"]');
      const list = v.firstElementChild;
      const oldLast = list.lastElementChild;
      const read = () => {
        const typing = list.querySelector('[data-slot="typing-bubble"]');
        const last = [...list.querySelectorAll('[data-message-id]')].at(-1);
        return {
          time: performance.now(),
          top: v.scrollTop,
          total: list.getBoundingClientRect().height,
          distance: v.scrollHeight - v.clientHeight - v.scrollTop,
          oldTop: oldLast.getBoundingClientRect().top,
          lastId: last.dataset.messageId,
          height: last.parentElement.getBoundingClientRect().height,
          mode: document.querySelector('#storybook-root strong').textContent,
          typing: typing && {
            height: typing.parentElement.getBoundingClientRect().height,
            offset: new DOMMatrixReadOnly(getComputedStyle(typing).transform).m42,
          },
        };
      };
      window.handoffs = [];
      window.omega = Math.sqrt(chatLayoutSpring.stiffness / chatLayoutSpring.mass) * 0.1;
      let current;
      const record = () => {
        if (!current) return;
        const sample = read();
        if (!current.after && sample.lastId !== current.before.lastId) current.after = sample;
        if (current.after) current.frames.push(sample);
      };
      const onClick = (event) => {
        if (event.target.closest('button')?.textContent !== 'Receive a message and turn typing off') return;
        current = { before: read(), frames: [] };
        window.handoffs.push(current);
      };
      document.addEventListener('click', onClick, true);
      const observer = new MutationObserver(record);
      observer.observe(list, { attributes: true, childList: true, subtree: true });
      let running = true;
      const tick = () => {
        record();
        if (running) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      window.stopHandoffProbe = () => {
        running = false;
        observer.disconnect();
        document.removeEventListener('click', onClick, true);
      };
    }, Boolean(longReply));
    const toggle = page.getByRole('button', { name: /^Typing (on|off)$/ });
    const receive = page.getByRole('button', { name: 'Receive a message and turn typing off', exact: true });
    await toggle.click();
    if (delay) await page.waitForTimeout(delay);
    await receive.click();
    if (reopen) {
      await page.waitForTimeout(200);
      await toggle.click();
      await page.waitForTimeout(350);
      await receive.click();
    }
    await page.waitForFunction(
      () => !document.querySelector('[data-chat-inserting], [data-chat-entrance], [data-slot="typing-bubble"]')
    );
    const { handoffs, omega } = await page.evaluate(() => {
      window.stopHandoffProbe();
      return { handoffs: window.handoffs, omega: window.omega };
    });
    for (const [index, handoff] of handoffs.entries()) {
      const { before, after, frames } = handoff;
      assert.ok(after, 'The receive commits a replacement');
      assert.ok(
        Math.abs(after.height - before.typing.height) < 1.1,
        `Current footprint transfers: ${JSON.stringify({ before, after })}`
      );
      assert.ok(Math.abs(after.total - before.total) < 1.1, 'No discontinuity in list height');
      assert.ok(Math.abs(after.oldTop - before.oldTop) <= 1.1, 'Existing messages do not jump');
      assert.ok(
        Math.abs(after.typing.offset - before.typing.offset) < 0.3,
        'A partial entrance offset does not snap to zero'
      );
      // The first replacement remains pure fade until a fresh typing intent takes over.
      if (!reopen || index === 1) {
        for (const frame of frames) {
          assert.ok(frame.mode === 'following' && frame.distance <= 1, 'Following stays settled through handoff');
          if (frame.typing)
            assert.ok(
              Math.abs(frame.typing.offset - after.typing.offset) < 0.001,
              'Replacement adds no independent translation'
            );
        }
      }
      if (index === 0 && !longReply && delay >= 250 && delay <= 700) {
        // Both targets are 41px with the same critical spring. A state transfer
        // should continue that trajectory, rather than restarting from rest.
        const target = 41;
        let low = 0,
          high = 20;
        for (let i = 0; i < 50; i++) {
          const mid = (low + high) / 2;
          if (target * (1 - (1 + mid) * Math.exp(-mid)) < after.height) low = mid;
          else high = mid;
        }
        const sample = frames.find((frame) => frame.time - after.time >= 100);
        const phase = (low + high) / 2 + (omega * (sample.time - after.time)) / 1000;
        const expected = target * (1 - (1 + phase) * Math.exp(-phase));
        assert.ok(
          Math.abs(sample.height - expected) < 0.8,
          `Height velocity carries through: ${sample.height} vs ${expected}`
        );
      }
    }
    console.log(
      `PASS: typing replacement after ${delay}ms${reopen ? ', including reopen and replace again' : longReply ? ', long reply' : ''}.`
    );
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: /^Typing (on|off)$/ }).click();
  await page.getByRole('button', { name: 'Receive a message and turn typing off', exact: true }).click();
  await page.waitForFunction(
    () => !document.querySelector('[data-chat-inserting], [data-chat-entrance], [data-slot="typing-bubble"]')
  );
  assert.deepEqual(errors, []);
  console.log('PASS: reduced-motion replacement and no browser errors.');
} finally {
  await browser.close();
}
