/** Layout/scroll event ordering must preserve follow intent without masking user escape. */
import assert from 'node:assert/strict';

import { chromium } from 'playwright';

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 900 },
    deviceScaleFactor: 3,
    reducedMotion: 'no-preference',
  });
  await page.goto(
    `${process.env.STORYBOOK_URL ?? 'http://localhost:6010'}/iframe.html?id=components-chat-scroll-container--automatic-replies&viewMode=story&reactScan=false`
  );
  await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor();
  const results = await page.evaluate(async () => {
    const { createChatScrollController } =
      await import('/src/components/chat-scroll-container/chat-scroll-controller.ts');
    const { registerChatTransition } = await import('/src/components/chat-scroll-container/chat-layout.ts');
    const flush = async () => {
      for (let frame = 0; frame < 3; frame++) await new Promise(requestAnimationFrame);
    };
    const results = [];
    for (const order of ['layout-first', 'scroll-first']) {
      for (const fractional of [false, true]) {
        const viewport = document.createElement('div');
        viewport.style.cssText =
          'position:fixed;left:0;top:0;width:100px;height:100px;overflow:auto;overflow-anchor:none;zoom:2';
        const content = document.createElement('div');
        content.style.cssText = 'height:500px;padding:0';
        viewport.append(content);
        document.body.append(viewport);
        const states = [];
        const controller = createChatScrollController(viewport, content, {
          threshold: 20,
          reducedMotion: false,
          animationSpeed: 0.25,
          onStateChange: (state) => states.push(state),
        });
        let unregister = () => {};
        try {
          await flush();
          // A projected destination keeps the spring animating even while the
          // current DOM reaches its shorter boundary (typing replacement case).
          unregister = registerChatTransition(viewport, { row: content, remaining: 100, gapRemaining: 0 });
          // A followed local send now tracks layout directly. Use the explicit
          // bottom command to exercise clamping during an active catch-up spring.
          controller.scrollToBottom();
          const before = { top: viewport.scrollTop, height: viewport.scrollHeight };
          content.style.height = fractional ? '499.5px' : '450px';
          const clamped = { top: viewport.scrollTop, height: viewport.scrollHeight };
          const layout = () => controller.contentChanged(false, { animatedLayout: true });
          const scroll = () => viewport.dispatchEvent(new Event('scroll'));
          if (order === 'layout-first') {
            layout();
            scroll();
          } else {
            scroll();
            layout();
          }
          // Repeated notifications must not consume ownership prematurely.
          layout();
          scroll();
          scroll();
          await flush();
          const afterClamp = states.at(-1);
          const detachedDuringClamp = states.some((state) => state.mode === 'detached');

          // Shrink and genuine unowned upward movement in the same turn: the
          // position is away from the new boundary, so layout must not mask it.
          content.style.height = fractional ? '480px' : '440px';
          viewport.scrollTop -= 20;
          layout();
          scroll();
          await flush();
          const afterUserMovement = states.at(-1);
          const escapedTop = viewport.scrollTop;
          layout();
          scroll();
          await flush();
          const stayedDetached = states.at(-1).mode === 'detached' && viewport.scrollTop === escapedTop;

          // A subpixel upward movement away from the boundary is still user
          // movement even if the content shrinks in the same turn.
          controller.contentChanged(true);
          content.style.height = fractional ? '479.5px' : '439.5px';
          viewport.scrollTop -= 0.5;
          layout();
          scroll();
          await flush();
          const afterTinyMovement = states.at(-1);

          // Even a one-pixel upward wheel interrupts an active spring immediately.
          controller.contentChanged(true);
          viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: -1 }));
          await flush();
          const afterWheel = states.at(-1);
          // Native clamping while detached never opts the reader back into follow.
          content.style.height = '250px';
          layout();
          scroll();
          await flush();
          results.push({
            order,
            fractional,
            before,
            clamped,
            afterClamp: afterClamp.mode,
            detachedDuringClamp,
            afterUserMovement: afterUserMovement.mode,
            afterTinyMovement: afterTinyMovement.mode,
            stayedDetached,
            afterWheel: afterWheel.mode,
            afterDetachedClamp: states.at(-1).mode,
          });
        } finally {
          unregister();
          controller.dispose();
          viewport.remove();
        }
      }
    }
    return results;
  });
  for (const result of results) {
    assert.ok(result.clamped.top < result.before.top, JSON.stringify(result));
    if (result.fractional) assert.equal(result.clamped.height, result.before.height);
    assert.equal(result.afterClamp, 'animating', JSON.stringify(result));
    assert.equal(result.detachedDuringClamp, false, JSON.stringify(result));
    assert.equal(result.afterUserMovement, 'detached', JSON.stringify(result));
    assert.equal(result.stayedDetached, true, JSON.stringify(result));
    assert.equal(result.afterTinyMovement, 'detached', JSON.stringify(result));
    assert.equal(result.afterWheel, 'detached', JSON.stringify(result));
    assert.equal(result.afterDetachedClamp, 'detached', JSON.stringify(result));
  }
  // Full reported sequence: fresh page, slow flight, interrupt the first send,
  // then send while its typing/reply layout is still changing. No rescue scroll.
  await page.setViewportSize({ width: 390, height: 647 });
  await page.reload();
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.waitFor();
  await page.getByRole('button', { name: '0.25×', exact: true }).click();
  const viewport = page.locator('[data-slot="chat-scroll-viewport"]');
  await page.waitForFunction(() => {
    const v = document.querySelector('[data-slot="chat-scroll-viewport"]');
    return v.scrollHeight - v.clientHeight - v.scrollTop <= 1;
  });
  await input.fill('Hey!');
  await input.press('Enter');
  await viewport.hover();
  await page.mouse.wheel(0, -100);
  await page.waitForFunction(() => {
    const v = document.querySelector('[data-slot="chat-scroll-viewport"]');
    return v.scrollHeight - v.clientHeight - v.scrollTop > 20;
  });
  const bullets = '- Good coffee\n- A quiet table outside\n- A walk by the park afterward';
  await input.fill(bullets);
  await input.press('Enter');
  await page.waitForFunction(
    () => {
      const v = document.querySelector('[data-slot="chat-scroll-viewport"]');
      return (
        [...v.querySelectorAll('[data-message-id]')].at(-1)?.textContent ===
          'There is a quiet place by the park with really good coffee.' &&
        !document.querySelector('[data-chat-send-flight], [data-chat-inserting], [data-slot="typing-bubble"]')
      );
    },
    null,
    { timeout: 15000 }
  );
  // Visual/layout handoff can finish before the independent catch-up spring.
  // Verify eventual arrival without using another gesture to rescue scrolling.
  await page.waitForFunction(
    () => {
      const v = document.querySelector('[data-slot="chat-scroll-viewport"]');
      return Math.abs(v.scrollHeight - v.clientHeight - v.scrollTop) <= 0.5;
    },
    null,
    { timeout: 5000 }
  );
  assert.ok(await viewport.evaluate((v) => v.scrollHeight - v.clientHeight - v.scrollTop <= 1));
  const lastOutgoing = viewport.locator('[data-message-id][data-variant="outgoing"]').last();
  assert.equal(await lastOutgoing.textContent(), bullets);
  assert.equal(await lastOutgoing.evaluate((e) => getComputedStyle(e).visibility), 'visible');
  await page.screenshot({ path: '/tmp/chat-scroll-ownership-fixed.png' });
  console.log('PASS: interrupted Hey + bullet send settles without another gesture.');
  console.log(
    'PASS: both callback orders, fractional/integer clamps during animation, duplicate notifications, user movement during resize, wheel escape, detached clamps.'
  );
} finally {
  await browser.close();
}
