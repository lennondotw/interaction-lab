import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

/** Manual research probe, not a CI regression or a portable momentum-cancellation contract. */
import { chromium } from 'playwright';

const storybook = process.env.STORYBOOK_URL ?? 'http://localhost:6009';
const output = resolve(process.env.OUTPUT ?? 'artifacts/research/chat-inertia-repro.json');
await mkdir(dirname(output), { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 430, height: 1000 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
});
const cdp = await page.context().newCDPSession(page);
const results = [];
try {
  for (const delay of [80, 1000, 'tap']) {
    await page.goto(
      `${storybook}/iframe.html?id=components-chat-scroll-container--with-message-input&viewMode=story&reactScan=false`
    );
    const viewport = page.locator('[data-slot="chat-scroll-viewport"]');
    await viewport.waitFor();
    await page.waitForTimeout(700);
    await page.evaluate((delay) => {
      const v = document.querySelector('[data-slot="chat-scroll-viewport"]');
      const button = [...document.querySelectorAll('button')].find((e) => e.textContent === 'Scroll to bottom');
      window.samples = [];
      window.events = [];
      const read = (event) => ({
        t: performance.now(),
        event,
        top: v.scrollTop,
        bottom: v.scrollHeight - v.clientHeight,
        state: [...document.querySelectorAll('strong')]
          .map((e) => e.textContent)
          .filter((s) => ['following', 'animating', 'detached'].includes(s))
          .join(','),
        reason: document.body.innerText.match(/Last transition:([^\n]*)/)?.[1],
      });
      const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
      Object.defineProperty(v, 'scrollTop', {
        get() {
          return descriptor.get.call(this);
        },
        set(value) {
          descriptor.set.call(this, value);
          window.events.push({ ...read('write'), requested: value });
        },
      });
      for (const type of ['touchstart', 'touchend', 'pointercancel', 'scroll', 'scroll-anchor-interrupted'])
        v.addEventListener(type, () => window.events.push(read(type)), { passive: true });
      button.addEventListener('click', () => window.events.push(read('button-click')));
      v.addEventListener(
        'touchend',
        () =>
          setTimeout(
            () => {
              window.events.push(read('command-before'));
              if (delay === 'tap') window.doNativeTap();
              else button.click();
              window.events.push(read('command-after'));
            },
            delay === 'tap' ? 80 : delay
          ),
        { once: true }
      );
      let done = performance.now() + 3000;
      function sample() {
        window.samples.push(read('frame'));
        if (performance.now() < done) requestAnimationFrame(sample);
      }
      sample();
    }, delay);
    if (delay === 'tap') {
      const b = await page.getByRole('button', { name: 'Scroll to bottom', exact: true }).boundingBox();
      await page.exposeFunction('doNativeTap', async () => {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }],
        });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      });
    }
    const box = await viewport.boundingBox();
    const x = box.x + Math.min(160, box.width / 2),
      y = box.y + Math.min(80, box.height / 4);
    await cdp.send('Input.synthesizeScrollGesture', {
      x,
      y,
      yDistance: 190,
      speed: 1600,
      gestureSourceType: 'touch',
      preventFling: false,
    });
    await page.waitForTimeout(2600);
    const data = await page.evaluate(() => ({ samples: window.samples, events: window.events }));
    results.push({ delay, box, ...data });
    const release = data.events.find((e) => e.event === 'touchend');
    console.log(
      JSON.stringify({
        delay,
        releaseTop: release?.top,
        end: data.samples.at(-1),
        commands: data.events.filter((e) => e.event.startsWith('command')),
        states: data.samples.filter((s, i, a) => !i || s.state !== a[i - 1].state),
        postRelease: data.samples
          .filter((s) => s.t > release?.t)
          .slice(0, 8)
          .map((s) => ({ t: s.t, top: s.top })),
      })
    );
  }
  await writeFile(
    output,
    JSON.stringify({ capturedAt: new Date().toISOString(), browser: browser.version(), storybook, results }, null, 2)
  );
  await page.screenshot({ path: output.replace(/\.json$/, '') + '.png' });
} finally {
  await browser.close();
}
