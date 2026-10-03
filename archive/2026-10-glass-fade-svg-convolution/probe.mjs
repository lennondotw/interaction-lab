// Drive the shipped comparison at a fixed position, freezing tint/content for pixel diffs.
// STORYBOOK_URL=http://localhost:6010 node archive/2026-10-glass-fade-svg-convolution/probe.mjs
// Uses installed Chrome; screenshots and results stay beside this probe.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, '__screenshots__');
const STORYBOOK = process.env.STORYBOOK_URL ?? 'http://localhost:6010';
const ID = 'studies-glass-fade-svg-convolution--material-strength-together-mapped-convolution';
const browser = await chromium.launch({ channel: 'chrome' });
const results = { browser: browser.version(), ticks: [], frames: [], endpoints: [] };
await mkdir(SHOTS, { recursive: true });

for (const dpr of [1, 2]) {
  const page = await browser.newPage({ viewport: { width: 1159, height: 781 }, deviceScaleFactor: dpr });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.goto(`${STORYBOOK}/iframe.html?id=${ID}&viewMode=story&reactScan=false`);
  const panel = page.locator('figure > div').first().locator(':scope > div').nth(1);
  await panel.waitFor();
  const args = async (updatedArgs) => {
    await page.evaluate(
      ({ storyId, updatedArgs }) => {
        window.__STORYBOOK_ADDONS_CHANNEL__.emit('updateStoryArgs', { storyId, updatedArgs });
      },
      { storyId: ID, updatedArgs }
    );
    await page.waitForTimeout(120);
  };
  const diff = async (a, b) =>
    page.evaluate(
      async ({ a, b, dpr }) => {
        const decode = async (png) => {
          const image = new Image();
          image.src = `data:image/png;base64,${png}`;
          await image.decode();
          const canvas = new OffscreenCanvas(image.width, image.height);
          const context = canvas.getContext('2d');
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, image.width, image.height);
        };
        const [A, B] = await Promise.all([decode(a), decode(b)]);
        let n = 0,
          sum = 0,
          max = 0,
          changed = 0;
        const inset = 20 * dpr;
        for (let y = inset; y < A.height - inset; y++) {
          for (let x = inset; x < A.width - inset; x++) {
            const i = (y * A.width + x) * 4;
            const delta = Math.max(...[0, 1, 2].map((k) => Math.abs(A.data[i + k] - B.data[i + k])));
            n++;
            sum += delta;
            max = Math.max(max, delta);
            if (delta) changed++;
          }
        }
        return { mean: +(sum / n).toFixed(3), max, changedPct: +((100 * changed) / n).toFixed(2) };
      },
      { a: a.toString('base64'), b: b.toString('base64'), dpr }
    );

  const positions = [];
  for (const implementation of ['css', 'svg-convolution']) {
    await args({
      blurPx: 20,
      blurGamma: 2,
      tint: '#ffffff',
      tintAlphaTarget: 0.18,
      blurImplementation: implementation,
      tintAlphaProgress: 0.66,
      contentProgress: 0,
      progress: 0.64,
    });
    positions.push(await panel.boundingBox());
    for (const group of [
      [0.64, 0.65, 0.66, 0.67, 0.68, 0.69],
      [0.92, 0.93, 0.94, 0.95, 0.96, 0.97],
    ]) {
      let previous;
      for (const progress of group) {
        await args({ progress });
        const shot = await panel.screenshot();
        if ([0.66, 0.67, 0.94, 0.95].includes(progress)) {
          await writeFile(join(SHOTS, `${implementation}-${dpr}x-${progress}.png`), shot);
        }
        if (previous) {
          const row = {
            dpr,
            implementation,
            from: previous.progress,
            to: progress,
            ...(await diff(previous.shot, shot)),
          };
          results.ticks.push(row);
          console.log(JSON.stringify(row));
        }
        previous = { progress, shot };
      }
    }

    for (const blurPx of [0, 20, 48]) {
      await args({ blurPx, progress: 0 });
      const clear = await panel.screenshot();
      await args({ progress: 1 });
      const full = await panel.screenshot();
      results.endpoints.push({
        dpr,
        implementation,
        blurPx,
        ...(await diff(clear, full)),
        filter: await panel.evaluate((el) => getComputedStyle(el).backdropFilter),
      });
    }

    // Local scrub uses React input handling, avoiding the manager/Controls channel per frame.
    await args({ blurPx: 20, progress: 0.4 });
    const frames = await page.evaluate(async () => {
      const slider = document.querySelector('input[type="range"]');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      const intervals = [];
      let previous = await new Promise((resolve) => requestAnimationFrame(resolve));
      for (let i = 0; i < 120; i++) {
        const progress = 0.4 + 0.6 * (i < 60 ? i / 59 : (119 - i) / 59);
        set.call(slider, String(progress));
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        const now = await new Promise((resolve) => requestAnimationFrame(resolve));
        intervals.push(now - previous);
        previous = now;
      }
      const sorted = intervals.slice(10).sort((a, b) => a - b);
      return {
        medianMs: +sorted[Math.floor(sorted.length * 0.5)].toFixed(2),
        p95Ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
        over25Ms: sorted.filter((dt) => dt > 25).length,
      };
    });
    results.frames.push({ dpr, implementation, ...frames });
    console.log('FRAMES', JSON.stringify(results.frames.at(-1)));
  }
  if (JSON.stringify(positions[0]) !== JSON.stringify(positions[1])) throw new Error('Comparison moved the panel');
  await args({ blurImplementation: 'svg-convolution', progress: 0.67, tintAlphaProgress: null, contentProgress: null });
  await page.screenshot({ path: join(SHOTS, `story-${dpr}x.png`) });
  await page.close();
}
await browser.close();
await writeFile(join(HERE, 'results.json'), JSON.stringify(results, null, 2) + '\n');
