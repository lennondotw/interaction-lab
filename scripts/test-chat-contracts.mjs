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
    for (const signal of [
      'up-wheel',
      'pointer',
      'pointer-opt-in',
      'native-up',
      'key',
      'down-wheel',
      'zoom-wheel',
      'scroll',
      'layout-clamp',
    ]) {
      const fixture = await mount();
      try {
        if (signal === 'pointer-opt-in') fixture.update({ interruptOnPointerDown: true });
        fixture.send('first');
        fixture.send('second');
        await flush(2);
        check(flights(fixture).length === 2, 'Two flights exist before interruption');
        const v = viewport(fixture);
        if (signal === 'up-wheel') fire(v, new WheelEvent('wheel', { deltaY: -1, cancelable: true }));
        if (signal === 'down-wheel') fire(v, new WheelEvent('wheel', { deltaY: 1, cancelable: true }));
        if (signal === 'zoom-wheel') fire(v, new WheelEvent('wheel', { deltaY: -1, ctrlKey: true, cancelable: true }));
        if (signal === 'pointer' || signal === 'pointer-opt-in')
          fire(v, new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        if (signal === 'key')
          fire(v, new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true }));
        if (signal === 'scroll') v.dispatchEvent(new Event('scroll'));
        if (signal === 'native-up') {
          fire(v, new PointerEvent('pointerdown', { bubbles: true }));
          v.scrollTop -= 8;
          v.dispatchEvent(new Event('scroll'));
        }
        if (signal === 'layout-clamp') {
          // Resize the viewport to shrink the native range without any user input.
          fixture.element.firstElementChild.style.height = '440px';
          await flush(2);
        }
        const cancelled = ['up-wheel', 'pointer-opt-in', 'native-up', 'key'].includes(signal);
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
        fixture.update({ interruptOnPointerDown: true });
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

    // Native touch scrolling cancels the pointer before the fingers leave the screen.
    // Exercise event ownership explicitly; this is not an iOS gesture simulation.
    for (const end of ['touchend', 'touchcancel']) {
      const fixture = await mount();
      try {
        fixture.update({ threshold: 2 });
        const v = viewport(fixture);
        const first = new Touch({ identifier: 1, target: v });
        const second = new Touch({ identifier: 2, target: v });
        const touch = (type, changedTouches, touches) =>
          fire(v, new TouchEvent(type, { changedTouches, touches, bubbles: true, cancelable: true }));
        fire(v, new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
        touch('touchstart', [first], [first]);
        await flush();
        check(mode(fixture) === 'following', 'Ordinary touch contact does not interrupt following');
        window.dispatchEvent(new PointerEvent('pointercancel', { pointerType: 'touch' }));
        v.scrollTop -= 8;
        v.dispatchEvent(new Event('scroll'));
        await flush();
        check(mode(fixture) === 'detached', 'Actual upward touch scrolling still detaches');
        v.scrollTop = v.scrollHeight - v.clientHeight - 1;
        v.dispatchEvent(new Event('scroll'));
        fire(v, new WheelEvent('wheel', { deltaY: 1, cancelable: true }));
        await flush();
        check(mode(fixture) === 'detached', 'Pointer cancellation cannot release an active touch restoration gate');
        touch('touchstart', [second], [first, second]);
        touch(end, [first], [second]);
        await flush();
        check(mode(fixture) === 'detached', 'Ending one contact leaves the other touch active');
        const beforeRelease = v.scrollTop;
        touch(end, [second], []);
        await flush();
        check(mode(fixture) === 'following', 'Final touch release restores after the last downward movement');
        check(v.scrollTop === beforeRelease, 'Touch release does not snap the remaining pixel');

        fire(v, new WheelEvent('wheel', { deltaY: -1 }));
        // Touch-only input must also be tracked, and a tap must not invent downward intent.
        touch('touchstart', [first], [first]);
        touch(end, [first], []);
        await flush();
        check(mode(fixture) === 'detached', 'A touch-only tap cannot restore following');
        results.push(`touch lifecycle after pointer cancellation: ${end}`);
      } finally {
        fixture.unmount();
      }
    }

    // Reattachment is an intent event, not a side effect of proximity. Reuse the
    // same gate for a boundary wheel and native movement at both threshold sizes.
    for (const threshold of [2, 20]) {
      const fixture = await mount();
      try {
        fixture.update({ threshold });
        const v = viewport(fixture);
        const wheel = (deltaY, ctrlKey = false) =>
          fire(v, new WheelEvent('wheel', { deltaY, ctrlKey, cancelable: true }));
        const bottom = () => v.scrollHeight - v.clientHeight;
        for (const interruptOnPointerDown of [false, true]) {
          fixture.update({ interruptOnPointerDown });
          fire(v, new PointerEvent('pointerdown', { bubbles: true }));
          await flush();
          check(
            mode(fixture) === (interruptOnPointerDown ? 'detached' : 'following'),
            'Pointer policy is live and defaults to non-blocking'
          );
          if (interruptOnPointerDown) {
            wheel(1);
            await flush();
            check(mode(fixture) === 'detached', 'Downward boundary wheel cannot steal an active pointer');
          }
          window.dispatchEvent(new PointerEvent('pointerup'));
          await flush();
          check(
            mode(fixture) === (interruptOnPointerDown ? 'detached' : 'following'),
            'Click release alone never reacquires follow'
          );
          const top = v.scrollTop;
          wheel(1);
          await flush();
          check(
            mode(fixture) === 'following' && v.scrollTop === top,
            'Boundary wheel restores eligibility without movement'
          );
        }
        wheel(-1);
        await flush();
        check(mode(fixture) === 'detached', 'Upward input always escapes at the boundary');
        v.dispatchEvent(new Event('scroll'));
        wheel(1, true);
        await flush();
        check(mode(fixture) === 'detached', 'A scroll notification or zoom is not downward intent');
        for (const distance of [threshold + 1, 1]) {
          v.scrollTop = bottom() - distance;
          v.dispatchEvent(new Event('scroll'));
          wheel(-1);
          const top = v.scrollTop;
          wheel(1);
          await flush();
          check(
            mode(fixture) === (distance > threshold ? 'detached' : 'following'),
            'Wheel restoration respects configured threshold'
          );
          check(v.scrollTop === top, 'Restoration never snaps the remaining threshold pixels');
        }
        // Do not remember a downward wheel outside the zone for later layout changes.
        v.scrollTop = bottom() - 40;
        v.dispatchEvent(new Event('scroll'));
        wheel(1);
        fixture.update({ items: fixture.model.items.slice(0, -1) });
        await flush();
        check(mode(fixture) === 'detached', 'Layout proximity does not consume stale downward intent');
        fixture.send('catch-up');
        await flush(2);
        check(mode(fixture) === 'animating', 'Explicit local send starts catch-up');
        wheel(1);
        await flush();
        check(
          mode(fixture) !== 'animating',
          `Downward wheel cancels catch-up before native movement: ${JSON.stringify({ threshold, states: fixture.states.slice(-6), top: v.scrollTop, bottom: bottom() })}`
        );
        check(flights(fixture).length === 0, 'Downward catch-up interruption releases flight');
        results.push(`pointer policy and boundary restoration: ${threshold}px`);
      } finally {
        fixture.unmount();
      }
    }

    // Wheel is intent before native movement, not a scroll-position notification.
    // Keep delayed scroll delivery separate from stopping the old spring.
    for (const boundary of [false, true]) {
      const fixture = await mount();
      try {
        fixture.update({ threshold: 2 });
        const v = viewport(fixture);
        v.scrollTop -= 250;
        v.dispatchEvent(new Event('scroll'));
        fixture.send('wheel-takeover');
        await flush(2);
        check(mode(fixture) === 'animating', 'Takeover starts with active catch-up');
        fire(v, new WheelEvent('wheel', { deltaY: 20, ctrlKey: true, cancelable: true }));
        fire(v, new WheelEvent('wheel', { deltaX: 20, deltaY: 0, cancelable: true }));
        await flush(2);
        check(
          mode(fixture) === 'animating' && flights(fixture).length === 1,
          'Zoom and horizontal wheel preserve catch-up'
        );
        if (boundary) v.scrollTop = v.scrollHeight - v.clientHeight - 1;
        const beforeWheel = v.scrollTop;
        fire(v, new WheelEvent('wheel', { deltaY: 20, cancelable: true }));
        check(v.scrollTop === beforeWheel, 'Wheel takeover and restoration do not write position');
        check(flights(fixture).length === 0, 'Takeover synchronously releases the visual copy');
        check(hasChatLayoutAnimation(v), 'Takeover leaves the message layout animation running');
        if (!boundary) v.scrollTop += 20;
        const nativeTop = v.scrollTop;
        // Let both the old catch-up clock and independent slot finish. Real native
        // scroll events may be delivered before our explicit delayed notification.
        for (let i = 0; i < 150; i++) {
          await flush(1);
          if (i === 2) v.dispatchEvent(new Event('scroll'));
          check(
            mode(fixture) === (boundary ? 'following' : 'detached'),
            'Cancelled catch-up cannot regain state ownership'
          );
          if (!boundary) check(Math.abs(v.scrollTop - nativeTop) <= 1, 'Old spring cannot pull native movement back');
        }
        check(!hasChatLayoutAnimation(v), 'Message layout completes independently of wheel takeover');
        if (!boundary) {
          v.scrollTop = v.scrollHeight - v.clientHeight - 1;
          const returnedTop = v.scrollTop;
          v.dispatchEvent(new Event('scroll'));
          await flush();
          check(mode(fixture) === 'following', 'Later native downward return restores inside 2px');
          check(v.scrollTop === returnedTop, 'Native return restoration does not snap');
        }
        results.push(`downward catch-up takeover: ${boundary ? 'inside' : 'outside'} 2px`);
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
  // Real wheel input must advance the viewport without a subsequent spring rollback.
  await page.evaluate(async () => {
    const { mountChatContractFixture } =
      await import('/src/components/chat-scroll-container/__tests__/chat-contract-fixture.tsx');
    window.wheelFixture = mountChatContractFixture();
  });
  await page.waitForFunction(() => window.wheelFixture.states.at(-1)?.mode === 'following');
  const wheelView = page.locator('[data-chat-contract-fixture] [data-slot="chat-scroll-viewport"]');
  const wheelRect = await wheelView.boundingBox();
  await page.mouse.move(wheelRect.x + 20, wheelRect.y + 20);
  await page.mouse.wheel(0, -250);
  await page.waitForFunction(() => window.wheelFixture.states.at(-1)?.mode === 'detached');
  await page.evaluate(() => window.wheelFixture.send('native-wheel'));
  await page.waitForFunction(() => window.wheelFixture.states.at(-1)?.mode === 'animating');
  const beforeNativeWheel = await wheelView.evaluate((v) => v.scrollTop);
  await page.mouse.wheel(0, 20);
  await page.waitForFunction(() => window.wheelFixture.states.at(-1)?.mode === 'detached');
  await page.waitForFunction((top) => {
    return window.wheelFixture.element.querySelector('[data-slot="chat-scroll-viewport"]').scrollTop > top;
  }, beforeNativeWheel);
  await page.evaluate(async () => {
    const fixture = window.wheelFixture;
    const v = fixture.element.querySelector('[data-slot="chat-scroll-viewport"]');
    let previous = v.scrollTop;
    for (let i = 0; i < 150; i++) {
      await new Promise(requestAnimationFrame);
      if (v.scrollTop < previous - 1 || fixture.states.at(-1)?.mode !== 'detached') {
        throw new Error('Native downward wheel was overwritten by catch-up');
      }
      previous = v.scrollTop;
    }
    if (fixture.element.querySelector('[data-chat-send-flight]')) throw new Error('Native wheel left a flight copy');
    fixture.unmount();
    delete window.wheelFixture;
  });
  console.log('PASS: real downward wheel takes over catch-up without rollback');
  // Real pointer input verifies that both composed stories wire the shared policy
  // to follow and flight, rather than only exercising synthetic controller branches.
  for (const interrupt of [false, true]) {
    const story = interrupt ? 'interrupt-on-pointer-down' : 'with-message-input';
    await page.goto(`${base}/iframe.html?id=components-chat-scroll-container--${story}&viewMode=story`);
    await page.getByText('0.1×', { exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#storybook-root strong')?.textContent === 'following');
    await page.locator('textarea').fill('A quiet afternoon.');
    await page.evaluate(() => document.querySelector('form').requestSubmit());
    await page.waitForSelector('[data-chat-send-flight]');
    const view = page.locator('[data-slot="chat-scroll-viewport"]');
    const rect = await view.boundingBox();
    await page.mouse.move(rect.x + 4, rect.y + 4);
    await page.mouse.down();
    await page.waitForFunction(
      (mode) => document.querySelector('#storybook-root strong')?.textContent === mode,
      interrupt ? 'detached' : 'following'
    );
    assert.equal(await page.locator('[data-chat-send-flight]').count(), interrupt ? 0 : 1);
    await page.mouse.up();
    if (interrupt) {
      await page.mouse.wheel(0, 1);
      await page.waitForFunction(() => document.querySelector('#storybook-root strong')?.textContent === 'following');
    }
    await page.mouse.wheel(0, -8);
    await page.waitForFunction(() => document.querySelector('#storybook-root strong')?.textContent === 'detached');
    assert.equal(await page.locator('[data-chat-send-flight]').count(), 0);
    console.log(`PASS: real story pointer policy ${interrupt}`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
