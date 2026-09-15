/** Browser regression checks for chat follow, escape, and local-send policies. Requires Storybook. */
import assert from 'node:assert/strict';

import { chromium } from 'playwright';

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, reducedMotion: 'no-preference' });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(
    `${process.env.STORYBOOK_URL ?? 'http://localhost:6009'}/iframe.html?id=components-chat-scroll-container--send-messages&viewMode=story`
  );
  const viewport = page.locator('[data-slot="chat-scroll-viewport"]');
  const mode = page.locator('#storybook-root strong');
  const receive = page.getByRole('button', { name: 'Receive a message', exact: true });
  const send = page.getByRole('button', { name: 'Send a message', exact: true });
  const geometry = () =>
    viewport.evaluate((element) => ({
      top: element.scrollTop,
      distance: element.scrollHeight - element.clientHeight - element.scrollTop,
    }));
  async function waitMode(expected) {
    await page.waitForFunction(
      (value) => document.querySelector('#storybook-root strong')?.textContent === value,
      expected
    );
  }
  async function wheel(delta) {
    await viewport.hover();
    await page.mouse.wheel(0, delta);
  }
  async function settle() {
    await waitMode('following');
    await page.waitForFunction(() => {
      const element = document.querySelector('[data-slot="chat-scroll-viewport"]');
      return (
        !element.querySelector('[data-chat-inserting]') &&
        element.scrollHeight - element.clientHeight - element.scrollTop < 1
      );
    });
  }

  await settle();
  // A zoomed browser can clamp scrollTop by half a CSS pixel while its integer
  // scrollHeight stays unchanged. This must remain a layout-owned scroll.
  const fractionalClamp = await page.evaluate(async () => {
    const { createChatScrollController } =
      await import('/src/components/chat-scroll-container/chat-scroll-controller.ts');
    const viewport = document.createElement('div');
    viewport.style.cssText =
      'position:fixed;inset:0 auto auto 0;width:100px;height:100px;overflow:auto;overflow-anchor:none;zoom:2';
    const content = document.createElement('div');
    content.style.cssText = 'height:200px;padding-bottom:0';
    viewport.append(content);
    document.body.append(viewport);
    const modes = [];
    const controller = createChatScrollController(viewport, content, {
      threshold: 20,
      reducedMotion: false,
      animationSpeed: 1,
      onStateChange: (state) => modes.push(state.mode),
    });
    const flush = async () => {
      for (let frame = 0; frame < 3; frame++) await new Promise(requestAnimationFrame);
    };
    try {
      await flush();
      const before = { top: viewport.scrollTop, height: viewport.scrollHeight };
      content.style.height = '199.5px';
      controller.contentChanged(false, { animatedLayout: true });
      await flush();
      return { before, after: { top: viewport.scrollTop, height: viewport.scrollHeight }, modes };
    } finally {
      controller.dispose();
      viewport.remove();
    }
  });
  assert.equal(fractionalClamp.after.height, fractionalClamp.before.height);
  assert.equal(fractionalClamp.before.top - fractionalClamp.after.top, 0.5);
  assert.ok(fractionalClamp.modes.length > 1);
  assert.ok(
    fractionalClamp.modes.every((mode) => mode === 'following'),
    'Fractional collapse retains following'
  );

  // Sends without a composer paint a full-size visual outside the layout surface.
  await page.getByText('0.25×', { exact: true }).click();
  await send.click();
  await viewport.locator('[data-chat-inserting]').waitFor({ state: 'attached' });
  const sendVisual = await viewport.evaluate((viewport) => {
    const row = viewport.querySelector('[data-chat-inserting]');
    const bubble = row.querySelector('[data-message-id]');
    const visual = viewport.parentElement.querySelector('[data-chat-entrance]');
    return {
      overflow: getComputedStyle(row).overflow,
      slotHeight: row.getBoundingClientRect().height,
      bodyHeight: bubble.getBoundingClientRect().height,
      topGap: bubble.getBoundingClientRect().top - row.getBoundingClientRect().top,
      sourceHidden: getComputedStyle(bubble).visibility === 'hidden',
      visualHeight: visual?.getBoundingClientRect().height,
      visualOutsideScroller: visual != null && !viewport.contains(visual),
    };
  });
  assert.equal(sendVisual.overflow, 'visible');
  assert.ok(sendVisual.slotHeight < sendVisual.bodyHeight);
  assert.equal(sendVisual.topGap, 3, 'Bubble stays at the top of its slot after the same-group gap');
  assert.ok(sendVisual.sourceHidden && sendVisual.visualOutsideScroller);
  assert.equal(sendVisual.visualHeight, sendVisual.bodyHeight, 'Full bubble height is independent of slot height');
  await settle();
  await page.locator('[data-chat-entrance]').waitFor({ state: 'detached' });
  await page.getByText('1×', { exact: true }).click();

  await receive.click();
  await viewport.locator('[data-chat-inserting]').waitFor({ state: 'attached' });
  assert.equal(await mode.textContent(), 'following', 'Settled following uses the expanding layout directly');
  assert.ok((await geometry()).distance <= 1, 'The current layout remains pinned throughout entry');
  await settle();

  await wheel(-5);
  await waitMode('detached');
  await page.waitForTimeout(120);
  const near = await geometry();
  assert.ok(near.distance > 0 && near.distance < 20, 'Escape succeeds inside the threshold');
  await page.waitForTimeout(350);
  assert.equal(await mode.textContent(), 'detached', 'No automatic reattachment while still near bottom');
  await wheel(2);
  await waitMode('following');
  assert.ok((await geometry()).distance > 0, 'Reattaching does not snap the remaining gap');

  await wheel(-180);
  await waitMode('detached');
  await page.waitForTimeout(150);
  const beforeRemote = await geometry();
  await receive.click();
  await page.waitForTimeout(700);
  assert.equal(await mode.textContent(), 'detached');
  assert.ok(Math.abs((await geometry()).top - beforeRemote.top) < 1, 'Remote messages preserve history position');

  await send.click();
  await waitMode('animating');
  await settle();

  // A long local catch-up is interrupted before completion, then must stay stopped.
  await wheel(-500);
  await waitMode('detached');
  await page.waitForTimeout(150);
  await send.click();
  await waitMode('animating');
  await wheel(-5);
  await waitMode('detached');
  await page.waitForTimeout(120);
  const stopped = await geometry();
  await page.waitForTimeout(800);
  assert.equal(await mode.textContent(), 'detached');
  assert.ok(
    Math.abs((await geometry()).top - stopped.top) < 1,
    'Cancelled spring and completion cannot pull the user back'
  );

  await send.click();
  await waitMode('animating');
  await receive.click();
  await receive.click();
  await receive.click();
  await settle();
  await page.getByRole('group', { name: 'Bottom zone' }).getByRole('button', { name: '2 px', exact: true }).click();
  await wheel(-1);
  await waitMode('detached');
  await page.waitForTimeout(150);
  assert.ok((await geometry()).distance <= 2, 'One pixel escape works with the production threshold');
  await receive.click();
  await page.waitForTimeout(600);
  assert.equal(await mode.textContent(), 'detached');

  await send.click();
  await settle();
  await viewport.focus();
  await page.keyboard.press('PageUp');
  await waitMode('detached');
  await page.waitForTimeout(300);
  await page.keyboard.press('End');
  await settle();
  await page.setViewportSize({ width: 760, height: 600 });
  await settle();
  await page.screenshot({ path: '/tmp/chat-scroll-send-messages.png' });

  const reducedPage = await browser.newPage({ reducedMotion: 'reduce' });
  reducedPage.on('pageerror', (error) => errors.push(error.message));
  await reducedPage.goto(
    `${process.env.STORYBOOK_URL ?? 'http://localhost:6009'}/iframe.html?id=components-chat-scroll-container--send-messages&viewMode=story&globals=theme:light`
  );
  await reducedPage.getByRole('button', { name: 'Receive a message', exact: true }).click();
  const reducedDistance = await reducedPage
    .locator('[data-slot="chat-scroll-viewport"]')
    .evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop);
  assert.ok(reducedDistance < 1, 'Reduced motion reaches the new bottom immediately');
  await reducedPage.close();

  const composerPage = await browser.newPage({ reducedMotion: 'no-preference' });
  composerPage.on('pageerror', (error) => errors.push(error.message));
  await composerPage.addInitScript(() => {
    window.initialChatDistances = [];
    function sample() {
      const element = document.querySelector('[data-slot="chat-scroll-viewport"]');
      if (element) {
        window.initialChatDistances.push(element.scrollHeight - element.clientHeight - element.scrollTop);
      }
      if (window.initialChatDistances.length < 30) requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  await composerPage.goto(
    `${process.env.STORYBOOK_URL ?? 'http://localhost:6009'}/iframe.html?id=components-chat-scroll-container--with-message-input&viewMode=story`
  );
  await composerPage.waitForFunction(() => window.initialChatDistances.length === 30);
  const initialDistances = await composerPage.evaluate(() => window.initialChatDistances);
  // The first rAF precedes ResizeObserver delivery. All subsequent frames must be settled.
  assert.ok(
    initialDistances.slice(1).every((distance) => distance < 1),
    'Composer measurement must not animate the initial bottom position'
  );
  const composer = composerPage.getByRole('textbox', { name: 'Message', exact: true });
  await composer.fill('A new message after the initial layout.');
  await composer.press('Enter');
  assert.ok(
    await composerPage
      .locator('[data-slot="chat-scroll-viewport"]')
      .evaluate((element) => Boolean(element.querySelector('[data-chat-inserting]'))),
    'Messages after mount still animate'
  );
  await composerPage.waitForFunction(() => {
    const element = document.querySelector('[data-slot="chat-scroll-viewport"]');
    return (
      !element.querySelector('[data-chat-inserting]') &&
      element.scrollHeight - element.clientHeight - element.scrollTop < 1
    );
  });
  const composerViewport = composerPage.locator('[data-slot="chat-scroll-viewport"]');
  const composerGeometry = () =>
    composerViewport.evaluate((element) => ({
      top: element.scrollTop,
      padding: Number.parseFloat(getComputedStyle(element.firstElementChild).paddingBottom),
      distance: element.scrollHeight - element.clientHeight - element.scrollTop,
    }));
  const beforeGrowth = await composerGeometry();
  await composer.fill('First line');
  await composer.press('Shift+Enter');
  await composer.pressSequentially('Second line');
  await composerPage.waitForFunction(() => {
    const element = document.querySelector('[data-slot="chat-scroll-viewport"]');
    return (
      !element.querySelector('[data-chat-inserting]') &&
      element.scrollHeight - element.clientHeight - element.scrollTop < 1
    );
  });
  const followingGrowth = await composerGeometry();
  assert.equal(followingGrowth.padding - beforeGrowth.padding, 17, 'Composer growth increases bottom clearance');
  assert.ok(
    Math.abs(followingGrowth.top - beforeGrowth.top - 17) < 1,
    'Following moves with the growing composer clearance'
  );
  // The browser clamps scrollTop when clearance shrinks. That must not be
  // mistaken for an upward user scroll, including when the input grows again.
  for (const draft of ['First line', 'First line\nSecond line\nThird line', 'First line', 'First line\nSecond line']) {
    await composer.fill(draft);
    await composerPage.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );
    assert.ok((await composerGeometry()).distance < 1, 'Repeated composer growth/shrink remains immediately pinned');
  }
  await composerViewport.hover();
  await composerPage.mouse.wheel(0, -220);
  await composerPage.waitForFunction(
    (top) => document.querySelector('[data-slot="chat-scroll-viewport"]').scrollTop < top - 100,
    followingGrowth.top
  );
  const beforeDetachedGrowth = await composerGeometry();
  await composer.click();
  await composer.press('End');
  await composer.press('Shift+Enter');
  await composer.pressSequentially('Third line');
  await composerPage.waitForTimeout(800);
  const detachedGrowth = await composerGeometry();
  assert.equal(detachedGrowth.padding - beforeDetachedGrowth.padding, 17);
  assert.equal(detachedGrowth.top, beforeDetachedGrowth.top, 'Detached composer growth preserves the reading position');
  await composerPage.close();
  assert.deepEqual(errors, []);
  console.log(
    'PASS: initial bottom, animated receive, threshold escape/re-entry, remote preservation, local send, interruption, burst updates, 2px threshold, keyboard, viewport resize, reduced motion, composer initial layout and growth.'
  );
} finally {
  await browser.close();
}
