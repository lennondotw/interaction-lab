/** Touch ownership and cancellation, plus a real Chromium fling. Local full suite only. */
import assert from 'node:assert/strict';

import { chromium } from 'playwright';

const browser = await chromium.launch();
const base = process.env.STORYBOOK_URL ?? 'http://localhost:6009';
try {
  const page = await browser.newPage({ viewport: { width: 430, height: 1000 }, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const url = `${base}/iframe.html?id=components-chat-scroll-container--with-message-input&viewMode=story&reactScan=false`;
  await page.goto(url);
  await page.locator('[data-slot="chat-scroll-viewport"]').waitFor();
  const results = await page.evaluate(async () => {
    const { createScrollAnchorController } = await import('/src/components/scroll-anchor/scroll-anchor-controller.ts');
    const flush = async (n = 3) => {
      for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame);
    };
    const check = (value, message) => {
      if (!value) throw Error(message);
    };
    const results = [];
    const mount = async (interruptOnMouseDown = false, reducedMotion = false) => {
      const v = document.createElement('div');
      v.style.cssText = 'position:fixed;top:0;left:0;width:200px;height:200px;overflow:auto;overflow-anchor:none';
      // Preserve an existing inline value and priority through every cancellation path.
      v.style.setProperty('overflow-y', 'scroll', 'important');
      const content = document.createElement('div');
      content.style.cssText = 'height:2000px;padding:0';
      v.append(content);
      document.body.append(v);
      let state;
      const c = createScrollAnchorController(v, content, {
        threshold: 2,
        reducedMotion,
        animationSpeed: 1,
        interruptOnMouseDown,
        onStateChange: (next) => {
          state = next;
        },
      });
      await flush();
      const touch = (type) => {
        const point = new Touch({ identifier: 1, target: v });
        const event = new TouchEvent(type, {
          changedTouches: [point],
          touches: type === 'touchend' ? [] : [point],
          bubbles: true,
          cancelable: true,
        });
        v.dispatchEvent(event);
        check(!event.defaultPrevented, 'Touch defaults remain native');
      };
      const away = () => {
        v.scrollTop -= 500;
        v.dispatchEvent(new Event('scroll'));
      };
      const arm = () => {
        touch('touchstart');
        touch('touchmove');
        touch('touchend');
        // Browser geometry advances before its queued scroll notification.
        v.scrollTop -= 10;
        c.scrollToBottom();
        check(v.style.overflowY === 'hidden', 'Released touch movement requires native takeover');
        v.dispatchEvent(new Event('scroll'));
      };
      const restored = () =>
        check(
          v.style.overflowY === 'scroll' && v.style.getPropertyPriority('overflow-y') === 'important',
          'Restore exact inline overflow and priority'
        );
      return {
        v,
        c,
        content,
        touch,
        away,
        arm,
        restored,
        state: () => state,
        destroy: () => {
          c.dispose();
          v.remove();
        },
      };
    };
    for (const optIn of [false, true])
      for (const pointerType of ['mouse', 'touch', 'pen', 'touch-only']) {
        const f = await mount(optIn);
        try {
          const press = () =>
            pointerType === 'touch-only'
              ? f.touch('touchstart')
              : f.v.dispatchEvent(new PointerEvent('pointerdown', { pointerType, bubbles: true }));
          press();
          await flush();
          check(
            f.state().mode === (pointerType === 'mouse' && optIn ? 'detached' : 'following'),
            `${pointerType}: contact policy while following`
          );
          window.dispatchEvent(new PointerEvent('pointerup'));
          if (pointerType === 'touch-only') f.touch('touchend');
          f.away();
          f.c.scrollToBottom();
          await flush();
          check(f.state().mode === 'animating', 'Spring started before contact');
          press();
          await flush();
          const interrupts = pointerType.startsWith('touch') || (pointerType === 'mouse' && optIn);
          check(
            f.state().mode === (interrupts ? 'detached' : 'animating'),
            `${pointerType}: catch-up contact policy with opt-in ${optIn}`
          );
          if (pointerType === 'pen') {
            f.v.scrollTop -= 10;
            f.v.dispatchEvent(new Event('scroll'));
            await flush();
            check(f.state().mode === 'detached', 'Pen native upward movement still detaches');
          }
          results.push(`contact ${pointerType}, mouse opt-in ${optIn}`);
        } finally {
          f.destroy();
        }
      }
    for (const action of [
      'complete',
      'touch',
      'wheel-up',
      'wheel-down',
      'key',
      'supersede',
      'dispose',
      'reduced-motion',
      'send',
      'late-scroll',
      'pen-scroll',
    ]) {
      const f = await mount(false, action === 'reduced-motion');
      try {
        f.away();
        f.arm();
        // A concurrent layout update must not bypass the pending takeover.
        f.content.style.height = '2100px';
        f.c.layoutChanged();
        if (action === 'touch') f.touch('touchstart');
        if (action.startsWith('wheel'))
          f.v.dispatchEvent(new WheelEvent('wheel', { deltaY: action === 'wheel-up' ? -1 : 1 }));
        if (action === 'key') f.v.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp' }));
        if (action === 'dispose') f.c.dispose();
        if (action === 'supersede') f.c.scrollToBottom();
        if (action === 'send') f.c.layoutChanged({ follow: true });
        if (action === 'late-scroll' || action === 'pen-scroll') {
          await flush(3);
          if (action === 'pen-scroll') f.v.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'pen' }));
          f.v.scrollTop -= 9;
          f.v.dispatchEvent(new Event('scroll'));
        }
        const cancelled = ['pen-scroll', 'touch', 'wheel-up', 'wheel-down', 'key', 'dispose'].includes(action);
        if (cancelled) f.restored();
        const stoppedTop = f.v.scrollTop;
        await flush(6);
        f.restored();
        if (cancelled) {
          check(f.v.scrollTop === stoppedTop, `${action}: cancelled callbacks cannot resume scrolling`);
          if (action !== 'dispose') check(f.state().mode === 'detached', `${action}: remains detached`);
        } else {
          const deadline = performance.now() + 3000;
          while (f.state().mode !== 'following' && performance.now() < deadline) await flush(1);
          check(
            f.state().mode === 'following' && f.v.scrollTop === f.v.scrollHeight - f.v.clientHeight,
            `${action}: reaches current bottom`
          );
        }
        results.push(`pending takeover: ${action}`);
      } finally {
        f.destroy();
      }
    }
    // Tap and settled scroll do not incur a takeover delay on later commands.
    for (const settled of [false, true]) {
      const f = await mount();
      try {
        f.away();
        f.touch('touchstart');
        if (settled) f.touch('touchmove');
        f.touch('touchend');
        if (settled) f.v.dispatchEvent(new Event('scrollend'));
        f.c.scrollToBottom();
        f.restored();
        results.push(settled ? 'settled gesture has no takeover' : 'tap has no takeover');
      } finally {
        f.destroy();
      }
    }
    // Chromium clamps scrollTop instead of exposing Safari's elastic coordinates.
    // Supply raw overscroll values to test classification; native bounce evidence
    // is recorded separately on iOS, not claimed by this deterministic fixture.
    for (const initialMode of ['following', 'detached']) {
      const f = await mount();
      try {
        const bottom = f.v.scrollHeight - f.v.clientHeight;
        let rawTop = bottom;
        let writes = 0;
        Object.defineProperty(f.v, 'scrollTop', {
          configurable: true,
          get: () => rawTop,
          set: (value) => {
            writes++;
            rawTop = value;
          },
        });
        if (initialMode === 'detached') f.v.dispatchEvent(new WheelEvent('wheel', { deltaY: -1 }));
        f.touch('touchstart');
        f.touch('touchmove');
        f.touch('touchend');
        // Already satisfied, even with unsettled native touch movement.
        f.c.scrollToBottom();
        await flush();
        check(writes === 0 && f.state().mode === 'following', 'At-bottom command only establishes intent');
        f.restored();
        rawTop = bottom + 60;
        f.v.dispatchEvent(new Event('scroll'));
        f.c.scrollToBottom();
        for (const excess of [50, 35, 20, 5, 0]) {
          rawTop = bottom + excess;
          f.v.dispatchEvent(new Event('scroll'));
          await flush(1);
          f.restored();
          check(f.state().mode === 'following' && writes === 0, 'Bounce remains native and never detaches following');
        }
        // A new touch keeps following until movement genuinely enters history.
        f.touch('touchstart');
        rawTop = bottom - 5;
        f.v.dispatchEvent(new Event('scroll'));
        await flush();
        check(f.state().mode === 'detached' && writes === 0, 'Upward escape remains available after bounce');
        results.push(`satisfied command and native rebound from ${initialMode}`);
      } finally {
        f.destroy();
      }
    }
    for (const scenario of ['projected-target', 'inside-2px-zone', 'within-target-tolerance']) {
      const f = await mount();
      let unregister = () => {};
      try {
        const bottom = f.v.scrollHeight - f.v.clientHeight;
        let rawTop =
          scenario === 'projected-target' ? bottom + 60 : bottom - (scenario === 'inside-2px-zone' ? 1 : 0.25);
        let writes = 0;
        Object.defineProperty(f.v, 'scrollTop', {
          configurable: true,
          get: () => rawTop,
          set: (value) => {
            writes++;
            rawTop = value;
          },
        });
        f.touch('touchstart');
        f.touch('touchmove');
        f.touch('touchend');
        if (scenario === 'projected-target') {
          const { registerChatTransition } = await import('/src/components/chat-scroll-container/chat-layout.ts');
          unregister = registerChatTransition(f.v, { row: f.content, remaining: 30, gapRemaining: 0 });
        }
        f.c.scrollToBottom();
        if (scenario === 'within-target-tolerance') {
          await flush();
          f.restored();
          check(
            writes === 0 && rawTop === bottom - 0.25 && f.state().mode === 'following',
            'Target tolerance grants intent without snapping'
          );
        } else {
          check(
            f.v.style.overflowY === 'hidden',
            'Overscroll cannot satisfy projected growth; the 2px zone is not arrival'
          );
          unregister();
          f.content.style.height = '2030px';
          f.c.layoutChanged();
          const deadline = performance.now() + 3000;
          do {
            await flush(1);
          } while (f.state().mode !== 'following' && performance.now() < deadline);
          check(
            writes > 0 && rawTop === f.v.scrollHeight - f.v.clientHeight && f.state().mode === 'following',
            'Unsatisfied destination still converges to final bottom'
          );
        }
        results.push(`bottom eligibility: ${scenario}`);
      } finally {
        unregister();
        f.destroy();
      }
    }
    return results;
  });
  for (const result of results) console.log(`PASS: ${result}`);

  // Actual native inertia, not synthetic DOM scroll: same RED path as the research probe.
  const cdp = await page.context().newCDPSession(page);
  for (const trigger of ['command', 'native-tap', 'native-reduced']) {
    await page.emulateMedia({ reducedMotion: trigger === 'native-reduced' ? 'reduce' : 'no-preference' });
    await page.goto(url);
    const v = page.locator('[data-slot="chat-scroll-viewport"]');
    await v.waitFor();
    await page.getByText('following', { exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const button = page.getByRole('button', { name: 'Scroll to bottom', exact: true });
    if (trigger.startsWith('native-')) {
      const b = await button.boundingBox();
      await page.exposeFunction(`nativeBottomTap${trigger.replaceAll('-', '')}`, async () => {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }],
        });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      });
    }
    await page.evaluate((trigger) => {
      const v = document.querySelector('[data-slot="chat-scroll-viewport"]');
      window.commandSeen = false;
      const button = [...document.querySelectorAll('button')].find((e) => e.textContent === 'Scroll to bottom');
      button.addEventListener('click', () => {
        window.commandSeen = true;
      });
      v.addEventListener(
        'touchend',
        () =>
          setTimeout(() => {
            if (trigger.startsWith('native-')) window[`nativeBottomTap${trigger.replaceAll('-', '')}`]();
            else button.click();
          }, 80),
        { once: true }
      );
    }, trigger);
    const box = await v.boundingBox();
    await cdp.send('Input.synthesizeScrollGesture', {
      x: box.x + 160,
      y: box.y + 60,
      yDistance: 190,
      speed: 1600,
      gestureSourceType: 'touch',
      preventFling: false,
    });
    await page
      .waitForFunction(
        () => {
          const v = document.querySelector('[data-slot="chat-scroll-viewport"]');
          return (
            window.commandSeen &&
            Math.abs(v.scrollHeight - v.clientHeight - v.scrollTop) <= 1 &&
            [...document.querySelectorAll('strong')].some((e) => e.textContent === 'following')
          );
        },
        null,
        { timeout: 5000 }
      )
      .catch(async (error) => {
        const diagnostic = await page.evaluate(() => {
          const v = document.querySelector('[data-slot="chat-scroll-viewport"]');
          return {
            commandSeen: window.commandSeen,
            top: v.scrollTop,
            bottom: v.scrollHeight - v.clientHeight,
            overflow: v.style.overflowY,
            text: document.body.innerText.slice(-650),
          };
        });
        throw new Error(`${trigger}: ${JSON.stringify(diagnostic)}`, { cause: error });
      });
    await page.evaluate(async () => {
      const v = document.querySelector('[data-slot="chat-scroll-viewport"]');
      for (let i = 0; i < 30; i++) {
        await new Promise(requestAnimationFrame);
        if (Math.abs(v.scrollHeight - v.clientHeight - v.scrollTop) > 1)
          throw Error('Residual inertia moved away after catch-up');
      }
    });
    console.log(`PASS: native fling → ${trigger} → stable bottom`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
