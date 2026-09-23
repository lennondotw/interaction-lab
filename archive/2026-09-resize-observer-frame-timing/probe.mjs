/**
 * When does a measured size reach the screen, relative to the frame it changed in?
 *
 * Browser probe: needs `pnpm exec playwright install chromium`. Part 2 also needs a
 * running Storybook (`pnpm --filter @monorepo/lab dev`, or STORYBOOK_URL).
 *
 *   node archive/2026-09-resize-observer-frame-timing/probe.mjs            # both parts
 *   node archive/2026-09-resize-observer-frame-timing/probe.mjs platform   # part 1 only
 *
 * Every "painted" reading is taken in a task posted from requestAnimationFrame. That
 * task runs after the frame's rendering steps, so it sees what the frame painted,
 * not what the next frame will — unless another task lands in between. A viewport
 * resize can: it arrives as its own task, and reading layout in the sampler then
 * shows a size no frame has painted yet. The resize steps run before rAF, so a
 * sample whose innerWidth differs from the one seen in its rAF is such a case, and
 * is counted separately instead of as staleness.
 */
import { chromium } from 'playwright';

const base = process.env.STORYBOOK_URL ?? 'http://localhost:6009';
const only = process.argv[2];

const browser = await chromium.launch();

// Part 1 — the platform, on a bare page: no React, no story in between.
{
  const page = await browser.newPage();
  await page.setContent('<!doctype html><body></body>');
  const rows = [];
  for (const source of ['task', 'raf']) {
    for (const commit of ['in-callback', 'next-raf']) {
      const row = await page.evaluate(
        ({ source, commit }) =>
          new Promise((resolve) => {
            const target = document.createElement('div');
            const mirror = document.createElement('div');
            for (const el of [target, mirror]) Object.assign(el.style, { width: '100px', height: '10px' });
            document.body.append(target, mirror);

            let frame = 0;
            let earliest = null; // the first frame that could paint the change
            let callbackFrame = null;
            let paintedFrame = null;
            const channel = new MessageChannel();
            channel.port1.onmessage = () => {
              if (earliest !== null && paintedFrame === null && mirror.style.width === '200px') paintedFrame = frame;
            };
            // `mirror` stands for whatever the observer's consumer renders from the size.
            const observer = new ResizeObserver(([entry]) => {
              if (entry.contentRect.width !== 200) return;
              callbackFrame = frame;
              const write = () => (mirror.style.width = '200px');
              if (commit === 'in-callback') write();
              else requestAnimationFrame(write);
            });
            observer.observe(target);

            const tick = () => {
              frame++;
              channel.port2.postMessage(0);
              if (frame < 30) requestAnimationFrame(tick);
              else {
                observer.disconnect();
                target.remove();
                mirror.remove();
                resolve({
                  observerLate: callbackFrame - earliest,
                  paintedLate: paintedFrame - earliest,
                });
              }
            };
            requestAnimationFrame(tick);

            setTimeout(() => {
              if (source === 'task') {
                target.style.width = '200px';
                earliest = frame + 1;
              } else {
                requestAnimationFrame(() => {
                  target.style.width = '200px';
                  earliest = frame;
                });
              }
            }, 100);
          }),
        { source, commit }
      );
      rows.push({ 'size changed in': source, 'consumer writes': commit, ...row });
    }
  }
  console.log('\nPart 1 — frames after the earliest frame that could show the change (0 = same frame)');
  console.table(rows);
  await page.close();
}

if (only !== 'platform') {
  const stories = ['clip-and-outline', 'on-canvas', 'svg-path', 'rect-field'];
  const url = (story) => `${base}/iframe.html?id=sdf-edge-trace-${story}--default&viewMode=story&reactScan=false`;

  // Part 2a — the first painted frame after mount.
  const mountRows = [];
  for (const width of [1440, 375]) {
    for (const story of stories) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
      await page.addInitScript(() => {
        window.__painted = [];
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
          const el = document.querySelector('[data-testid="sdf-surface"]');
          if (!el) return;
          const width = Math.round(el.getBoundingClientRect().width);
          const bitmap = el instanceof HTMLCanvasElement ? el.width / 2 : null;
          const last = window.__painted.at(-1);
          if (!last || last.width !== width || last.bitmap !== bitmap) window.__painted.push({ width, bitmap });
        };
        const tick = () => {
          channel.port2.postMessage(0);
          if (window.__painted.length < 20) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await page.goto(url(story));
      await page.locator('[data-testid="sdf-surface"]').waitFor();
      await page.waitForTimeout(1500);
      const painted = await page.evaluate(() => window.__painted);
      const format = ({ width, bitmap }) => (bitmap === null ? `${width}` : `${width} (bitmap ${bitmap})`);
      mountRows.push({
        viewport: width,
        story,
        'first painted': format(painted[0]),
        settled: format(painted.at(-1)),
        changes: painted.length - 1,
      });
      await page.close();
    }
  }
  console.log('\nPart 2a — surface width in CSS px as first painted, and after it settles');
  console.table(mountRows);

  // Part 2b — a live resize, 520 → 400px wide in 6px steps.
  const resizeRows = [];
  for (const story of stories) {
    const page = await browser.newPage({ viewport: { width: 520, height: 900 }, deviceScaleFactor: 1 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.goto(url(story));
    await page.locator('[data-testid="sdf-surface"]').waitFor();
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      window.__frames = [];
      const el = document.querySelector('[data-testid="sdf-surface"]');
      // The column the surface should fill; rect-field's overlay fills its parent.
      const column = el.closest('.max-w-\\[520px\\]') ?? el.parentElement;
      const channel = new MessageChannel();
      let widthAtRaf = 0;
      channel.port1.onmessage = () => {
        if (innerWidth !== widthAtRaf) {
          window.__frames.push({ resizedAfterPaint: true });
          return;
        }
        const box = Math.round(el.getBoundingClientRect().width);
        window.__frames.push({
          boxBehind: box !== Math.round(column.getBoundingClientRect().width),
          bitmapBehind: el instanceof HTMLCanvasElement && el.width !== box,
        });
      };
      const tick = () => {
        widthAtRaf = innerWidth;
        channel.port2.postMessage(0);
        if (!window.__stop) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    for (let w = 520; w >= 400; w -= 6) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(300);
    const frames = await page.evaluate(() => ((window.__stop = true), window.__frames));
    const describe = (key) => {
      const runs = [];
      let run = 0;
      for (const frame of frames) {
        if (frame[key]) run++;
        else if (run) (runs.push(run), (run = 0));
      }
      return runs.length ? `${runs.reduce((a, b) => a + b, 0)} (max ${Math.max(...runs)} in a row)` : '0';
    };
    resizeRows.push({
      story,
      'painted frames': frames.filter((frame) => !frame.resizedAfterPaint).length,
      'excluded (resize after paint)': frames.filter((frame) => frame.resizedAfterPaint).length,
      'box behind column': describe('boxBehind'),
      'bitmap behind box': describe('bitmapBehind'),
    });
    await page.close();
  }
  console.log('\nPart 2b — painted frames that show a stale size during 21 resize steps');
  console.table(resizeRows);
}

await browser.close();
