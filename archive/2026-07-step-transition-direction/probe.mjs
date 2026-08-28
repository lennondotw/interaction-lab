/**
 * Measures whether a card that is already exiting can have its exit direction
 * rewritten by a *later* navigation, against the real `Components/Step transition`
 * slide story.
 *
 * The run is the one from the bug report: Next ×4 to reach step 5, then Prev ×4
 * back to step 1, at a fixed gap. Below the 450ms transition the gap leaves
 * several earlier cards still exiting when the next press lands, and
 * `AnimatePresence` keeps them mounted as a batch — so they are still reachable
 * by a re-resolved `custom`.
 *
 * The criterion is a direction reversal count, per card, taken from the
 * composited matrix rather than from props:
 *
 *   reversals  how many times a card's x changes travel direction over its whole
 *              life. A legitimate card turns at most once — at the boundary
 *              between its enter leg and its exit leg, and only when it happens
 *              to leave towards the side it arrived from. Two or more means
 *              something moved the target while the card was mid-flight.
 *
 * That threshold does not depend on how many times we clicked or which cards
 * were on screen, which is what makes it a usable pass/fail.
 *
 * Requires the Storybook dev server — `pnpm --filter @monorepo/app-storybook dev`
 * in another shell.
 *
 *   node archive/2026-07-step-transition-direction/probe.mjs
 */
import { mkdir } from 'node:fs/promises';

import { chromium } from 'playwright';

const STORYBOOK = process.env.STORYBOOK_URL ?? 'http://localhost:6009';
const SHOTS = new URL('__screenshots__/', import.meta.url);
// `reactScan=false` is the preview's own opt-out. Left on, react-scan paints
// render outlines over every card and lands a FPS meter in the screenshots.
const STORY = `${STORYBOOK}/iframe.html?viewMode=story&reactScan=false&id=components-step-transition--slide-mode`;

/** Press gaps in ms. 450 is the transition duration, so only the last one is
 *  slow enough for each card to be gone before the next press. */
const GAPS = [60, 120, 250, 600];

/** Below this, a frame-to-frame delta is sampling noise, not travel. */
const EPSILON = 0.5;

/** One Next→Prev round trip, sampled every frame. Runs entirely in-page: the
 *  presses have to be spaced by real timers, not by a round trip to the driver,
 *  or the gap under test is not the gap that happened. */
const sampleRun = (gap) =>
  new Promise((resolve) => {
    const stage = document.querySelector('[data-testid="step-stage"] > div');
    const buttons = [...document.querySelectorAll('button')];
    const next = buttons.find((b) => b.textContent.includes('Next'));
    const prev = buttons.find((b) => b.textContent.includes('Prev'));

    // The composited translateX, not the inline style — the question is what the
    // browser is painting, not what Motion believes it wrote.
    const readX = (el) => {
      const { transform } = getComputedStyle(el);
      const matrix = /matrix\(([^)]+)\)/.exec(transform);
      if (matrix) return Number(matrix[1].split(',')[4]);
      const matrix3d = /matrix3d\(([^)]+)\)/.exec(transform);
      if (matrix3d) return Number(matrix3d[1].split(',')[12]);
      return 0;
    };

    // A card's number is not its identity: step 4 is mounted once on the way up
    // and again on the way down. Per-node ids keep those two lives apart.
    const ids = new WeakMap();
    let nextId = 1;
    const idOf = (el) => {
      if (!ids.has(el)) ids.set(el, nextId++);
      return ids.get(el);
    };

    const frames = [];
    let running = true;

    const tick = () => {
      // The two prefetch divs are `aria-hidden` and never animate; everything
      // else under the stage is a live AnimatePresence child.
      frames.push(
        [...stage.children]
          .filter((el) => el.getAttribute('aria-hidden') !== 'true')
          .map((el) => ({ id: idOf(el), label: el.textContent.trim(), x: readX(el) }))
      );
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    void (async () => {
      for (let i = 0; i < 4; i++) {
        next.click();
        await sleep(gap);
      }
      for (let i = 0; i < 4; i++) {
        prev.click();
        await sleep(gap);
      }
      // Long enough for the last exit to finish and the batch to be flushed.
      await sleep(1200);
      running = false;
      resolve(frames);
    })();
  });

/** Collapses the per-frame snapshots into one x series per live card. */
const seriesByCard = (frames) => {
  const cards = new Map();
  for (const frame of frames) {
    for (const { id, label, x } of frame) {
      const card = cards.get(id) ?? { label, xs: [] };
      card.xs.push(x);
      cards.set(id, card);
    }
  }
  return [...cards.entries()].map(([id, card]) => ({ id, ...card }));
};

/** Direction reversals, ignoring plateaus and sub-pixel jitter. */
const reversals = (xs) => {
  let direction = 0;
  let count = 0;
  for (let i = 1; i < xs.length; i++) {
    const delta = xs[i] - xs[i - 1];
    if (Math.abs(delta) < EPSILON) continue;
    const sign = Math.sign(delta);
    if (direction !== 0 && sign !== direction) count++;
    direction = sign;
  }
  return count;
};

const browser = await chromium.launch({
  args: [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
});

const page = await browser.newPage({ viewport: { width: 760, height: 620 }, deviceScaleFactor: 2 });

await mkdir(SHOTS, { recursive: true });

const rows = {};

for (const gap of GAPS) {
  // Reload rather than clicking back to step 1: a fresh mount also clears the
  // direction state, so each gap is measured from the same starting point.
  await page.goto(STORY);
  await page.locator('[data-testid="step-stage"]').waitFor({ state: 'visible' });

  const frames = await page.evaluate(sampleRun, gap);
  const cards = seriesByCard(frames);
  const counts = cards.map((card) => reversals(card.xs));
  const bad = cards.filter((card, i) => counts[i] > 1);

  rows[`${gap}ms gap`] = {
    'cards seen': cards.length,
    'max reversals': Math.max(...counts),
    'cards > 1': bad.length,
    which: bad.length ? bad.map((card) => card.label).join(' ') : '—',
    verdict: bad.length ? 'REWRITTEN' : 'ok',
  };
}

// One more 60ms run purely for the visual record, shot at the turnaround — four
// presses in, the first Prev just landed, and the pile of still-exiting cards is
// on screen. Deliberately not awaited before the shot: the interesting frame is
// mid-run, not the settled state, which looks like a fresh page either way.
await page.goto(STORY);
await page.locator('[data-testid="step-stage"]').waitFor({ state: 'visible' });
const visualRun = page.evaluate(sampleRun, 60);
await page.waitForTimeout(320);
await page.screenshot({ path: new URL('stage.png', SHOTS).pathname });
await visualRun;

console.table(rows);

await browser.close();
