/** Debug annotations must explain real motion without changing layout or scroll extent. */
import assert from 'node:assert/strict';

import { chromium } from 'playwright';

const browser = await chromium.launch();
const base = process.env.STORYBOOK_URL ?? 'http://localhost:6010';
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 }, reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(
    `${base}/iframe.html?id=components-chat-scroll-container--insert-in-history&viewMode=story&reactScan=false`
  );
  await page.getByRole('checkbox', { name: 'Bubble debug' }).waitFor();
  const results = await page.evaluate(async () => {
    const { mountChatContractFixture, commitChatFrame } =
      await import('/src/components/chat-scroll-container/__tests__/chat-contract-fixture.tsx');
    const fixture = mountChatContractFixture();
    const v = fixture.element.querySelector('[data-slot="chat-scroll-viewport"]');
    const flush = async (n = 3) => {
      for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame);
    };
    const until = async (condition) => {
      const start = performance.now();
      while (!condition()) {
        if (performance.now() - start > 12000)
          throw new Error(
            `Debug contract timed out after ${results.join(', ')}; ${[...fixture.element.querySelectorAll('[data-slot="chat-item-debug"]')].map((node) => node.textContent).join('; ')}`
          );
        await flush(1);
      }
    };
    const check = (value, message) => {
      if (!value) throw new Error(message);
    };
    const badge = (id) =>
      [...fixture.element.querySelectorAll('[data-slot="chat-item-debug"]')].find((node) =>
        node.textContent.startsWith(`${id} ·`)
      );
    const geometry = () => ({
      top: v.scrollTop,
      height: v.scrollHeight,
      width: v.scrollWidth,
      rows: [...v.querySelectorAll('[data-chat-item]')].map((row) => {
        const r = row.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height];
      }),
    });
    const results = [];
    try {
      await flush();
      const before = geometry();
      fixture.update({ debugBubbles: true });
      await until(() => badge('seed-29'));
      check(JSON.stringify(before) === JSON.stringify(geometry()), 'Enabling debug preserves all layout geometry');
      const b = badge('seed-29');
      const incoming = v.querySelector('[data-chat-item-id="seed-29"]');
      check(
        Math.abs(b.getBoundingClientRect().left - incoming.getBoundingClientRect().right - 6) < 0.1,
        'Incoming badge is outside the right edge'
      );
      check(b.textContent.includes('idle · layout: idle'), 'Settled body reports idle');
      check(getComputedStyle(v.firstElementChild).overflowX === 'clip', 'Content clips horizontally');
      check(b.inert && b.getAttribute('aria-hidden') === 'true', 'Debug is inert and hidden from accessibility');
      check(b.parentElement === incoming, 'Settled debug belongs to the actual body');
      const beforeScroll = { body: incoming.getBoundingClientRect().top, badge: b.getBoundingClientRect().top };
      v.scrollTop -= 40;
      check(
        Math.abs(
          b.getBoundingClientRect().top -
            beforeScroll.badge -
            (incoming.getBoundingClientRect().top - beforeScroll.body)
        ) < 0.01,
        'Native scroll moves body and debug together before any animation frame'
      );
      v.scrollTop = before.top;
      results.push('toggle preserves layout, right alignment and clipping');

      fixture.send('flight');
      await until(() => badge('flight')?.textContent.includes('flying'));
      await commitChatFrame(() => {
        const carrier = fixture.element.querySelector('[data-chat-send-flight]');
        const debug = badge('flight');
        check(
          Math.abs(debug.getBoundingClientRect().right - carrier.getBoundingClientRect().left + 6) < 1,
          'Flight badge tracks the carrier left edge'
        );
        check(debug.parentElement === carrier, 'Flight debug belongs to the actual carrier');
        check(Math.abs(debug.getBoundingClientRect().height - 24) < 0.1, 'Flight counter-scales debug typography');
      });
      // Interrupting the flight keeps the real row's independently running layout visible in debug.
      v.dispatchEvent(new WheelEvent('wheel', { deltaY: -1 }));
      await flush();
      check(!fixture.element.querySelector('[data-chat-send-flight]'), 'Flight was interrupted');
      check(!badge('flight')?.textContent.includes('flying'), 'Interrupted flight does not leave stale status');
      await until(() => !v.querySelector('[data-chat-inserting]'));
      results.push('flight carrier alignment and interrupted handoff');

      v.scrollTop = v.scrollHeight;
      v.dispatchEvent(new WheelEvent('wheel', { deltaY: 1 }));
      fixture.update({ typing: true });
      await until(() => badge('typing')?.textContent.includes('entering'));
      fixture.update({ typing: false });
      await until(() => badge('typing')?.textContent.includes('exiting'));
      fixture.update({ typing: true });
      await until(() => badge('typing')?.textContent.includes('entering'));
      fixture.update({
        typing: false,
        items: [...fixture.model.items, { id: 'replacement', variant: 'incoming', content: 'Hello!' }],
      });
      await until(
        () =>
          badge('typing')?.textContent.includes('replacing') &&
          badge('replacement')?.textContent.includes('crossfading')
      );
      await until(
        () => !v.querySelector('[data-chat-inserting]') && !v.querySelector('[data-slot="typing-replacement"]')
      );
      results.push('typing entry, exit, reentry and replacement phases');

      fixture.update({
        items: [...fixture.model.items, { id: 'date', kind: 'date', dateTime: '2026-09-16', label: 'Today' }],
      });
      v.scrollTop = v.scrollHeight;
      await until(() => badge('date')?.textContent.includes('entering'));
      await until(() => badge('date')?.textContent.includes('idle · layout: idle'));
      check(getComputedStyle(badge('date')).textAlign === 'left', 'Right-side label debug text is left-aligned');
      const date = v.querySelector('[data-chat-item-id="date"]');
      const range = document.createRange();
      range.selectNodeContents(date.querySelector('[data-slot="chat-label-content"]').firstChild);
      check(
        Math.abs(badge('date').getBoundingClientRect().left - range.getBoundingClientRect().right - 6) < 1,
        'Label debug aligns to painted text, not the full-width row'
      );
      fixture.update({
        items: [...fixture.model.items, { id: 'notice', kind: 'content', content: 'All caught up.' }],
      });
      await until(() => badge('notice')?.textContent.includes('entering'));
      await commitChatFrame(() => {
        const debug = badge('notice');
        check(debug.parentElement.hasAttribute('data-chat-entrance'), 'Content debug belongs to entrance copy');
        check(
          Math.abs(debug.getBoundingClientRect().right - debug.parentElement.getBoundingClientRect().right) < 0.1,
          'Entering content debug overlaps inside its right edge'
        );
      });
      await until(() => badge('notice')?.textContent.includes('idle · layout: idle'));
      const notice = v.querySelector('[data-chat-item-id="notice"]');
      check(badge('notice').parentElement === notice, 'Content debug hands off to the real body');
      check(
        Math.abs(badge('notice').getBoundingClientRect().right - notice.getBoundingClientRect().right) < 0.1,
        'Settled content debug is right-aligned with the content edge'
      );
      const contentBeforeScroll = {
        body: notice.getBoundingClientRect().top,
        badge: badge('notice').getBoundingClientRect().top,
      };
      v.scrollTop -= 40;
      check(
        Math.abs(
          badge('notice').getBoundingClientRect().top -
            contentBeforeScroll.badge -
            (notice.getBoundingClientRect().top - contentBeforeScroll.body)
        ) < 0.01,
        'Content debug follows native scroll synchronously'
      );
      await flush();
      results.push('content inset alignment and synchronous native scrolling');
      const withDebug = geometry();
      fixture.update({ debugBubbles: false });
      await flush();
      check(
        !fixture.element.querySelector('[data-slot="chat-item-debug"], [data-chat-debug-anchor]'),
        'Disabled debug cleans up'
      );
      check(JSON.stringify(withDebug) === JSON.stringify(geometry()), 'Disabling debug preserves geometry');
      results.push('label entrance and text alignment; cleanup');
      return results;
    } finally {
      fixture.unmount();
    }
  });
  console.log(results.join('\n'));
  // Exercise the user-facing switch on the composed story, including slow flight.
  await page.getByRole('checkbox', { name: 'Bubble debug' }).check();
  await page.getByRole('button', { name: '0.25×', exact: true }).click();
  await page.locator('textarea').fill('A quiet afternoon.');
  await page.locator('textarea').press('Enter');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-slot="chat-item-debug"]')].some((node) => node.textContent.includes('flying'))
  );
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/chat-item-debug-flight.png' });
  await page.waitForFunction(() => !document.querySelector('[data-chat-send-flight]'));
  await page.screenshot({ path: '/tmp/chat-item-debug-settled.png' });
  assert.deepEqual(errors, []);
  console.log('Composed story toggle and slow flight passed');
} finally {
  await browser.close();
}
