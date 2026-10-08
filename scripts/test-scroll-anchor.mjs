/** Browser contracts for the headless scroll anchor, exercised through the wireframe story. Requires Storybook. */
import assert from 'node:assert/strict';

import { chromium } from 'playwright';

const base = process.env.STORYBOOK_URL ?? 'http://localhost:6009';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, reducedMotion: 'no-preference' });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/iframe.html?id=components-scroll-anchor--wireframe&viewMode=story`);
  const viewport = page.locator('[data-slot="scroll-anchor-viewport"]');
  const button = (name) => page.getByRole('button', { name, exact: true });
  const geometry = () =>
    viewport.evaluate((element) => {
      const anchor = element.querySelector('[data-anchor]');
      return {
        top: element.scrollTop,
        distance: element.scrollHeight - element.clientHeight - element.scrollTop,
        mode: element.dataset.scrollAnchorMode,
        rows: element.querySelectorAll('[data-row-id]').length,
        anchorId: anchor?.dataset.rowId,
        anchorTop: anchor ? anchor.getBoundingClientRect().top : undefined,
        anchorBottom: anchor ? anchor.getBoundingClientRect().bottom : undefined,
      };
    });
  const modeText = () => page.locator('#storybook-root strong').textContent();
  async function waitMode(expected) {
    await page.waitForFunction(
      (value) =>
        document.querySelector('[data-slot="scroll-anchor-viewport"]')?.dataset.scrollAnchorMode === value &&
        document.querySelector('#storybook-root strong')?.textContent === value,
      expected
    );
  }
  async function waitSettled() {
    await page.waitForFunction(() => {
      const element = document.querySelector('[data-slot="scroll-anchor-viewport"]');
      return element && !element.querySelector('[data-entering]');
    });
    // One more frame so the last layout tick's report lands.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  async function wheel(delta) {
    await viewport.hover();
    await page.mouse.wheel(0, delta);
  }

  // Initial positioning lands at the bottom before the first paint animates anything.
  await waitMode('following');
  const initial = await geometry();
  assert.ok(initial.distance <= 1, `Starts at the bottom: ${JSON.stringify(initial)}`);
  assert.equal(await modeText(), 'following');

  // Appending while settled tracks the slot expansion directly; the state never leaves following.
  await page.getByText('0.25×', { exact: true }).click();
  const framesPromise = viewport.evaluate(
    (element) =>
      new Promise((resolve) => {
        const modes = new Set();
        const start = performance.now();
        const tick = () => {
          modes.add(element.dataset.scrollAnchorMode);
          if (performance.now() - start < 1500 && (element.querySelector('[data-entering]') || modes.size === 0)) {
            requestAnimationFrame(tick);
          } else resolve([...modes]);
        };
        requestAnimationFrame(tick);
      })
  );
  await button('Append and follow').click();
  await viewport.locator('[data-entering]').waitFor({ state: 'attached' });
  const modesDuringAppend = await framesPromise;
  await waitSettled();
  const afterAppend = await geometry();
  assert.equal(afterAppend.rows, initial.rows + 1);
  assert.ok(afterAppend.distance <= 1, `Followed the new row: ${JSON.stringify(afterAppend)}`);
  assert.deepEqual(modesDuringAppend, ['following'], 'Settled following tracks slot ticks without a catch-up spring');
  const appended = await viewport.evaluate((element) => {
    const row = [...element.querySelectorAll('[data-row-id]')].at(-1);
    return { declared: row.style.height, box: row.getBoundingClientRect().height };
  });
  assert.ok(
    appended.declared !== '' && Math.abs(appended.box - Number.parseFloat(appended.declared)) < 0.01,
    `An appended row keeps its declared height after its slot finishes: ${JSON.stringify(appended)}`
  );

  // Receiving while settled also follows, and the viewport reports the same mode through data and text.
  await button('Append, keep reading').click();
  await waitSettled();
  await waitMode('following');
  assert.ok((await geometry()).distance <= 1);

  // Upward wheel detaches immediately and reveals the jump control.
  await wheel(-300);
  await waitMode('detached');
  await button('Jump to latest').waitFor();
  await page.getByText(/Last scroll observation: Upward native scroll/).waitFor();
  const stateTransition = page.getByText(/^Last state transition:/);
  const firstDetach = await stateTransition.textContent();
  assert.equal(firstDetach, 'Last state transition: following → detached · Upward wheel');
  assert.equal(await page.getByText(/^Last input:/).textContent(), 'Last input: Upward wheel');
  const detached = await geometry();
  assert.ok(detached.distance > 100, `Escaped the bottom: ${JSON.stringify(detached)}`);
  assert.ok(detached.anchorId, 'A reading anchor row is highlighted while detached');

  // History above the anchor is compensated: the anchor row stays put on screen across the whole expansion.
  await button('Prepend 5 rows').click();
  await viewport.locator('[data-entering]').first().waitFor({ state: 'attached' });
  const drift = await viewport.evaluate(
    (element, anchorId) =>
      new Promise((resolve) => {
        const row = element.querySelector(`[data-row-id="${anchorId}"]`);
        const start = row.getBoundingClientRect().top;
        let worst = 0;
        const tick = () => {
          worst = Math.max(worst, Math.abs(row.getBoundingClientRect().top - start));
          if (element.querySelector('[data-entering]')) requestAnimationFrame(tick);
          else resolve(worst);
        };
        tick();
      }),
    detached.anchorId
  );
  await waitSettled();
  const afterPrepend = await geometry();
  assert.equal(afterPrepend.rows, detached.rows + 5);
  assert.equal(afterPrepend.mode, 'detached', 'Compensation is not user intent');
  assert.equal(afterPrepend.anchorId, detached.anchorId, 'The same row remains the anchor');
  assert.ok(drift <= 1, `Anchor row drifted ${drift}px during prepend`);
  assert.ok(
    Math.abs(afterPrepend.anchorTop - detached.anchorTop) <= 1,
    `Anchor row kept its screen position: ${detached.anchorTop} -> ${afterPrepend.anchorTop}`
  );
  assert.ok(afterPrepend.top > detached.top + 100, 'scrollTop absorbed the inserted history');

  // Changes below the anchor need no compensation and must not restore following.
  // The anchor is kept by its bottom edge, the edge that made the row eligible, so
  // resizing the anchor row itself moves its top while that edge stays in place.
  await button('Insert before last').click();
  await waitSettled();
  await page.getByText('112 px', { exact: true }).click();
  await waitSettled();
  const afterBelow = await geometry();
  assert.equal(afterBelow.mode, 'detached');
  assert.equal(afterBelow.anchorId, detached.anchorId);
  assert.ok(
    Math.abs(afterBelow.anchorTop - detached.anchorTop) <= 1,
    `Anchor unaffected by changes below it: ${JSON.stringify(afterBelow)}`
  );
  await button('Resize anchor row').click();
  await waitSettled();
  const afterResize = await geometry();
  assert.equal(afterResize.mode, 'detached');
  // Shrinking this row can reveal its predecessor, which becomes the first
  // visible candidate. Verify the original row's edge, independently of selection.
  const resizedAnchorBottom = await viewport.locator(`[data-row-id="${detached.anchorId}"]`).evaluate((row) => {
    return row.getBoundingClientRect().bottom;
  });
  assert.ok(
    Math.abs(resizedAnchorBottom - afterBelow.anchorBottom) <= 1,
    `Resizing the anchor row keeps its bottom edge: ${afterBelow.anchorBottom} -> ${resizedAnchorBottom}`
  );

  // The explicit bottom command animates, then follows; clearance changes while settled stay pinned.
  // A change the host never reports (reflow, loaded media) above the anchor is still
  // compensated through the controller's resize observer and the tracked snapshot.
  const reflowed = await viewport.evaluate(
    (element, anchorId) =>
      new Promise((resolve) => {
        const anchor = element.querySelector(`[data-row-id="${anchorId}"]`);
        const above = anchor.previousElementSibling.previousElementSibling;
        const before = anchor.getBoundingClientRect().bottom;
        above.style.height = `${above.getBoundingClientRect().height + 120}px`;
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            resolve({
              drift: anchor.getBoundingClientRect().bottom - before,
              mode: element.dataset.scrollAnchorMode,
            })
          )
        );
      }),
    afterResize.anchorId
  );
  assert.equal(reflowed.mode, 'detached', 'Unreported reflow is not user intent');
  assert.ok(Math.abs(reflowed.drift) <= 1, `Unreported reflow above the anchor is compensated: ${reflowed.drift}px`);

  await button('Jump to latest').click();
  await waitMode('animating');
  await waitMode('following');
  assert.ok((await geometry()).distance <= 1, 'Jump reaches the actual bottom');
  await page.getByText('0 px', { exact: true }).click();
  await waitSettled();
  const afterClearance = await geometry();
  assert.equal(afterClearance.mode, 'following');
  assert.ok(
    afterClearance.distance <= 1,
    `Clearance release keeps the bottom pinned: ${JSON.stringify(afterClearance)}`
  );
  assert.equal(await modeText(), 'following');

  // Instant rows (no slot animation) follow through a catch-up spring and still converge.
  await page.getByText('Animate row slots', { exact: true }).click();
  await button('Append and follow').click();
  await waitMode('following');
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-slot="scroll-anchor-viewport"]');
    return element.scrollHeight - element.clientHeight - element.scrollTop <= 1;
  });
  assert.equal(await viewport.evaluate((element) => element.querySelectorAll('[data-entering]').length), 0);

  // Detached instant append with follow catches up; without follow it holds the anchor.
  await wheel(-200);
  await waitMode('detached');
  const held = await geometry();
  await button('Append, keep reading').click();
  await waitSettled();
  const heldAfter = await geometry();
  assert.equal(heldAfter.mode, 'detached');
  assert.ok(Math.abs(heldAfter.anchorTop - held.anchorTop) <= 1, 'Receive keeps the reading anchor');
  await button('Append and follow').click();
  await waitMode('following');
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-slot="scroll-anchor-viewport"]');
    return element.scrollHeight - element.clientHeight - element.scrollTop <= 1;
  });

  // The bare hook on host-owned markup shares the same behavior.
  await page.goto(`${base}/iframe.html?id=components-scroll-anchor--bare-hook&viewMode=story`);
  const bare = page.locator('[data-scroll-anchor-mode]');
  await bare.waitFor();
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-scroll-anchor-mode]');
    return (
      element.dataset.scrollAnchorMode === 'following' &&
      element.scrollHeight - element.clientHeight - element.scrollTop <= 1
    );
  });
  await button('Append and follow').click();
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-scroll-anchor-mode]');
    return (
      element.dataset.scrollAnchorMode === 'following' &&
      element.querySelectorAll('li').length === 41 &&
      element.scrollHeight - element.clientHeight - element.scrollTop <= 1
    );
  });
  await bare.hover();
  await page.mouse.wheel(0, -200);
  await page.waitForFunction(
    () => document.querySelector('[data-scroll-anchor-mode]').dataset.scrollAnchorMode === 'detached'
  );
  await button('Scroll to bottom').click();
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-scroll-anchor-mode]');
    return (
      element.dataset.scrollAnchorMode === 'following' &&
      element.scrollHeight - element.clientHeight - element.scrollTop <= 1
    );
  });

  // Each diagnostic history survives unrelated events; retargeting is not a mode change.
  const diagnostics = await page.evaluate(async () => {
    const { createScrollAnchorController } = await import('/src/components/scroll-anchor/scroll-anchor-controller.ts');
    const v = document.createElement('div');
    v.style.cssText = 'position:fixed;inset:0 auto auto 0;width:200px;height:100px;overflow:auto';
    const content = document.createElement('div');
    content.style.cssText = 'height:2000px;padding-bottom:0';
    v.append(content);
    document.body.append(v);
    let state;
    const controller = createScrollAnchorController(v, content, {
      threshold: 2,
      reducedMotion: false,
      animationSpeed: 1,
      onStateChange: (next) => {
        state = next;
      },
    });
    const flush = async () => {
      for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
    };
    const samples = [];
    try {
      await flush();
      for (let i = 0; i < 3; i++) {
        v.dispatchEvent(new WheelEvent('wheel', { deltaY: -40 }));
        await flush();
        samples.push(state);
        v.scrollTop -= 40;
        v.dispatchEvent(new Event('scroll'));
        await flush();
        samples.push(state);
      }
      v.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
      await flush();
      samples.push(state);
      v.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true, cancelable: true }));
      await flush();
      samples.push(state);
      const deadline = performance.now() + 5000;
      while (state.mode === 'animating') {
        if (performance.now() > deadline) throw new Error('Diagnostic fixture did not settle');
        await flush();
      }
      samples.push(state);
      // A fresh command changes following intent while the mode remains animating.
      v.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
      await flush();
      v.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
      await flush();
      samples.push(state);
      v.dispatchEvent(new WheelEvent('wheel', { deltaY: -40 }));
      await flush();
      samples.push(state);
      return samples;
    } finally {
      controller.dispose();
      v.remove();
    }
  });
  for (const sample of diagnostics.slice(0, 6)) {
    assert.equal(sample.mode, 'detached');
    assert.equal(sample.diagnostics.state, 'following → detached · Upward wheel');
    assert.equal(sample.diagnostics.input, 'Upward wheel');
    assert.equal(sample.diagnostics.animation, null);
  }
  assert.equal(diagnostics[0].diagnostics.scroll, null, 'Historical reports are immutable snapshots');
  assert.equal(diagnostics[1].diagnostics.scroll, 'Upward native scroll · -40.00 px');
  assert.equal(diagnostics[6].diagnostics.state, 'detached → animating (reading) · Keyboard ArrowUp');
  assert.equal(diagnostics[7].diagnostics.state, diagnostics[6].diagnostics.state);
  assert.equal(diagnostics[7].diagnostics.input, 'Keyboard PageUp');
  assert.equal(diagnostics[7].diagnostics.animation, 'Retargeted · Keyboard PageUp');
  assert.equal(diagnostics[8].diagnostics.state, 'animating (reading) → detached · Reached keyboard target');
  assert.equal(diagnostics[8].diagnostics.input, 'Keyboard PageUp');
  assert.equal(diagnostics[8].diagnostics.animation, 'Completed · Reached keyboard target');
  assert.equal(
    diagnostics[8].diagnostics.scroll,
    diagnostics[1].diagnostics.scroll,
    'Spring writes are not native input'
  );
  assert.equal(diagnostics[9].diagnostics.state, 'animating (reading) → animating (following) · Keyboard End');
  assert.equal(diagnostics[10].diagnostics.state, 'animating (following) → detached · Upward wheel');
  assert.equal(diagnostics[10].diagnostics.animation, 'Interrupted · Upward wheel');

  assert.deepEqual(errors, []);
  console.log('PASS: scroll anchor contracts');
} finally {
  await browser.close();
}
