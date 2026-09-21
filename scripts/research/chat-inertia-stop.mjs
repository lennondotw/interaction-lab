import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

/** Manual research probe, not a CI regression or a portable momentum-cancellation contract. */
import { chromium } from 'playwright';

const storybook = process.env.STORYBOOK_URL ?? 'http://localhost:6009';
const output = resolve(process.env.OUTPUT ?? 'artifacts/research/chat-inertia-stop.json');
await mkdir(dirname(output), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 430, height: 1000 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
});
const cdp = await page.context().newCDPSession(page);
console.log('browser', browser.version());
const results = [];
try {
  for (const method of process.env.METHODS?.split(',') ?? [
    'baseline',
    'same-position',
    'instant-plus-one',
    'prevent-default',
    'touch-action',
    'hidden-sync-flush',
    'hidden-one-frame',
    'hidden-two-frames',
    'hidden-four-frames',
    'hidden-100ms',
  ]) {
    for (let trial = 0; trial < 2; trial++) {
      await page.goto(
        `${storybook}/iframe.html?id=components-chat-scroll-container--with-message-input&viewMode=story&reactScan=false`
      );
      const viewport = page.locator('[data-slot="chat-scroll-viewport"]');
      await viewport.waitFor();
      await page.waitForTimeout(500);
      await page.evaluate((method) => {
        const v = document.querySelector('[data-slot="chat-scroll-viewport"]');
        window.probe = {
          method,
          events: [],
          samples: [],
          capabilities: { momentum: 'momentum' in WheelEvent.prototype, scrollend: 'onscrollend' in v },
        };
        const p = window.probe;
        const read = () => ({ t: performance.now(), top: v.scrollTop, width: v.clientWidth, height: v.scrollHeight });
        for (const type of ['touchstart', 'touchmove', 'touchend', 'pointercancel', 'wheel', 'scroll', 'scrollend'])
          v.addEventListener(
            type,
            (e) => p.events.push({ ...read(), type, cancelable: e.cancelable, trusted: e.isTrusted }),
            { passive: true }
          );
        v.addEventListener(
          'touchend',
          () =>
            setTimeout(() => {
              p.before = read();
              const previous = v.style.overflowY;
              const restore = () => {
                v.style.overflowY = previous;
                p.restored = read();
              };
              if (method === 'same-position') v.scrollTo({ top: v.scrollTop, behavior: 'instant' });
              if (method === 'instant-plus-one') v.scrollTo({ top: v.scrollTop + 1, behavior: 'instant' });
              if (method === 'prevent-default')
                for (const type of ['touchmove', 'wheel', 'scroll'])
                  v.addEventListener(
                    type,
                    (e) => {
                      if (e.cancelable) e.preventDefault();
                      p.events.push({
                        ...read(),
                        type: 'blocked-' + type,
                        cancelable: e.cancelable,
                        prevented: e.defaultPrevented,
                      });
                    },
                    { passive: false }
                  );
              if (method === 'touch-action') v.style.touchAction = 'none';
              if (method.startsWith('hidden')) {
                v.style.overflowY = 'hidden';
                void v.offsetHeight;
                p.hidden = read();
                if (method === 'hidden-sync-flush') restore();
                if (method === 'hidden-one-frame') requestAnimationFrame(restore);
                if (method === 'hidden-two-frames') requestAnimationFrame(() => requestAnimationFrame(restore));
                if (method === 'hidden-four-frames')
                  requestAnimationFrame(() =>
                    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(restore)))
                  );
                if (method === 'hidden-100ms') setTimeout(restore, 100);
              }
              p.after = read();
            }, 80),
          { once: true }
        );
        let until = performance.now() + 2300;
        function frame() {
          p.samples.push(read());
          if (performance.now() < until) requestAnimationFrame(frame);
        }
        frame();
      }, method);
      const b = await viewport.boundingBox();
      await cdp.send('Input.synthesizeScrollGesture', {
        x: b.x + 160,
        y: b.y + 75,
        yDistance: 190,
        speed: 1600,
        gestureSourceType: 'touch',
        preventFling: false,
      });
      await page.waitForTimeout(2100);
      const data = await page.evaluate(() => window.probe);
      results.push({ trial, ...data });
      const samples = data.samples.filter((x) => x.t >= data.after.t + 50);
      const end = data.samples.at(-1);
      console.log(
        JSON.stringify({
          method,
          trial,
          capabilities: data.capabilities,
          before: data.before.top,
          after: data.after.top,
          end: end.top,
          drift: end.top - data.after.top,
          rangeAfter50ms: Math.max(...samples.map((x) => x.top)) - Math.min(...samples.map((x) => x.top)),
          wheelCount: data.events.filter((e) => e.type === 'wheel').length,
          touchMovesAfter: data.events.filter((e) => e.type === 'touchmove' && e.t > data.before.t).length,
          widthChange: end.width - data.before.width,
        })
      );
    }
  }
  await writeFile(
    output,
    JSON.stringify({ capturedAt: new Date().toISOString(), storybook, browser: browser.version(), results }, null, 2)
  );
} finally {
  await browser.close();
}
