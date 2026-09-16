/** A settled bottom follows layout directly: the content-end line must not bounce or start a catch-up spring. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

import { chromium } from 'playwright';

const base = process.env.STORYBOOK_URL ?? 'http://localhost:6010';
const artifact = process.env.CHAT_BOTTOM_LINE_ARTIFACT ?? '/tmp/chat-bottom-line.json';
const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
const results = [];
const errors = [];

try {
  const page = await browser.newPage({
    viewport: { width: 940, height: 1000 },
    deviceScaleFactor: 2,
    reducedMotion: 'no-preference',
  });
  page.on('pageerror', (error) => errors.push(error.message));

  async function settle() {
    await page.waitForFunction(() => {
      const viewport = document.querySelector('[data-slot="chat-scroll-viewport"]');
      return (
        document.querySelector('#storybook-root strong')?.textContent === 'following' &&
        viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 1 &&
        !document.querySelector(
          '[data-chat-inserting], [data-chat-entrance], [data-chat-send-flight], [data-slot="typing-entry-placeholder"], [data-slot="typing-exit-placeholder"], [data-slot="typing-replacement"]'
        )
      );
    });
    // Include the final native scroll event and the controller's deferred state report.
    await page.waitForTimeout(100);
  }

  const click = (name) => page.getByRole('button', { name, exact: true }).click();
  const toggle = () => page.getByRole('button', { name: /^Typing (on|off)$/ }).click();
  const cases = [
    { name: 'typing on', run: toggle },
    { name: 'typing off', typing: true, run: toggle },
    {
      name: 'typing off then reopen during exit',
      typing: true,
      run: async () => {
        await toggle();
        await page.waitForTimeout(100);
        await toggle();
      },
    },
    { name: 'append incoming', run: () => click('Receive a message') },
    { name: 'append incoming while typing', typing: true, run: () => click('Receive a message') },
    {
      name: 'replace partial typing with incoming',
      run: async () => {
        await toggle();
        await page.waitForTimeout(100);
        await click('Receive a message and turn typing off');
      },
    },
    { name: 'insert outgoing before last message', run: () => click('Insert outgoing in history') },
    { name: 'insert incoming before last message', run: () => click('Insert incoming in history') },
    { name: 'send from composer', run: () => click('Send a message') },
    { name: 'send from composer while typing', typing: true, run: () => click('Send a message') },
  ];

  // An optional name fragment reruns one interaction without changing the default suite.
  const selectedCases = cases.filter((test) => !process.argv[2] || test.name.includes(process.argv[2]));
  assert.ok(selectedCases.length > 0, 'The case filter must match at least one interaction');
  for (const speed of [0.1, 1]) {
    for (const test of selectedCases) {
      await page.goto(
        `${base}/iframe.html?id=components-chat-scroll-container--insert-in-history&viewMode=story&globals=outline:!true`
      );
      await page.getByText(`${speed}×`, { exact: true }).click();
      // Fix the sample selection, including a short composer send that leaves clearance unchanged.
      await page.evaluate(() => {
        Math.random = () => 0;
      });
      await settle();
      if (test.typing) {
        await toggle();
        await settle();
      }
      await page.evaluate(() => {
        const viewport = document.querySelector('[data-slot="chat-scroll-viewport"]');
        const content = viewport.firstElementChild;
        const padding =
          Number.parseFloat(getComputedStyle(content).paddingBottom) +
          (content.querySelector('[data-slot="chat-bottom-space"]')?.getBoundingClientRect().height ?? 0);
        const beforeHeight = viewport.scrollHeight;
        // Instrumentation only. A zero-height sibling follows the ol in normal flow,
        // translated past its trailing clearance to the end of all rows, including typing.
        // Keeping it outside the ol leaves row ordering, gap ownership, and typing lookup intact.
        // It has no fixed/sticky positioning, animation, or scroll listener of its own.
        const line = document.createElement('div');
        line.dataset.chatBottomLine = '';
        line.setAttribute('aria-hidden', 'true');
        line.style.cssText = `height:0;min-height:0;margin:0;padding:0;border:0;box-shadow:0 -1px #f59e0b;pointer-events:none;transform:translateY(-${padding}px)`;
        viewport.append(line);
        const state = document.querySelector('#storybook-root strong');
        const read = () => ({
          time: performance.now(),
          // Relative to the viewport so unrelated page positioning cannot masquerade as drift.
          y: line.getBoundingClientRect().top - viewport.getBoundingClientRect().top,
          contentHeight: content.getBoundingClientRect().height,
          scrollTop: viewport.scrollTop,
          distance: viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop,
          mode: state.textContent,
          padding:
            Number.parseFloat(getComputedStyle(content).paddingBottom) +
            (content.querySelector('[data-slot="chat-bottom-space"]')?.getBoundingClientRect().height ?? 0),
        });
        const baseline = read();
        window.bottomLineProbe = {
          baseline,
          frames: [baseline],
          modes: [state.textContent],
          beforeHeight,
          afterHeight: viewport.scrollHeight,
        };
        const observer = new MutationObserver(() => window.bottomLineProbe.modes.push(state.textContent));
        observer.observe(state, { childList: true, characterData: true, subtree: true });
        let running = true;
        const tick = () => {
          window.bottomLineProbe.frames.push(read());
          if (running) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        window.stopBottomLineProbe = () => {
          running = false;
          observer.disconnect();
          window.bottomLineProbe.frames.push(read());
          return window.bottomLineProbe;
        };
      });
      await test.run();
      // The composer button fills first, then submits after layout. Do not let an
      // idle frame between those steps satisfy the end-of-animation condition.
      await page.waitForFunction(() => {
        const probe = window.bottomLineProbe;
        return probe.frames.some((frame) => Math.abs(frame.contentHeight - probe.baseline.contentHeight) > 2);
      });
      await settle();
      const probe = await page.evaluate(() => window.stopBottomLineProbe());
      const ys = probe.frames.map((frame) => frame.y);
      const heights = probe.frames.map((frame) => frame.contentHeight);
      const summary = {
        name: test.name,
        speed,
        frames: probe.frames.length,
        excursion: Math.max(...ys) - Math.min(...ys),
        maxDrift: Math.max(...ys.map((y) => Math.abs(y - probe.baseline.y))),
        heightTravel: Math.max(...heights) - Math.min(...heights),
        modes: [...new Set(probe.modes)],
      };
      results.push({ ...summary, probe });
      await writeFile(artifact, JSON.stringify(results));
      console.log(JSON.stringify(summary));
    }
  }
  for (const result of results) {
    const context = `${result.name} at ${result.speed}x`;
    assert.equal(result.probe.beforeHeight, result.probe.afterHeight, `${context}: marker adds no scroll extent`);
    assert.ok(result.heightTravel > 2, `${context}: real animated layout changed during sampling`);
    assert.ok(result.frames > 5, `${context}: samples include the transition, not just endpoints`);
    assert.ok(
      result.probe.frames.every((frame) => frame.padding === result.probe.baseline.padding),
      `${context}: clearance stays fixed`
    );
    // Native scroll offsets and integer scrollHeight can disagree by a CSS pixel.
    // Both total excursion and baseline drift are bounded: gradual drift cannot pass.
    assert.ok(
      result.excursion <= 1 && result.maxDrift <= 1,
      `${context}: line moved ${result.excursion}px (baseline drift ${result.maxDrift}px)`
    );
    assert.deepEqual(result.modes, ['following'], `${context}: no detached or animating catch-up phase`);
    assert.ok(
      result.probe.frames.every((frame) => Math.abs(frame.distance) <= 1),
      `${context}: stays at the native bottom`
    );
  }
  assert.deepEqual(errors, []);
  console.log(`PASS: ${results.length} bottom-line sequences. Frame samples: ${artifact}`);
} finally {
  await browser.close();
}
