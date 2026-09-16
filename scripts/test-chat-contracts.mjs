/** Key interaction contracts not implied by final-position or screenshot checks. */
import assert from 'node:assert/strict';

import { chromium } from 'playwright';

const browser = await chromium.launch();
const base = process.env.STORYBOOK_URL ?? 'http://localhost:6010';
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/iframe.html?id=components-chat-scroll-container--insert-in-history&viewMode=story`);
  const results = await page.evaluate(async () => {
    const { mountChatContractFixture } =
      await import('/src/components/chat-scroll-container/__tests__/chat-contract-fixture.tsx');
    const { hasChatLayoutAnimation } = await import('/src/components/chat-scroll-container/chat-layout.ts');
    const flush = async (frames = 3) => {
      for (let i = 0; i < frames; i++) await new Promise(requestAnimationFrame);
    };
    const until = async (condition) => {
      const start = performance.now();
      while (!condition()) {
        if (performance.now() - start > 12000) throw new Error('Contract fixture timed out');
        await flush(1);
      }
    };
    const check = (value, message) => {
      if (!value) throw new Error(message);
    };
    const results = [];
    const mount = async () => {
      const fixture = mountChatContractFixture();
      await flush();
      return fixture;
    };
    const flights = (fixture) => [...fixture.element.querySelectorAll('[data-chat-send-flight]')];
    const viewport = (fixture) => fixture.element.querySelector('[data-slot="chat-scroll-viewport"]');
    const mode = (fixture) => fixture.states.at(-1)?.mode;
    const fire = (target, event) => {
      target.dispatchEvent(event);
      check(!event.defaultPrevented, 'Native input must not be prevented');
    };

    // Positive and negative input matrix: "any scroll cancels flight" is not the policy.
    for (const signal of ['up-wheel', 'pointer', 'key', 'down-wheel', 'zoom-wheel', 'scroll', 'layout-clamp']) {
      const fixture = await mount();
      try {
        fixture.send('first');
        fixture.send('second');
        await flush(2);
        check(flights(fixture).length === 2, 'Two flights exist before interruption');
        const v = viewport(fixture);
        if (signal === 'up-wheel') fire(v, new WheelEvent('wheel', { deltaY: -1, cancelable: true }));
        if (signal === 'down-wheel') fire(v, new WheelEvent('wheel', { deltaY: 1, cancelable: true }));
        if (signal === 'zoom-wheel') fire(v, new WheelEvent('wheel', { deltaY: -1, ctrlKey: true, cancelable: true }));
        if (signal === 'pointer') fire(v, new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        if (signal === 'key')
          fire(v, new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true }));
        if (signal === 'scroll') v.dispatchEvent(new Event('scroll'));
        if (signal === 'layout-clamp') {
          // Resize the viewport to shrink the native range without any user input.
          fixture.element.firstElementChild.style.height = '440px';
          await flush(2);
        }
        const cancelled = ['up-wheel', 'pointer', 'key'].includes(signal);
        check(flights(fixture).length === (cancelled ? 0 : 2), `${signal}: explicit cancellation policy`);
        for (const id of ['first', 'second']) {
          const body = v.querySelector(`[data-message-id="${id}"]`);
          check(
            getComputedStyle(body).visibility === (cancelled ? 'visible' : 'hidden'),
            `${signal}: real-node visibility`
          );
        }
        results.push(`flight input: ${signal}`);
      } finally {
        fixture.unmount();
      }
    }

    // Cancelling a captured-but-uncommitted departure must not resurrect it later.
    {
      const fixture = await mount();
      fixture.capture('pending');
      viewport(fixture).dispatchEvent(new WheelEvent('wheel', { deltaY: -1 }));
      fixture.update({ items: [...fixture.model.items, { id: 'pending', variant: 'outgoing', content: '1' }] });
      check(flights(fixture).length === 0, 'Cancelled pending departure cannot fly on a later commit');
      fixture.unmount();
      results.push('pending departure cancellation');
    }

    // Controlled native-position updates make the pointer lifecycle deterministic.
    for (const end of ['pointerup', 'pointercancel']) {
      const fixture = await mount();
      try {
        const v = viewport(fixture);
        v.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        v.scrollTop -= 8;
        v.dispatchEvent(new Event('scroll'));
        await flush();
        v.scrollTop = v.scrollHeight - v.clientHeight - 1;
        v.dispatchEvent(new Event('scroll'));
        await flush();
        check(mode(fixture) === 'detached', 'Held pointer cannot restore following inside the zone');
        const top = v.scrollTop;
        fixture.update({ items: [...fixture.model.items, { id: 'remote', variant: 'incoming', content: 'Hello.' }] });
        await flush(6);
        check(mode(fixture) === 'detached' && Math.abs(v.scrollTop - top) <= 1, 'Receive cannot steal a held pointer');
        await until(() => !v.querySelector('[data-chat-inserting]'));
        v.scrollTop = v.scrollHeight - v.clientHeight - 1;
        v.dispatchEvent(new Event('scroll'));
        await flush();
        const beforeRelease = v.scrollTop;
        window.dispatchEvent(new PointerEvent(end));
        await flush();
        check(
          mode(fixture) === 'following',
          `${end} restores eligibility after downward return: ${JSON.stringify({ states: fixture.states.slice(-5), top: v.scrollTop, bottom: v.scrollHeight - v.clientHeight })}`
        );
        check(v.scrollTop === beforeRelease, 'Reattachment does not snap the remaining pixel');
        v.dispatchEvent(new PointerEvent('pointerdown'));
        window.dispatchEvent(new PointerEvent(end));
        await flush();
        check(mode(fixture) === 'detached', 'A release without downward movement does not restore following');
        results.push(`pointer lifecycle: ${end}`);
      } finally {
        fixture.unmount();
      }
    }

    // Same-commit typing off only transfers its footprint to the adjacent appended reply.
    for (const kind of ['history', 'batch', 'date-before-reply']) {
      const fixture = await mount();
      try {
        fixture.update({ typing: true });
        await until(() => fixture.element.querySelector('[data-slot="chat-typing-row"]'));
        const v = viewport(fixture);
        const typing = v.querySelector('[data-slot="typing-bubble"]');
        // A nonzero partial footprint makes transfer assertions meaningful.
        await until(() => typing.parentElement.getBoundingClientRect().height >= 10);
        const oldHeight = typing.parentElement.getBoundingClientRect().height;
        const oldItems = fixture.model.items;
        const reply = { id: 'reply', variant: 'incoming', content: 'Hello.' };
        const items =
          kind === 'history'
            ? [...oldItems.slice(0, -1), reply, oldItems.at(-1)]
            : kind === 'batch'
              ? [...oldItems, reply, { ...reply, id: 'reply-2' }]
              : [...oldItems, { id: 'date', kind: 'date', dateTime: '2026-09-16', label: 'Today' }, reply];
        fixture.update({ items, typing: false });
        const replacement = v.querySelector('[data-slot="typing-replacement"]');
        const row = v.querySelector('[data-chat-row-id="reply"]');
        check(
          Boolean(replacement) === (kind === 'batch'),
          `${kind}: replacement stays at its original logical position`
        );
        check(
          Math.abs(row.getBoundingClientRect().height - (kind === 'batch' ? oldHeight : 0)) <= 1,
          `${kind}: correct footprint owner`
        );
        if (kind === 'batch')
          check(
            v.querySelector('[data-chat-row-id="reply-2"]').getBoundingClientRect().height === 0,
            'Only the first appended reply inherits typing'
          );
        await until(() => !v.querySelector('[data-slot="typing-bubble"], [data-chat-inserting]'));
        check(!hasChatLayoutAnimation(v), `${kind}: layout registration released`);
        results.push(`typing atomic update: ${kind}`);
      } finally {
        fixture.unmount();
      }
    }

    // Geometry contracts remain independent of flight timing or demo text.
    {
      const fixture = await mount();
      try {
        fixture.update({
          items: [
            { id: 'empty', variant: 'incoming', content: '' },
            { id: 'spaces', variant: 'outgoing', content: '  Hello  \n\n' },
          ],
          typing: true,
        });
        await until(() => fixture.element.querySelector('[data-slot="chat-typing-row"]'));
        const v = viewport(fixture),
          empty = v.querySelector('[data-message-id="empty"]'),
          spaces = v.querySelector('[data-message-id="spaces"]');
        check(
          empty.getBoundingClientRect().height === 33 && empty.getBoundingClientRect().width >= 38,
          'Empty bubble reserves a 33px body and minimum width'
        );
        check(spaces.textContent === '  Hello  \n\n', 'Leading/trailing whitespace survives');
        check(
          getComputedStyle(spaces.firstElementChild).whiteSpace === 'break-spaces',
          'Whitespace is rendered, not merely retained in the DOM'
        );
        check(
          fixture.element.querySelector('[data-slot="message-input"]').getBoundingClientRect().height === 35,
          'Composer independently keeps its 35px single-line height'
        );
        const typing = v.querySelector('[data-slot="typing-bubble"]');
        check(typing.getBoundingClientRect().height === 33, 'Typing layout matches the 33px message row');
        const dots = [...typing.querySelectorAll('*')].filter(
          (node) => getComputedStyle(node).animationName !== 'none'
        );
        check(dots.length > 0, 'Typing has a running dot loop');
        const durations = dots.map((node) => getComputedStyle(node).animationDuration);
        fixture.update({ speed: 0.1 });
        check(
          dots.every((node, index) => getComputedStyle(node).animationDuration === durations[index]),
          'Playback scaling does not slow the dots'
        );
        results.push('geometry, whitespace, independent typing loop');
      } finally {
        fixture.unmount();
      }
    }

    // Removal/unmount must release overlays, geometry registrations, and future writes.
    {
      const fixture = await mount();
      const v = viewport(fixture);
      fixture.send('remove');
      await flush(2);
      fixture.update({ items: fixture.model.items.filter((item) => item.id !== 'remove') });
      await flush(3);
      check(flights(fixture).length === 0, 'Removing a flight target releases its overlay');
      fixture.send('unmount');
      await flush(2);
      let writes = 0;
      const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
      Object.defineProperty(v, 'scrollTop', {
        configurable: true,
        get() {
          return descriptor.get.call(v);
        },
        set(value) {
          writes++;
          descriptor.set.call(v, value);
        },
      });
      fixture.unmount();
      const count = fixture.states.length,
        beforeWrites = writes;
      v.dispatchEvent(new WheelEvent('wheel', { deltaY: -1 }));
      window.dispatchEvent(new PointerEvent('pointerup'));
      // Outlast the 100ms flight delay scaled by 0.25x, as well as queued frame callbacks.
      await new Promise((resolve) => setTimeout(resolve, 600));
      await flush(8);
      check(
        !fixture.element.querySelector('[data-chat-send-flight]') && !hasChatLayoutAnimation(v),
        'Unmount releases flight and layout state'
      );
      check(fixture.states.length === count && writes === beforeWrites, 'Unmount leaves no callbacks or scroll writes');
      results.push('target removal and unmount cleanup');
    }
    return results;
  });
  for (const result of results) console.log(`PASS: ${result}`);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
