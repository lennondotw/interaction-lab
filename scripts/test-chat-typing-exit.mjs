/** Browser checks for temporary typing-exit spacing and native scroll ownership. */
import assert from 'node:assert/strict';

import { chromium } from 'playwright';

const browser = await chromium.launch();
const base = process.env.STORYBOOK_URL ?? 'http://localhost:6009';
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(
    `${base}/iframe.html?id=components-chat-scroll-container--with-message-input&viewMode=story&reactScan=false`
  );
  const viewport = page.locator('[data-slot="chat-scroll-viewport"]');
  const placeholder = page.locator('[data-slot="typing-exit-placeholder"]');
  const indicator = page.locator('[data-slot="typing-bubble"]');
  const toggle = page.getByRole('button', { name: /^Typing (on|off)$/ });
  const lastMessage = viewport.locator('[data-message-id]').last();
  const receive = page.getByRole('button', { name: 'Receive a message', exact: true });
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  const top = () => viewport.evaluate((element) => element.scrollTop);
  const settled = () =>
    page.waitForFunction(() => {
      const viewport = document.querySelector('[data-slot="chat-scroll-viewport"]');
      return (
        document.querySelector('#storybook-root strong')?.textContent === 'following' &&
        !viewport.querySelector('[data-chat-inserting], [data-slot="typing-entry-placeholder"]') &&
        !document.querySelector('[data-chat-entrance]') &&
        viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 1
      );
    });
  const gone = () => indicator.waitFor({ state: 'detached' });
  const captureEntrance = () =>
    page.evaluate(() => {
      const existing = new Set(document.querySelectorAll('[data-slot="typing-bubble"], [data-chat-entrance]'));
      window.entranceStarts = [];
      const observer = new MutationObserver(() => {
        for (const element of document.querySelectorAll('[data-slot="typing-bubble"], [data-chat-entrance]')) {
          if (existing.has(element)) continue;
          existing.add(element);
          const style = getComputedStyle(element);
          window.entranceStarts.push({
            slot: element.dataset.slot,
            opacity: Number(style.opacity),
            y: new DOMMatrix(style.transform).m42,
          });
        }
      });
      observer.observe(document.querySelector('#storybook-root'), { childList: true, subtree: true });
      window.stopEntranceCapture = () => observer.disconnect();
    });
  const checkEntrance = async (slot, y = 20) => {
    const start = await page.evaluate((slot) => {
      window.stopEntranceCapture();
      return window.entranceStarts.find((entry) => entry.slot === slot);
    }, slot);
    assert.deepEqual(start, { slot, opacity: 0, y }, 'Entrance starts at its requested offset, before paint');
  };
  await settled();
  await page.getByText('0.25×', { exact: true }).click();

  // The existing outgoing row gives an 8px gap; an incoming row gives 3px.
  for (const gap of [8, 3]) {
    if (gap === 3) {
      await receive.click();
      await settled();
    }
    await captureEntrance();
    await toggle.click();
    await checkEntrance('typing-bubble');
    await settled();
    assert.equal(await placeholder.count(), 0, 'Normal typing owns its natural height');
    const heightBefore = await viewport.evaluate((element) => element.scrollHeight);
    await page.evaluate(() => {
      window.originalTyping = document.querySelector('[data-slot="typing-bubble"]');
      window.typingFrames = [];
      let running = true;
      window.stopTypingSampling = () => {
        running = false;
      };
      function sample() {
        const viewport = document.querySelector('[data-slot="chat-scroll-viewport"]');
        const placeholder = document.querySelector('[data-slot="typing-exit-placeholder"]');
        const bubble = placeholder?.querySelector('[data-slot="typing-bubble"]');
        window.typingFrames.push({
          time: performance.now(),
          top: viewport.scrollTop,
          distance: viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop,
          mode: document.querySelector('#storybook-root strong')?.textContent,
          height: placeholder?.getBoundingClientRect().height,
          bubbleHeight: bubble?.getBoundingClientRect().height,
          opacity: placeholder ? Number(getComputedStyle(placeholder.firstElementChild).opacity) : null,
          offset: bubble ? new DOMMatrix(getComputedStyle(bubble).transform).m42 : null,
        });
        if (running) requestAnimationFrame(sample);
      }
      sample();
    });
    await toggle.click();
    await placeholder.waitFor({ state: 'attached' });
    assert.ok(
      await indicator.evaluate((element) => element === window.originalTyping),
      'Exit preserves the visual node and its running dot animations'
    );
    if (gap === 3) assert.equal(await lastMessage.getAttribute('data-tail'), 'true');
    await gone();
    await settled();
    const frames = await page.evaluate(() => {
      window.stopTypingSampling();
      return window.typingFrames;
    });
    assert.equal(heightBefore - (await viewport.evaluate((element) => element.scrollHeight)), 33 + gap);
    assert.ok(frames.filter((frame) => frame.height > 0 && frame.height < 33 + gap).length > 10);
    assert.ok(frames.some((frame) => frame.opacity > 0 && frame.opacity < 1));
    assert.ok(frames.some((frame) => frame.opacity < 0.01 && frame.offset > 9.5 && frame.offset <= 10));
    for (const [index, frame] of frames.entries()) {
      assert.ok(frame.distance <= 1, 'Remain at bottom throughout collapse');
      assert.equal(frame.mode, 'following', 'Layout shrink is never mistaken for user scrolling');
      if (frame.bubbleHeight !== undefined)
        assert.ok(Math.abs(frame.bubbleHeight - 33) < 0.01, 'Fade without squashing');
      if (index > 0) {
        const previous = frames[index - 1];
        const allowedTravel = 6 * Math.max(1, (frame.time - previous.time) / (1000 / 60));
        assert.ok(Math.abs(frame.top - previous.top) < allowedTravel, 'No one-frame removal jump');
      }
    }
    if (gap === 3) assert.equal(await lastMessage.getAttribute('data-tail'), 'true');
  }

  // Receive followed immediately by typing-on must commit an entry slot and grouping
  // even while the previous entrance or typing replacement is still running.
  await page.evaluate(() => {
    Math.random = () => 0.8;
  });
  for (const initiallyTyping of [false, true]) {
    if (initiallyTyping) {
      await toggle.click();
      await settled();
    }
    await receive.click();
    await toggle.evaluate((button) => {
      window.reentryCommit = undefined;
      const observer = new MutationObserver(() => {
        if (button.getAttribute('aria-pressed') !== 'true') return;
        const viewport = document.querySelector('[data-slot="chat-scroll-viewport"]');
        const typing = viewport.querySelector('[data-slot="typing-bubble"]');
        if (!typing || typing.parentElement.dataset.slot !== 'typing-entry-placeholder') return;
        const source = [...viewport.querySelectorAll('[data-message-id]')].at(-1);
        const visual = document.querySelector('[data-chat-entrance]');
        window.reentryCommit = {
          height: typing.parentElement.getBoundingClientRect().height,
          bubbleHeight: typing.getBoundingClientRect().height,
          position: getComputedStyle(typing).position,
          offset: new DOMMatrix(getComputedStyle(typing).transform).m42,
          sourceTail: source.hasAttribute('data-tail'),
          visualTail: visual?.hasAttribute('data-tail'),
        };
        observer.disconnect();
      });
      observer.observe(document.querySelector('#storybook-root'), { attributes: true, childList: true, subtree: true });
    });
    await toggle.click();
    assert.deepEqual(
      await page.evaluate(() => window.reentryCommit),
      {
        height: 0,
        bubbleHeight: 33,
        position: 'absolute',
        offset: 20,
        sourceTail: false,
        visualTail: false,
      },
      'The first commit reserves the final geometry but starts the visible slot at zero, with the correct tail'
    );
    const reentryFrames = await page.evaluate(async () => {
      const samples = [];
      for (let index = 0; index < 100; index++) {
        const viewport = document.querySelector('[data-slot="chat-scroll-viewport"]');
        const typing = viewport.querySelector('[data-slot="typing-bubble"]');
        const composer = document.querySelector('[data-slot="message-input"]');
        samples.push({
          time: performance.now(),
          scrollTop: viewport.scrollTop,
          height: typing.parentElement.getBoundingClientRect().height,
          bottom: typing.getBoundingClientRect().bottom,
          composerTop: composer.getBoundingClientRect().top,
          distance: viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop,
        });
        await new Promise(requestAnimationFrame);
      }
      return samples;
    });
    assert.ok(reentryFrames.every((sample) => sample.height >= 0 && sample.height <= 36 && sample.distance <= 1));
    assert.ok(
      reentryFrames.some((sample) => sample.height > 0 && sample.height < 33),
      'Typing expands through intermediate layout heights'
    );
    for (let index = 1; index < reentryFrames.length; index++) {
      const previous = reentryFrames[index - 1];
      const current = reentryFrames[index];
      const elapsedFrames = Math.max(1, (current.time - previous.time) / (1000 / 60));
      assert.ok(Math.abs(current.height - previous.height) <= 4 * elapsedFrames, 'No instant typing footprint jump');
      assert.ok(
        Math.abs(current.scrollTop - previous.scrollTop) <= 12 * elapsedFrames,
        'Concurrent receive and typing entry never snap the whole list'
      );
    }
    assert.ok(
      reentryFrames.every((sample) => sample.bottom <= sample.composerTop),
      'Typing stays above the composer throughout reentry'
    );
    await settled();
    assert.equal(await indicator.evaluate((element) => getComputedStyle(element).position), 'static');
    await toggle.click();
    await gone();
    await settled();
  }

  // Reopening reverses the temporary height; completion restores the normal row.
  await toggle.click();
  await settled();
  await toggle.click();
  await page.waitForFunction(() => {
    const height = document.querySelector('[data-slot="typing-exit-placeholder"]')?.getBoundingClientRect().height;
    return height > 10 && height < 25;
  });
  const partialHeight = (await placeholder.boundingBox()).height;
  await toggle.click();
  assert.ok((await placeholder.boundingBox()).height < 33, 'Reopening does not instantly restore full height');
  assert.ok(partialHeight < 25);
  await placeholder.waitFor({ state: 'detached' });
  assert.equal(await indicator.count(), 1);
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  await settled();

  // Receive crossfades while the existing typing footprint expands into the message.
  await page.evaluate(() => {
    Math.random = () => 0.8;
  });
  const count = await viewport.locator('[data-message-id]').count();
  await captureEntrance();
  await receive.click();
  await checkEntrance('message-bubble', 0);
  await page.locator('[data-slot="typing-replacement"]').waitFor({ state: 'attached' });
  assert.equal(await placeholder.count(), 0, 'Replacement has no shrinking spacer');
  const replacementFrames = await page.evaluate(async () => {
    const frames = [];
    for (let index = 0; index < 12; index++) {
      const viewport = document.querySelector('[data-slot="chat-scroll-viewport"]');
      const replacement = viewport.querySelector('[data-slot="typing-replacement"]');
      const typing = replacement.querySelector('[data-slot="typing-bubble"]');
      const message = document.querySelector('[data-chat-entrance]');
      frames.push({
        scrollHeight: viewport.scrollHeight,
        distance: viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop,
        height: replacement.getBoundingClientRect().height,
        typingY: new DOMMatrix(getComputedStyle(typing).transform).m42,
        messageY: new DOMMatrix(getComputedStyle(message).transform).m42,
        alignment: typing.getBoundingClientRect().top - message.getBoundingClientRect().top,
        typingOpacity: Number(getComputedStyle(typing).opacity),
        messageOpacity: Number(getComputedStyle(message).opacity),
      });
      await new Promise(requestAnimationFrame);
    }
    return frames;
  });
  for (const [index, frame] of replacementFrames.entries()) {
    assert.equal(frame.height, 0);
    assert.ok(frame.distance <= 1, 'Replacement expansion stays pinned');
    if (index)
      assert.ok(
        frame.scrollHeight >= replacementFrames[index - 1].scrollHeight,
        'Replacement grows without a temporary overshoot and collapse'
      );
    assert.equal(frame.typingY, 0);
    assert.equal(frame.messageY, 0);
    assert.ok(Math.abs(frame.alignment) < 0.1, 'Typing overlays the replacement message');
  }
  assert.ok(replacementFrames.at(-1).typingOpacity < replacementFrames[0].typingOpacity);
  assert.ok(replacementFrames.at(-1).messageOpacity > replacementFrames[0].messageOpacity);
  assert.equal(await lastMessage.getAttribute('data-tail'), 'true', 'Receive restores the tail immediately');
  assert.equal(await viewport.locator('[data-message-id]').count(), count + 1);
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
  await page.getByText('1×', { exact: true }).click();
  await gone();
  await settled();

  // User input during collapse must relinquish following immediately.
  await page.getByText('0.25×', { exact: true }).click();
  await toggle.click();
  await settled();
  await toggle.click();
  await placeholder.waitFor({ state: 'attached' });
  await viewport.hover();
  await page.mouse.wheel(0, -300);
  await page.waitForFunction(() => document.querySelector('#storybook-root strong')?.textContent === 'detached');
  await page.waitForTimeout(120);
  const detachedTop = await top();
  await gone();
  assert.equal(await top(), detachedTop);
  await toggle.click();
  await indicator.waitFor();
  await receive.click();
  await gone();
  assert.equal(await top(), detachedTop, 'Receiving during history browsing preserves position');

  // Reduced motion removes the placeholder immediately, including mid-exit.
  await input.fill('Back to the latest message.');
  await input.press('Enter');
  await settled();
  await toggle.click();
  await settled();
  await toggle.click();
  await placeholder.waitFor({ state: 'attached' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gone();
  await settled();
  await toggle.click();
  await indicator.waitFor();
  await toggle.click();
  await gone();
  assert.equal(await placeholder.count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: measured exit gaps, continuous bottom alignment, fade, tail timing, reopen, receive, speed, native interruption, history preservation, reduced motion.'
  );
} finally {
  await browser.close();
}
