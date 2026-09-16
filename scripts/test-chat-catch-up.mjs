/** Small upward escape, then one/two local sends: continuous catch-up and aligned flight handoff. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

import { chromium } from 'playwright';

const base = process.env.STORYBOOK_URL ?? 'http://localhost:6010';
const browser = await chromium.launch();
const results = [];
try {
  const page = await browser.newPage({
    viewport: { width: 940, height: 1000 },
    deviceScaleFactor: 2,
    reducedMotion: 'no-preference',
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const speed of [0.1, 1]) {
    for (const distance of [8, 100]) {
      for (const count of [1, 2]) {
        await page.goto(
          `${base}/iframe.html?id=components-chat-scroll-container--insert-in-history&viewMode=story&globals=outline:!true`
        );
        await page.getByText(`${speed}×`, { exact: true }).click();
        await page.waitForFunction(() => document.querySelector('#storybook-root strong')?.textContent === 'following');
        const viewport = page.locator('[data-slot="chat-scroll-viewport"]');
        await viewport.hover();
        await page.mouse.wheel(0, -distance);
        await page.waitForFunction(() => document.querySelector('#storybook-root strong')?.textContent === 'detached');
        await page.waitForFunction((distance) => {
          const v = document.querySelector('[data-slot="chat-scroll-viewport"]');
          return Math.abs(v.scrollHeight - v.clientHeight - v.scrollTop - distance) <= 1;
        }, distance);
        await page.evaluate(async (count) => {
          const { finalChatBottom } = await import('/src/components/chat-scroll-container/chat-layout.ts');
          const viewport = document.querySelector('[data-slot="chat-scroll-viewport"]');
          const content = viewport.firstElementChild;
          const oldLast = [...content.querySelectorAll('[data-message-id]')].at(-1);
          const initialCount = content.querySelectorAll('[data-message-id]').length;
          const read = () => ({
            time: performance.now(),
            top: viewport.scrollTop,
            bottom: viewport.scrollHeight - viewport.clientHeight,
            finalBottom: finalChatBottom(viewport),
            end:
              content.getBoundingClientRect().bottom -
              (Number.parseFloat(getComputedStyle(content).paddingBottom) +
                (content.querySelector('[data-slot="chat-bottom-space"]')?.getBoundingClientRect().height ?? 0)) -
              viewport.getBoundingClientRect().top,
            oldTop: oldLast.getBoundingClientRect().top,
            mode: document.querySelector('#storybook-root strong').textContent,
            count: content.querySelectorAll('[data-message-id]').length - initialCount,
            flights: [...document.querySelectorAll('[data-chat-send-flight]')].map((node) => ({
              id: node.dataset.messageId,
              top: node.getBoundingClientRect().top,
            })),
          });
          const baseline = read();
          window.catchUp = { baseline, frames: [baseline], commits: [], handoffs: [] };
          let pending;
          // Keyboard input can precede a concurrent React commit by a frame.
          // Capture the commit itself, while the old animation is still at its
          // current position, instead of calling that elapsed motion a jump.
          // oxlint-disable-next-line typescript/unbound-method -- Instrumentation calls the saved method with its original receiver.
          const appendChild = Node.prototype.appendChild;
          // oxlint-disable-next-line typescript/unbound-method -- Instrumentation calls the saved method with its original receiver.
          const insertBefore = Node.prototype.insertBefore;
          const beforeInsert = (parent, node) => {
            if (parent === content && node instanceof Element && node.hasAttribute('data-chat-row-id'))
              pending = read();
          };
          Node.prototype.appendChild = function (node) {
            beforeInsert(this, node);
            return appendChild.call(this, node);
          };
          Node.prototype.insertBefore = function (node, reference) {
            beforeInsert(this, node);
            return insertBefore.call(this, node, reference);
          };
          const observer = new MutationObserver(() => {
            if (!pending) return;
            const after = read();
            if (after.count !== pending.count) {
              window.catchUp.commits.push({ before: pending, after });
              pending = undefined;
            }
          });
          observer.observe(content, { childList: true, subtree: true, attributes: true });
          // Capture the last painted flight immediately before removal; a later
          // MutationObserver cannot measure the geometry of a disconnected node.
          // oxlint-disable-next-line typescript/unbound-method -- Instrumentation calls the saved method with its original receiver.
          const remove = Element.prototype.remove;
          Element.prototype.remove = function () {
            if (this.getAttribute('data-slot') === 'chat-send-flight-layer') {
              const flight = this.querySelector('[data-chat-send-flight]');
              const target = content.querySelector(`[data-message-id="${flight.dataset.messageId}"]`);
              window.catchUp.handoffs.push({
                id: flight.dataset.messageId,
                difference: Math.abs(flight.getBoundingClientRect().top - target.getBoundingClientRect().top),
                distance: viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop,
                inserting: Boolean(content.querySelector('[data-chat-inserting]')),
              });
            }
            return remove.call(this);
          };
          let running = true;
          const tick = () => {
            window.catchUp.frames.push(read());
            if (running) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          window.stopCatchUp = () => {
            running = false;
            observer.disconnect();
            Element.prototype.remove = remove;
            Node.prototype.appendChild = appendChild;
            Node.prototype.insertBefore = insertBefore;
            window.catchUp.frames.push(read());
            return window.catchUp;
          };
          if (count === 2) {
            const { commitChatFrame } =
              await import('/src/components/chat-scroll-container/__tests__/chat-contract-fixture.tsx');
            // Arm before the first send. Host-side fill/press round trips can outlast
            // a 1x catch-up, turning this into two unrelated settled sends.
            const sendWhenAnimating = () => {
              if (read().mode !== 'animating') {
                requestAnimationFrame(sendWhenAnimating);
                return;
              }
              void commitChatFrame(() => {
                const field = document.querySelector('textarea');
                Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, '1');
                field.dispatchEvent(new Event('input', { bubbles: true }));
              }).then(() => document.querySelector('form').requestSubmit());
            };
            requestAnimationFrame(sendWhenAnimating);
          }
        }, count);
        const input = page.getByRole('textbox', { name: 'Message', exact: true });
        await input.fill('1');
        await input.press('Enter');
        await page.waitForFunction((count) => {
          const v = document.querySelector('[data-slot="chat-scroll-viewport"]');
          return (
            window.catchUp.commits.length === count &&
            document.querySelector('#storybook-root strong')?.textContent === 'following' &&
            v.scrollHeight - v.clientHeight - v.scrollTop <= 1 &&
            !document.querySelector('[data-chat-inserting], [data-chat-send-flight]')
          );
        }, count);
        // No rescue wheel or programmatic scroll is allowed after sending.
        await page.waitForTimeout(100);
        const result = await page.evaluate(() => window.stopCatchUp());
        results.push({ speed, distance, count, ...result });
        await writeFile('/tmp/chat-catch-up.json', JSON.stringify(results));
        const { baseline, frames, commits, handoffs } = result;
        const last = frames.at(-1);
        assert.equal(baseline.mode, 'detached');
        assert.equal(last.count, count);
        assert.equal(last.mode, 'following');
        assert.ok(Math.abs(last.bottom - last.top) <= 1, 'Finite sends converge to the real bottom');
        const firstAnimating = frames.findIndex((frame) => frame.mode === 'animating');
        assert.ok(firstAnimating >= 0, 'Exercise catch-up, not an already settled append');
        assert.ok(
          frames.slice(firstAnimating).every((frame) => frame.mode !== 'detached'),
          'No layout-induced escape'
        );
        assert.equal(handoffs.length, count, 'Every distinct message releases its flight');
        assert.equal(
          new Set(handoffs.map((handoff) => handoff.id)).size,
          count,
          'Identical text still has distinct flights'
        );
        assert.ok(
          handoffs.every((handoff) => handoff.difference <= 1 && handoff.distance <= 1 && !handoff.inserting),
          'Handoff is aligned and layout has finished'
        );
        for (const commit of commits) {
          // Motion stop() can sample the old spring at the current timestamp.
          // That legitimately advances scrolling during retarget. Compare content
          // coordinates here; frame-rate bounds below check the visible trajectory.
          assert.ok(
            Math.abs(commit.after.end + commit.after.top - commit.before.end - commit.before.top) <= 1,
            'The zero-height insertion does not teleport the content end'
          );
          assert.ok(
            Math.abs(commit.after.oldTop + commit.after.top - commit.before.oldTop - commit.before.top) <= 1,
            'Existing content does not jump on insertion'
          );
          for (const flight of commit.before.flights) {
            const after = commit.after.flights.find((candidate) => candidate.id === flight.id);
            assert.ok(after && Math.abs(after.top - flight.top) <= 1, 'A second send does not reset the first flight');
          }
        }
        if (count === 2) {
          assert.equal(commits[1].before.mode, 'animating', 'Second send arrives during the first catch-up');
          assert.equal(commits[1].before.flights.length, 1);
          assert.ok(
            frames.some((frame) => frame.flights.length === 2),
            'Both flights overlap'
          );
          assert.ok(
            commits[1].after.finalBottom > commits[0].after.finalBottom + 1,
            'Second send changes the projected target'
          );
        }
        for (let inserted = 1; inserted <= count; inserted++) {
          const targets = frames.filter((frame) => frame.count === inserted).map((frame) => frame.finalBottom);
          assert.ok(
            Math.max(...targets) - Math.min(...targets) <= 0.5,
            'Expansion alone does not move the final target'
          );
        }
        // A finite-rate bound detects frame-scale teleports, especially at 0.1x.
        // It permits velocity changes at a moving boundary; it is not a proof of C1 continuity.
        // Two critical-spring response envelopes conservatively cover the inherited
        // velocity at one retarget. Layout/handoff checks above use the tighter 1px bound.
        const travel = last.top - baseline.top;
        const rateBound = (2 * 28 * speed * travel) / Math.E;
        for (let index = 1; index < frames.length; index++) {
          const before = frames[index - 1],
            after = frames[index];
          const allowed = 1 + (rateBound * (after.time - before.time)) / 1000;
          assert.ok(
            Math.abs(after.top - before.top) <= allowed,
            `Scroll discontinuity: ${after.top - before.top}px > ${allowed}px`
          );
          assert.ok(
            Math.abs(after.end - before.end) <= 2 * allowed,
            'Content-end trajectory has no frame-scale teleport'
          );
        }
        console.log(
          `PASS: ${speed}x, ${distance}px upward, ${count} send(s); ${frames.length} frames, aligned handoff(s).`
        );
      }
    }
  }
  // Force both relative speeds without changing production parameters. This uses
  // the real controller and projection registry with analytically expanded content.
  // The slow layout deliberately makes the scroll spring hit the current boundary.
  const boundaryResults = await page.evaluate(async () => {
    const { createChatScrollController } =
      await import('/src/components/chat-scroll-container/chat-scroll-controller.ts');
    const { registerChatTransition, finalChatBottom } =
      await import('/src/components/chat-scroll-container/chat-layout.ts');
    const results = [];
    for (const frequency of [10, 40]) {
      for (const count of [1, 2]) {
        const viewport = document.createElement('div');
        viewport.style.cssText =
          'position:fixed;left:0;top:0;width:100px;height:100px;overflow:auto;overflow-anchor:none';
        const content = document.createElement('div');
        content.style.cssText = 'height:400px;padding:0;margin:0';
        viewport.append(content);
        document.body.append(viewport);
        let state;
        const states = [];
        const controller = createChatScrollController(viewport, content, {
          threshold: 20,
          reducedMotion: false,
          animationSpeed: 1,
          onStateChange: (next) => {
            state = next;
            states.push(next);
          },
        });
        let release = () => {};
        try {
          for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
          viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: -8 }));
          viewport.scrollTop -= 8;
          viewport.dispatchEvent(new Event('scroll'));
          for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame);
          const entry = { row: content, remaining: 36, gapRemaining: 0 };
          release = registerChatTransition(viewport, entry);
          states.length = 0;
          controller.contentChanged(true, { animatedLayout: true });
          const starts = [performance.now()];
          const frames = [];
          await new Promise((resolve, reject) => {
            const tick = () => {
              const now = performance.now();
              if (now - starts[0] > 5000) return reject(new Error('Boundary fixture did not settle'));
              const send = count === 2 && starts.length === 1 && now - starts[0] >= 90;
              if (send) starts.push(now);
              const target = 400 + 36 * starts.length;
              const remaining = starts.reduce((sum, start) => {
                const phase = (frequency * (now - start)) / 1000;
                return sum + 36 * (1 + phase) * Math.exp(-phase);
              }, 0);
              content.style.height = `${remaining < 0.001 ? target : target - remaining}px`;
              entry.remaining = target - content.getBoundingClientRect().height;
              controller.contentChanged(send, { animatedLayout: true });
              frames.push({
                time: now,
                top: viewport.scrollTop,
                bottom: viewport.scrollHeight - viewport.clientHeight,
                remaining: entry.remaining,
                target: finalChatBottom(viewport),
                mode: state?.mode,
              });
              if (
                starts.length === count &&
                entry.remaining === 0 &&
                state?.mode === 'following' &&
                Math.abs(viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop) <= 1
              )
                resolve();
              else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });
          results.push({ frequency, count, frames, modes: states.map((value) => value.mode) });
        } finally {
          release();
          controller.dispose();
          viewport.remove();
        }
      }
    }
    return results;
  });
  await writeFile('/tmp/chat-catch-up-boundaries.json', JSON.stringify(boundaryResults));
  for (const result of boundaryResults) {
    const last = result.frames.at(-1);
    assert.equal(last.mode, 'following');
    assert.ok(Math.abs(last.top - (300 + 36 * result.count)) <= 1, 'Final bottom reached regardless of relative speed');
    assert.ok(
      result.modes.every((mode) => mode !== 'detached'),
      'Boundary clamping does not cancel follow'
    );
    const caughtBoundary = result.frames.some(
      (frame) => frame.mode === 'animating' && frame.remaining > 2 && Math.abs(frame.bottom - frame.top) <= 1
    );
    assert.equal(caughtBoundary, result.frequency === 10, 'Exercise both boundary-limited and unconstrained catch-up');
    const bound = (2 * Math.max(22, result.frequency) * (8 + 36 * result.count)) / Math.E;
    for (let i = 1; i < result.frames.length; i++) {
      const a = result.frames[i - 1],
        b = result.frames[i];
      assert.ok(
        Math.abs(b.top - a.top) <= 1 + (bound * (b.time - a.time)) / 1000,
        'Boundary handover has no frame-scale teleport'
      );
    }
    console.log(
      `PASS: layout ${result.frequency}/1 vs scroll 22/1, ${result.count} send(s), boundary-limited=${caughtBoundary}.`
    );
  }

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
