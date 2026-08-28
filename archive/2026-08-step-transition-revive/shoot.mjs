/**
 * Screenshot helper for the archive note: runs the reported round trip and shoots
 * the *settled* stage, which is the interesting frame here (unlike the direction
 * bug, whose evidence is mid-flight).
 *
 *   node archive/2026-08-step-transition-revive/shoot.mjs blank
 */
import { mkdir } from 'node:fs/promises';

import { chromium } from 'playwright';

const STORYBOOK = process.env.STORYBOOK_URL ?? 'http://localhost:6009';
const STORY = `${STORYBOOK}/iframe.html?viewMode=story&reactScan=false&id=components-step-transition--slide-mode`;
const SHOTS = new URL('__screenshots__/', import.meta.url);
const NAME = process.argv[2] ?? 'stage';
const GAP = Number(process.env.GAP ?? 140);

const browser = await chromium.launch({
  args: [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
});
const page = await browser.newPage({ viewport: { width: 760, height: 620 }, deviceScaleFactor: 2 });

await mkdir(SHOTS, { recursive: true });
await page.goto(STORY);
await page.locator('[data-testid="step-stage"]').waitFor({ state: 'visible' });

await page.evaluate(
  (gap) =>
    new Promise((resolve) => {
      const buttons = [...document.querySelectorAll('button')];
      const next = buttons.find((b) => b.textContent.includes('Next'));
      const prev = buttons.find((b) => b.textContent.includes('Prev'));
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      void (async () => {
        for (let i = 0; i < 3; i++) {
          next.click();
          await sleep(gap);
        }
        for (let i = 0; i < 3; i++) {
          prev.click();
          await sleep(gap);
        }
        await sleep(1500);
        resolve();
      })();
    }),
  GAP
);

await page.screenshot({ path: new URL(`${NAME}.png`, SHOTS).pathname });
console.log(
  await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="step-stage"] > div');
    return [...stage.children]
      .filter((el) => el.getAttribute('aria-hidden') !== 'true')
      .map((el) => `${el.textContent.trim()} o=${getComputedStyle(el).opacity} t=${getComputedStyle(el).transform}`)
      .join('\n');
  })
);

await browser.close();
