/** Retarget carries wall-clock velocity, including slowed playback, instead of restarting from rest. */
import assert from 'node:assert/strict';

import { chromium } from 'playwright';

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(
    `${process.env.STORYBOOK_URL ?? 'http://localhost:6010'}/iframe.html?id=components-chat-scroll-container--send-messages&viewMode=story`
  );
  await page.locator('[data-slot="chat-scroll-viewport"]').waitFor();
  const results = await page.evaluate(async () => {
    const { createScrollAnchorController } = await import('/src/components/scroll-anchor/scroll-anchor-controller.ts');
    const results = [];
    for (const speed of [0.25, 1]) {
      const viewport = document.createElement('div');
      viewport.style.cssText =
        'position:fixed;inset:0 auto auto 0;width:100px;height:100px;overflow:auto;overflow-anchor:none';
      const content = document.createElement('div');
      content.style.height = '4000px';
      viewport.append(content);
      document.body.append(viewport);
      let state;
      const controller = createScrollAnchorController(viewport, content, {
        threshold: 2,
        reducedMotion: false,
        animationSpeed: speed,
        onStateChange: (next) => {
          state = next;
        },
      });
      try {
        // Initial positioning is ResizeObserver-driven. Three rAF callbacks do
        // not guarantee that delivery on a cold Storybook load; wait for geometry.
        const readyBy = performance.now() + 5000;
        while (state?.mode !== 'following' || Math.abs(viewport.scrollTop - 3900) > 1) {
          if (performance.now() > readyBy) throw new Error('Initial bottom was not measured');
          await new Promise(requestAnimationFrame);
        }
        viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: -200 }));
        viewport.scrollTop -= 200;
        viewport.dispatchEvent(new Event('scroll'));
        const origin = viewport.scrollTop;
        controller.layoutChanged({ follow: true });
        const timeout = performance.now() + 5000;
        while (viewport.scrollTop < origin + 70 || !(state.velocity > 0)) {
          if (performance.now() > timeout) throw new Error('The first spring did not advance');
          await new Promise(requestAnimationFrame);
        }
        const velocity = state.velocity;
        content.style.height = '4200px';
        controller.layoutChanged({ follow: true });
        // stop() may advance the old spring; the new spring starts at this actual position.
        const startTop = viewport.scrollTop,
          start = performance.now();
        while (performance.now() - start < 80) await new Promise(requestAnimationFrame);
        const elapsed = (performance.now() - start) / 1000;
        const omega = 15 * speed;
        const phase = omega * elapsed;
        const fromRest = (4100 - startTop) * (1 - (1 + phase) * Math.exp(-phase));
        const carried = velocity * elapsed * Math.exp(-phase);
        results.push({ speed, velocity, elapsed, fromRest, carried, actual: viewport.scrollTop - startTop });
      } finally {
        controller.dispose();
        viewport.remove();
      }
    }
    return results;
  });
  for (const result of results) {
    const excess = result.actual - result.fromRest;
    assert.ok(result.carried > 5, 'Exercise a meaningful inherited velocity');
    // Browser/frame timing and MotionValue's sampled velocity are approximate.
    // Zero velocity and multiplying it by playback speed again both fail this range.
    assert.ok(excess > result.carried * 0.45 && excess < result.carried * 1.8 + 2, JSON.stringify(result));
    console.log(
      `PASS: retarget at ${result.speed}x carries velocity; excess travel ${excess.toFixed(2)}px, expected about ${result.carried.toFixed(2)}px.`
    );
  }
} finally {
  await browser.close();
}
