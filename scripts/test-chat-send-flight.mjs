/** Frame-level checks for the composer-to-bubble flight. Requires a running Storybook. */
import assert from 'node:assert/strict';

import { chromium } from 'playwright';

const browser = await chromium.launch();
const base = process.env.STORYBOOK_URL ?? 'http://localhost:6009';
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, reducedMotion: 'no-preference' });
  // Independently measure the fully expanded DOM, without changing rendered layout.
  await page.addInitScript(() => {
    window.finalMessageTop = (viewport, target) => {
      const slots = [...viewport.querySelectorAll('[data-chat-inserting]')];
      const styles = slots.map((row) => [row.style.cssText, row.querySelector('[data-message-id]').style.cssText]);
      for (const row of slots) {
        const bubble = row.querySelector('[data-message-id]');
        row.style.removeProperty('height');
        row.style.removeProperty('padding-top');
        bubble.style.removeProperty('margin-top');
      }
      const top =
        target.getBoundingClientRect().top -
        Math.max(0, viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop);
      slots.forEach((row, index) => {
        row.style.cssText = styles[index][0];
        row.querySelector('[data-message-id]').style.cssText = styles[index][1];
      });
      return top;
    };
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(
    `${base}/iframe.html?id=components-chat-scroll-container--with-message-input&viewMode=story&globals=theme:dark&reactScan=false`
  );
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  const viewport = page.locator('[data-slot="chat-scroll-viewport"]');
  async function settled() {
    await page.waitForFunction(() => {
      const viewport = document.querySelector('[data-slot="chat-scroll-viewport"]');
      return (
        document.querySelector('#storybook-root strong')?.textContent === 'following' &&
        !viewport.querySelector('[data-chat-inserting]') &&
        !document.querySelector('[data-chat-send-flight]') &&
        viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop < 1
      );
    });
  }
  await settled();
  await input.fill('A note before we go.\nTake the scenic route.\nThere is no hurry.');
  await settled();
  const origin = await page.locator('[data-slot="message-input"]').boundingBox();
  await page.evaluate(() => {
    window.flightFrames = [];
    const read = () => {
      const carrier = document.querySelector('[data-chat-send-flight]');
      if (!carrier) return;
      const target = document.querySelector(
        `[data-slot="chat-scroll-viewport"] [data-message-id="${carrier.dataset.messageId}"]`
      );
      const content = carrier.querySelector('[data-slot="message-bubble-content"]');
      const matrix = new DOMMatrix(getComputedStyle(carrier).transform);
      const inverse = new DOMMatrix(getComputedStyle(content).transform);
      const viewport = document.querySelector('[data-slot="chat-scroll-viewport"]');
      window.flightFrames.push({
        time: performance.now(),
        rect: carrier.getBoundingClientRect().toJSON(),
        target: target.getBoundingClientRect().toJSON(),
        scale: [matrix.a, matrix.d],
        contentScale: [inverse.a, inverse.d],
        textRect: content.getBoundingClientRect().toJSON(),
        targetTextRect: target.querySelector('[data-slot="message-bubble-content"]').getBoundingClientRect().toJSON(),
        tail: Number(getComputedStyle(carrier).getPropertyValue('--message-bubble-tail-opacity')),
        visibility: getComputedStyle(target).visibility,
        inScroller: viewport.contains(carrier),
        scrollHeight: viewport.scrollHeight,
      });
    };
    const observer = new MutationObserver(read);
    observer.observe(document.querySelector('#storybook-root'), {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    });
    window.stopFlightSampling = () => observer.disconnect();
  });
  await input.press('Enter');
  await page.waitForFunction(() => window.flightFrames.length > 0);
  await page.waitForTimeout(95);
  await page.screenshot({ path: '/tmp/chat-send-flight-mid.png' });
  await page.waitForFunction(() => !document.querySelector('[data-chat-send-flight]'));
  await settled();
  const frames = await page.evaluate(() => {
    window.stopFlightSampling();
    return window.flightFrames;
  });
  assert.ok(frames.length > 8, 'Flight has intermediate frames');
  const first = frames[0];
  for (const key of ['x', 'y', 'width', 'height'])
    assert.ok(Math.abs(first.rect[key] - origin[key]) < 1, `Departure ${key} matches the expanded composer`);
  assert.ok(
    frames.every((frame) => !frame.inScroller),
    'Flight cannot inflate the scrolling content'
  );
  assert.ok(
    frames.every((frame) => frame.visibility === 'hidden'),
    'Only one visual bubble during flight'
  );
  for (const frame of frames) {
    assert.ok(Math.abs(frame.scale[0] * frame.contentScale[0] - 1) < 0.001);
    assert.ok(Math.abs(frame.scale[1] * frame.contentScale[1] - 1) < 0.001);
    assert.ok(Math.abs(frame.textRect.width - frame.targetTextRect.width) < 0.1, 'Text retains final wrapping width');
  }
  const firstInset = first.textRect.left - first.rect.left;
  const targetInset = first.targetTextRect.left - first.target.left;
  assert.ok(Math.abs(firstInset - targetInset) < 1, 'The initial text position stays left-aligned');
  assert.ok(
    frames.some((frame) => Math.abs(frame.textRect.left - frame.rect.left - targetInset) > 1),
    'Text gently moves inward from the bubble edge during flight'
  );
  assert.ok(
    frames.every((frame) => frame.textRect.left >= frame.rect.left && frame.textRect.right <= frame.rect.right),
    'Text stays horizontally inside the moving body'
  );
  assert.equal(first.tail, 0);
  assert.ok(
    frames.some((frame) => frame.tail > 0.9),
    'Tail appears near arrival'
  );
  const last = frames.at(-1);
  assert.ok(
    Math.abs(last.rect.x - last.target.x) < 1 && Math.abs(last.rect.y - last.target.y) < 1,
    'Flight converges on the moving list anchor'
  );
  assert.ok(
    Math.abs(last.textRect.left - last.targetTextRect.left) < 1 &&
      Math.abs(last.textRect.top - last.targetTextRect.top) < 1,
    'Text converges before the flight hands off to the real bubble'
  );
  assert.equal(
    await viewport
      .locator('[data-message-id]')
      .last()
      .evaluate((element) => element.style.visibility),
    ''
  );

  // Explicit long input keeps wrapping coverage independent of short demo-button copy.
  // Final bubble wrapping is taller, so text must stay inside the animated body.
  await input.fill(
    'I like the idea of leaving the afternoon open. We could start with a short walk and see where we end up, without trying to fit too many things into one day.\n\nI will bring my camera in case the light is good, but I am equally happy to just sit somewhere and talk.'
  );
  await settled();
  await page.evaluate(() => {
    window.longFlightFrames = [];
    const observer = new MutationObserver(() => {
      const carrier = document.querySelector('[data-chat-send-flight]');
      if (!carrier) return;
      const clip = carrier.querySelector('[data-slot="chat-send-flight-clip"]');
      window.longFlightFrames.push({
        body: carrier.getBoundingClientRect().toJSON(),
        clip: clip.getBoundingClientRect().toJSON(),
        text: clip.firstElementChild.getBoundingClientRect().toJSON(),
        overflow: getComputedStyle(clip).overflow,
      });
    });
    observer.observe(document.querySelector('#storybook-root'), { subtree: true, childList: true, attributes: true });
    window.stopLongSampling = () => {
      observer.disconnect();
    };
  });
  await input.press('Enter');
  await page.waitForFunction(() => window.longFlightFrames.length > 0);
  await page.screenshot({ path: '/tmp/chat-send-flight-long-clipped.png' });
  await page.waitForFunction(() => !document.querySelector('[data-chat-send-flight]'));
  const longFrames = await page.evaluate(() => {
    window.stopLongSampling();
    return window.longFlightFrames;
  });
  assert.ok(
    longFrames.some((frame) => frame.text.height > frame.body.height + 10),
    'Exercise wrapping taller than the departure box'
  );
  for (const frame of longFrames) {
    assert.equal(frame.overflow, 'clip');
    assert.ok(Math.abs(frame.text.top - frame.body.top - 8) < 1, 'First line retains its top inset');
    for (const key of ['x', 'y', 'width', 'height']) {
      assert.ok(Math.abs(frame.clip[key] - frame.body[key]) < 1, 'Text clipping follows the visual body');
    }
  }
  await settled();

  // Sending from old history flies to the final bottom position while the
  // original row is still offscreen, then hands off only when that row arrives.
  await viewport.hover();
  await page.mouse.wheel(0, -10000);
  await page.waitForFunction(() => document.querySelector('[data-slot="chat-scroll-viewport"]').scrollTop === 0);
  await page.evaluate(() => {
    window.historyFrames = [];
    let messageId;
    function sample() {
      const viewport = document.querySelector('[data-slot="chat-scroll-viewport"]');
      const carrier = document.querySelector('[data-chat-send-flight]');
      if (carrier) messageId = carrier.dataset.messageId;
      const target = messageId && viewport.querySelector(`[data-message-id="${messageId}"]`);
      if (target) {
        const remaining = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
        window.historyFrames.push({
          time: performance.now(),
          flying: Boolean(carrier),
          top: (carrier ?? target).getBoundingClientRect().top,
          predicted: window.finalMessageTop(viewport, target),
          remaining,
          visibility: getComputedStyle(target).visibility,
        });
      }
      if (!target || carrier) requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  await input.fill('A reply from the top.');
  await input.press('Enter');
  await page.waitForFunction(() => window.historyFrames.some((frame) => !frame.flying));
  const historyFrames = await page.evaluate(() => window.historyFrames);
  const departure = historyFrames[0];
  assert.ok(departure.remaining > 1000, 'Start far from the bottom');
  assert.ok(
    historyFrames.some((frame) => frame.flying && frame.remaining <= 1),
    'The faster scroll reaches the bottom before the flight finishes'
  );
  assert.ok(
    historyFrames.every((frame) => Math.abs(frame.predicted - departure.predicted) < 1),
    'The predicted destination remains stable during catch-up scrolling'
  );
  assert.ok(
    historyFrames.every((frame) => frame.top <= departure.top + 1),
    'Flight never dives toward the offscreen row'
  );
  const handoff = historyFrames.at(-1);
  assert.ok(handoff.remaining <= 1, 'Only hand off once the actual row arrives');
  assert.equal(handoff.visibility, 'visible');
  await settled();

  // Interrupt an active flight through real wheel input, then ensure history stays put.
  await input.fill('A second note.');
  await input.press('Enter');
  await page.waitForSelector('[data-chat-send-flight]');
  await viewport.hover();
  await page.mouse.wheel(0, -80);
  await page.waitForFunction(
    () =>
      document.querySelector('#storybook-root strong')?.textContent === 'detached' &&
      !document.querySelector('[data-chat-send-flight]')
  );
  await page.waitForTimeout(150);
  const stoppedTop = await viewport.evaluate((element) => element.scrollTop);
  await page.waitForTimeout(650);
  assert.equal(await viewport.evaluate((element) => element.scrollTop), stoppedTop);

  // Burst sends retain separate identities and release every hidden original.
  await page.getByRole('button', { name: 'Send a message', exact: true }).click();
  await settled();
  await input.fill('One');
  await input.press('Enter');
  await input.fill('Two');
  await input.press('Enter');
  await page.waitForFunction(() => !document.querySelector('[data-chat-send-flight]'));
  assert.equal(await viewport.locator('[data-message-id][style*="hidden"]').count(), 0);

  // A second identical message moves the first destination by one row. Exercise
  // both mid-flight and late retargeting without restarting the first shape.
  await page.getByText('0.25×', { exact: true }).click();
  for (const sendGap of [500, 1400]) {
    await settled();
    await page.evaluate(() => {
      window.burstFrames = [];
      let first;
      let running = true;
      window.stopBurstSampling = () => {
        running = false;
      };
      function sample() {
        const viewport = document.querySelector('[data-slot="chat-scroll-viewport"]');
        const carriers = [...document.querySelectorAll('[data-chat-send-flight]')];
        first ??= carriers[0];
        if (first) {
          const target = viewport.querySelector(`[data-message-id="${first.dataset.messageId}"]`);
          const flying = first.isConnected;
          const body = (flying ? first : target).getBoundingClientRect();
          const actual = target.getBoundingClientRect();
          window.burstFrames.push({
            time: performance.now(),
            flying,
            count: carriers.length,
            top: body.top,
            width: body.width,
            targetWidth: actual.width,
            actualTop: actual.top,
            destination: window.finalMessageTop(viewport, target),
          });
        }
        if (running) requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    await input.fill('1');
    await input.press('Enter');
    await page.waitForTimeout(sendGap);
    await input.fill('1');
    await input.press('Enter');
    await page.waitForFunction(() => window.burstFrames.some((frame) => !frame.flying));
    await page.waitForFunction(() => !document.querySelector('[data-chat-send-flight]'));
    const burstFrames = await page.evaluate(() => {
      window.stopBurstSampling();
      return window.burstFrames;
    });
    const insertion = burstFrames.findIndex((frame) => frame.count === 2);
    assert.ok(insertion > 0, 'Both identical messages overlap in flight');
    const before = burstFrames[insertion - 1];
    assert.ok(Math.abs(burstFrames[insertion].destination - before.destination + 36) < 1);
    const boundary = burstFrames.filter((frame) => frame.time >= before.time && frame.time <= before.time + 120);
    for (let index = 1; index < boundary.length; index++) {
      const previous = boundary[index - 1];
      const current = boundary[index];
      // Allow 6px per 60Hz frame (scaled for missed frames), comfortably above
      // the intended quarter-speed motion but below the witnessed 16px jump.
      const allowedTravel = 6 * Math.max(1, (current.time - previous.time) / (1000 / 60));
      assert.ok(Math.abs(current.top - previous.top) < allowedTravel, 'No jump when the destination moves');
      // An underdamped shrink can undershoot the final width, then recover.
      // That recovery must not be confused with restarting from composer width.
      assert.ok(
        current.width <= Math.max(before.width, current.targetWidth) + 1,
        'The original shape never restarts from composer width'
      );
    }
    const lastFlying = burstFrames.findLast((frame) => frame.flying);
    assert.ok(Math.abs(lastFlying.top - lastFlying.actualTop) <= 1, 'Compensation settles before handoff');
    if (sendGap === 1400) {
      assert.ok(
        burstFrames.some(
          (frame) =>
            frame.flying &&
            Math.abs(frame.width - frame.targetWidth) < 0.1 &&
            Math.abs(frame.top - frame.destination) > 2
        ),
        'Shape finishes while the independent destination compensation is still moving'
      );
    }
    assert.equal(await viewport.locator('[data-message-id][style*="hidden"]').count(), 0);
  }
  // The text shares body motion near arrival, while preserving its original
  // departure inset. Exercise the short-text/wide-composer worst case as well
  // as final wrapping that is taller than the composer, at quarter speed.
  const geometryPage = await browser.newPage({
    viewport: { width: 390, height: 647 },
    deviceScaleFactor: 3,
    reducedMotion: 'no-preference',
  });
  geometryPage.on('pageerror', (error) => errors.push(error.message));
  for (const width of [390, 1000]) {
    await geometryPage.setViewportSize({ width, height: 647 });
    for (const [label, message] of [
      ['short', 'Hey!'],
      ['bullets', '- Good coffee\n- A quiet table outside\n- A walk by the park afterward'],
      [
        'long',
        'I like the idea of leaving the afternoon open. We could start with a short walk and see where we end up, without trying to fit too many things into one day.',
      ],
    ]) {
      await geometryPage.goto(
        `${base}/iframe.html?id=components-chat-scroll-container--automatic-replies&viewMode=story&reactScan=false`
      );
      const draft = geometryPage.getByRole('textbox', { name: 'Message', exact: true });
      await geometryPage.getByText('0.25×', { exact: true }).click();
      await draft.fill(message);
      await geometryPage.evaluate(() => {
        window.centerFrames = [];
        const observer = new MutationObserver(() => {
          const body = document.querySelector('[data-chat-send-flight]');
          if (!body) return;
          const target = document.querySelector(
            `[data-slot="chat-scroll-viewport"] [data-message-id="${body.dataset.messageId}"]`
          );
          window.centerFrames.push({
            body: body.getBoundingClientRect().toJSON(),
            text: body.querySelector('[data-slot="message-bubble-content"]').getBoundingClientRect().toJSON(),
            target: target.getBoundingClientRect().toJSON(),
            targetText: target.querySelector('[data-slot="message-bubble-content"]').getBoundingClientRect().toJSON(),
          });
        });
        observer.observe(document.querySelector('#storybook-root'), {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['style'],
        });
        window.stopCenterSampling = () => observer.disconnect();
      });
      await draft.press('Enter');
      await geometryPage.waitForFunction(() => window.centerFrames.length > 0);
      await geometryPage.waitForTimeout(450);
      await geometryPage.screenshot({ path: `/tmp/chat-send-center-${width}-${label}.png` });
      await geometryPage.waitForFunction(() => !document.querySelector('[data-chat-send-flight]'));
      const samples = await geometryPage.evaluate(() => {
        window.stopCenterSampling();
        return window.centerFrames;
      });
      const start = samples[0];
      const inset = start.targetText.left - start.target.left;
      assert.ok(Math.abs(start.text.left - start.body.left - inset) < 1, 'Preserve the initial left inset');
      for (const frame of samples) {
        assert.ok(
          frame.text.left >= frame.body.left && frame.text.right <= frame.body.right,
          `${width}/${label}: no horizontal text clipping`
        );
        assert.ok(Math.abs(frame.text.top - frame.body.top - 8) < 1, 'Vertical reveal remains top-aligned');
        assert.ok(Math.abs(frame.text.width - frame.targetText.width) < 0.1, 'No text scaling or rewrapping');
      }
      const overshoot = samples.filter((frame) => frame.body.width < frame.target.width - 0.2);
      assert.ok(overshoot.length > 0, 'Capture body width undershoot');
      const relativeCenter = (body, text) => text.left + text.width / 2 - body.left - body.width / 2;
      const centerError = Math.max(
        ...overshoot.map((frame) =>
          Math.abs(relativeCenter(frame.body, frame.text) - relativeCenter(frame.target, frame.targetText))
        )
      );
      assert.ok(centerError < 0.2, 'Text moves with the bubble center throughout overshoot');
      console.log(
        `PASS: ${width}/${label}, ${samples.length} samples, overshoot center error ${centerError.toFixed(3)}px`
      );
    }
  }
  await geometryPage.close();
  await page.getByText('1×', { exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await input.fill('Without motion.');
  await input.press('Enter');
  assert.equal(await page.locator('[data-chat-send-flight]').count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    `PASS: ${frames.length} flight samples; measured multi-line departure, moving arrival, text scale, tail, interruption, continuous burst retargeting, handoff, reduced motion.`
  );
} finally {
  await browser.close();
}
