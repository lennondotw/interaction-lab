/** Ordinary draft edits change clearance without restarting flight or acquiring scroll intent. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

import { chromium } from 'playwright';

const base = process.env.STORYBOOK_URL ?? 'http://localhost:6010';
const browser = await chromium.launch();
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 }, reducedMotion: 'no-preference' });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const field = page.locator('textarea');
  const viewport = page.locator('[data-slot="chat-scroll-viewport"]');

  async function open() {
    await page.goto(
      `${base}/iframe.html?id=components-chat-scroll-container--insert-in-history&viewMode=story&globals=outline:!true`
    );
    await page.getByText('0.1×', { exact: true }).click();
    await page.waitForFunction(() => {
      const view = document.querySelector('[data-slot="chat-scroll-viewport"]');
      return (
        document.querySelector('#storybook-root strong')?.textContent === 'following' &&
        view.scrollHeight - view.clientHeight - view.scrollTop <= 1
      );
    });
    await page.evaluate(async () => {
      const { finalChatBottom, hasChatLayoutAnimation } =
        await import('/src/components/chat-scroll-container/chat-layout.ts');
      const view = document.querySelector('[data-slot="chat-scroll-viewport"]');
      window.readFlightComposer = () => {
        const flight = document.querySelector('[data-chat-send-flight]');
        const real = flight && view.querySelector(`[data-message-id="${flight.dataset.messageId}"]`);
        return {
          time: performance.now(),
          top: view.scrollTop,
          bottom: view.scrollHeight - view.clientHeight,
          target: finalChatBottom(view),
          height: document.querySelector('textarea').getBoundingClientRect().height,
          clearance: view.querySelector('[data-slot="chat-bottom-space"]').getBoundingClientRect().height,
          mode: document.querySelector('#storybook-root strong').textContent,
          flying: !!flight,
          alignment: flight ? flight.getBoundingClientRect().top - real.getBoundingClientRect().top : null,
          layout: hasChatLayoutAnimation(view),
        };
      };
      window.startFlightComposer = () => {
        const frames = [];
        let frame;
        const tick = () => {
          frames.push(window.readFlightComposer());
          frame = requestAnimationFrame(tick);
        };
        tick();
        window.stopFlightComposer = () => {
          cancelAnimationFrame(frame);
          return frames;
        };
      };
    });
  }
  const read = () => page.evaluate(() => window.readFlightComposer());

  // Slow playback guarantees that all four edits overlap a real flight. Other
  // suites cover normal-speed springs and velocity; do not duplicate that matrix.
  for (const kind of ['pinned', 'history', 'interrupted']) {
    await open();
    await field.fill('A message in flight.');
    if (kind === 'history') {
      await viewport.hover();
      await page.mouse.wheel(0, -100);
      await page.waitForFunction(() => window.readFlightComposer().mode === 'detached');
    }
    await page.evaluate(() => document.querySelector('form').requestSubmit());
    await page.waitForSelector('[data-chat-send-flight]');
    if (kind === 'interrupted') {
      await viewport.hover();
      await page.mouse.wheel(0, -150);
      await page.waitForFunction(() => {
        const state = window.readFlightComposer();
        return state.mode === 'detached' && !state.flying;
      });
    } else {
      await page.waitForFunction(
        (mode) => window.readFlightComposer().mode === mode,
        kind === 'pinned' ? 'following' : 'animating'
      );
    }
    await field.fill('Draft line 1');
    const baseline = await read();
    await page.evaluate(() => window.startFlightComposer());
    const edits = [];
    for (const lines of [2, 3, 2, 1]) {
      const before = await read();
      assert.equal(
        before.flying,
        kind !== 'interrupted',
        'Exercise edits during flight, or after explicit cancellation'
      );
      await field.fill(Array.from({ length: lines }, (_, index) => `Draft line ${index + 1}`).join('\n'));
      const after = await read();
      assert.equal(after.height, 35 + 17 * (lines - 1));
      assert.equal(
        after.clearance - baseline.clearance,
        after.height - baseline.height,
        'Ordinary edits update clearance immediately, without an animated release'
      );
      assert.ok(
        Math.abs(after.target - baseline.target - (after.height - baseline.height)) <= 1,
        'Catch-up geometry incorporates the complete new clearance'
      );
      assert.equal(after.flying, kind !== 'interrupted', 'Composer edits preserve the active flight');
      edits.push({ lines, before, after });
    }
    if (kind === 'history') {
      assert.ok(
        edits.some(
          ({ before, after }) =>
            before.mode === 'animating' && after.mode === 'animating' && after.bottom - after.top > 1
        ),
        'A resize during catch-up updates the target without snapping to bottom'
      );
    }
    // Handoff precedes spring rest: after the flight releases, catch-up can still
    // be finishing its sub-pixel tail at 0.1x. Sample the end once intent settles.
    await page.waitForFunction(
      () => {
        const state = window.readFlightComposer();
        return !state.flying && !state.layout && state.mode !== 'animating';
      },
      undefined,
      { timeout: 20000 }
    );
    const frames = await page.evaluate(() => window.stopFlightComposer());
    const end = await read();
    if (kind === 'interrupted') {
      assert.ok(
        frames.every((frame) => frame.mode === 'detached' && !frame.flying && Math.abs(frame.top - baseline.top) <= 1),
        'Cancelled flight stays cancelled; all subsequent edits preserve detached reading'
      );
    } else {
      assert.equal(end.mode, 'following');
      assert.ok(Math.abs(end.bottom - end.top) <= 1, 'Reaches actual bottom without rescue input');
      assert.ok(
        frames.every((frame) => frame.mode !== 'detached'),
        'Layout changes never become user escape'
      );
      const flying = frames.filter((frame) => frame.flying);
      assert.ok(flying.length > 1, 'Sample live flight, including its final approach');
      assert.ok(Math.abs(flying.at(-1).alignment) <= 1, 'Normal handoff occurs at the real bubble');
      if (kind === 'pinned') {
        assert.ok(
          frames.every((frame) => frame.mode === 'following' && Math.abs(frame.bottom - frame.top) <= 1),
          'Settled following stays pinned through growth and shrinkage without starting catch-up'
        );
      }
    }
    results.push({ kind, baseline, edits, frames, end });
    console.log(`PASS: flight/composer ${kind}, 1→2→3→2→1 (${frames.length} frames)`);
  }

  // Physical bottom and follow intent differ: native clamping after an ordinary
  // shrink must not acquire following, even though the viewport lands at bottom.
  await open();
  await field.fill('One\nTwo\nThree');
  await viewport.hover();
  await page.mouse.wheel(0, -8);
  await page.waitForFunction(() => window.readFlightComposer().mode === 'detached');
  const before = await read();
  assert.ok(before.bottom - before.top > 0 && before.bottom - before.top < 34);
  await page.evaluate(() => window.startFlightComposer());
  await field.fill('One');
  const after = await read();
  assert.equal(before.clearance - after.clearance, 34, 'Shrink is immediate');
  assert.ok(after.top < before.top && Math.abs(after.top - after.bottom) <= 1, 'Browser clamps to the smaller range');
  // Grow once more to prove that physical contact with bottom did not reacquire follow.
  await field.fill('One\nTwo');
  await page.evaluate(async () => {
    for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
  });
  const end = await read();
  const frames = await page.evaluate(() => window.stopFlightComposer());
  assert.ok(
    frames.every((frame) => frame.mode === 'detached'),
    'Native clamp does not restore follow intent'
  );
  assert.ok(
    Math.abs(end.top - after.top) <= 1 && end.bottom - end.top >= 16,
    'Next growth preserves the clamped reading position instead of following'
  );
  results.push({ kind: 'detached-clamp', before, after, frames, end });
  console.log('PASS: immediate detached shrink clamps physically without reacquiring following');
  assert.deepEqual(errors, []);
} finally {
  await writeFile('/tmp/chat-flight-composer.json', JSON.stringify(results, null, 2));
  await browser.close();
}
