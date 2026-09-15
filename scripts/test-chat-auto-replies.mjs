/** Automatic reply batches keep typing separate from their variable-length burst. */
import assert from 'node:assert/strict';

import { chromium } from 'playwright';

const browser = await chromium.launch();
const base = process.env.STORYBOOK_URL ?? 'http://localhost:6010';
const story = process.env.CHAT_STORY ?? 'automatic-replies';
const coffeeInvitation = `- Good coffee
- A quiet table outside
- A walk by the park afterward`;
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/iframe.html?id=components-chat-scroll-container--${story}&viewMode=story&reactScan=false`);
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.waitFor();
  assert.deepEqual(await page.getByRole('button').allTextContents(), ['0.25×', '1×']);
  await page.getByRole('button', { name: '0.25×', exact: true }).click();
  await page.evaluate(() => {
    const viewport = document.querySelector('[data-slot="chat-scroll-viewport"]');
    const seen = new Set([...viewport.querySelectorAll('[data-message-id]')]);
    let wasTyping = false;
    window.replyEvents = [];
    window.labelEvents = [];
    const seenLabels = new Set();
    const observer = new MutationObserver(() => {
      for (const body of viewport.querySelectorAll('[data-message-id]')) {
        if (seen.has(body)) continue;
        seen.add(body);
        window.replyEvents.push({ kind: body.dataset.variant, time: performance.now() });
      }
      for (const label of viewport.querySelectorAll('[data-slot="chat-date-label"], [data-slot="chat-status-label"]')) {
        if (seenLabels.has(label)) continue;
        seenLabels.add(label);
        window.labelEvents.push({ kind: label.dataset.slot, time: performance.now() });
      }
      const typing = Boolean(
        viewport.querySelector('[data-slot="chat-typing-row"], [data-slot="typing-entry-placeholder"]')
      );
      if (typing && !wasTyping) window.replyEvents.push({ kind: 'typing', time: performance.now() });
      wasTyping = typing;
    });
    observer.observe(viewport, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-slot'] });
  });
  await input.fill(coffeeInvitation);
  const composerHeight = await input.evaluate((field) => field.getBoundingClientRect().height);
  assert.ok(composerHeight >= 65, `The multiline invitation expands the composer: ${composerHeight}px`);
  console.log(`Multiline composer: ${composerHeight}px`);
  await input.press('Enter');
  await page.waitForFunction(() => window.replyEvents.filter((e) => e.kind === 'incoming').length === 3);
  const events = await page.evaluate(() => window.replyEvents);
  assert.deepEqual(
    events.map((e) => e.kind),
    ['outgoing', 'typing', 'incoming', 'incoming', 'incoming']
  );
  const typingDelay = events[1].time - events[0].time;
  assert.ok(typingDelay >= 550 && typingDelay < 1100, `Typing delay: ${typingDelay}ms`);
  for (let index = 2; index < events.length; index++) {
    const delay = events[index].time - events[index - 1].time;
    assert.ok(delay >= 750 && delay < 1600, `Reply interval: ${delay}ms`);
  }
  await page.waitForFunction(() => !document.querySelector('[data-slot="typing-bubble"]'));
  assert.equal(await input.inputValue(), '');
  const labels = await page.evaluate(() => window.labelEvents);
  assert.deepEqual(
    labels.map((label) => label.kind),
    ['chat-date-label', 'chat-status-label']
  );
  assert.ok(
    labels[1].time > events[3].time && labels[1].time < events[4].time,
    'Status appears between the second and third replies'
  );
  const order = await page.locator('[data-slot="chat-scroll-viewport"]').evaluate((v) => {
    const date = v.querySelector('[data-slot="chat-date-label"]');
    const status = v.querySelector('[data-slot="chat-status-label"]');
    return {
      afterDate: date.parentElement.nextElementSibling.textContent,
      beforeStatus: status.parentElement.previousElementSibling.textContent,
      afterStatus: status.parentElement.nextElementSibling.textContent,
    };
  });
  assert.deepEqual(order, {
    afterDate: coffeeInvitation,
    beforeStatus: 'I could use a little break.',
    afterStatus: 'There is a quiet place by the park with really good coffee.',
  });
  await page.screenshot({ path: '/tmp/interaction-lab-automatic-replies.png' });

  // Every send gets a complete batch, with no typing re-entry inside a burst.
  await input.fill('See you there!');
  await input.press('Enter');
  await input.fill('What time?');
  await input.press('Enter');
  await page.waitForFunction(() => window.replyEvents.filter((e) => e.kind === 'incoming').length === 6);
  const burst = await page.evaluate(() => window.replyEvents.slice(5));
  assert.deepEqual(
    burst.filter((e) => e.kind !== 'outgoing').map((e) => e.kind),
    ['typing', 'incoming', 'typing', 'incoming', 'incoming']
  );
  await page.getByRole('button', { name: '1×', exact: true }).click();
  await page.waitForFunction(
    () => !document.querySelector('[data-slot="typing-bubble"], [data-chat-send-flight], [data-chat-inserting]')
  );
  const viewport = page.locator('[data-slot="chat-scroll-viewport"]');
  assert.ok(await viewport.evaluate((v) => v.scrollHeight - v.clientHeight - v.scrollTop <= 1));
  assert.equal(
    await viewport.locator('[data-slot="chat-date-label"]').count(),
    1,
    'Only the first send inserts a date'
  );
  const received = await viewport.locator('[data-message-id][data-variant="incoming"]').allTextContents();
  assert.deepEqual(received.slice(-6), [
    'Yes, please.',
    'I could use a little break.',
    'There is a quiet place by the park with really good coffee.',
    'See you at three!',
    'How about three?',
    'That gives us time for a walk afterward.',
  ]);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: minimal controls, delayed typing, one to three replies, no intermediate typing, queued sends, bottom following.'
  );
} finally {
  await browser.close();
}
