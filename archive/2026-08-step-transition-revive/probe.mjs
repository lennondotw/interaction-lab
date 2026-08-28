/**
 * Measures whether the step a fast round trip returns to is actually *visible*
 * when everything has settled, against the real `Components/Step transition`
 * stories.
 *
 * The run is the one from the bug report: Next ×3 then Prev ×3 at a fixed gap,
 * ending back on step 1. The stage ends up empty — the counter reads `1 / 5`,
 * the card is in the DOM, and it is parked at `opacity: 0` off to one side.
 *
 * Two criteria, both read off the composited style rather than off props:
 *
 *   BLANK  no settled child has opacity > 0.01. The step we navigated back to
 *          exists but paints nothing. This is the reported bug.
 *   LEAK   more than one child is still mounted 1.5s after the last press —
 *          every exit is 450ms, so a settled stage holds exactly one card.
 *
 * Node identity matters and is tracked per DOM node, because "the card labelled
 * 1" can be either the original node revived in place or a fresh mount, and the
 * two have very different explanations. `nodes seen` staying at 4 for an
 * eight-press round trip is what says the returned-to card was revived.
 *
 * Two knobs isolate the cause:
 *
 *   START=1  reach step 2 slowly before the fast round trip, so the card the
 *            round trip revives was NOT mounted during AnimatePresence's
 *            initial render. Passes even on the broken component — that is the
 *            measurement that pins the cause on `initial={false}`.
 *   RESET=dirty  don't reload between runs, so leaked nodes accumulate.
 *
 * The mount check that runs first is the guard on the fix: suppressing the
 * mount animation is the whole point of the `initial` handling, so the first
 * card must still be composited at rest on load.
 *
 * Requires the Storybook dev server — `pnpm --filter @monorepo/lab dev`.
 *
 *   node archive/2026-08-step-transition-revive/probe.mjs
 */
import { chromium } from 'playwright';

const STORYBOOK = process.env.STORYBOOK_URL ?? 'http://localhost:6009';
const STORY_ID = process.env.STORY_ID ?? 'components-step-transition--slide-mode';
// `reactScan=false` is the preview's own opt-out; left on, its overlay repaints
// every card and swallows clicks.
const STORY = `${STORYBOOK}/iframe.html?viewMode=story&reactScan=false&id=${STORY_ID}`;

/** Press gaps in ms. The transition is 450ms; the bug needs the *first* card's
 *  exit to have finished before the round trip revives it, which is why the
 *  fast gaps pass and everything from ~100ms up fails. */
const GAPS = process.env.GAPS ? process.env.GAPS.split(',').map(Number) : [80, 100, 120, 140, 160, 200];
const TRIALS = Number(process.env.TRIALS ?? 2);
const PRESSES = Number(process.env.PRESSES ?? 3);
/** 'reload' = fresh mount per run; 'dirty' = keep whatever the last run leaked. */
const RESET = process.env.RESET ?? 'reload';
/** Step to start the fast round trip from, reached slowly beforehand. */
const START = Number(process.env.START ?? 0);

/** Walk forward `n` steps slowly, so each card mounts *after* AnimatePresence's
 *  initial render and none of them carries `blockInitialAnimation`. */
const warmTo = (n) =>
  new Promise((resolve) => {
    const next = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Next'));
    let i = 0;
    const step = () => {
      if (i++ >= n) return void setTimeout(resolve, 900);
      next.click();
      setTimeout(step, 700);
    };
    step();
  });

/** One Next→Prev round trip, sampled every frame. Runs entirely in-page: the
 *  presses have to be spaced by real timers, not by a round trip to the driver,
 *  or the gap under test is not the gap that happened. */
const run = ({ gap, presses }) =>
  new Promise((resolve) => {
    const stage = document.querySelector('[data-testid="step-stage"] > div');
    const buttons = [...document.querySelectorAll('button')];
    const next = buttons.find((b) => b.textContent.includes('Next'));
    const prev = buttons.find((b) => b.textContent.includes('Prev'));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

    const ids = new WeakMap();
    let nextId = 1;
    const idOf = (el) => {
      if (!ids.has(el)) ids.set(el, nextId++);
      return ids.get(el);
    };

    // The two prefetch divs are `aria-hidden` and never animate; everything else
    // under the stage is a live AnimatePresence child.
    const kids = () => [...stage.children].filter((el) => el.getAttribute('aria-hidden') !== 'true');

    const frames = [];
    let running = true;
    const tick = () => {
      frames.push(
        kids().map((el) => ({
          id: idOf(el),
          label: el.textContent.trim(),
          x: readX(el),
          o: Number(getComputedStyle(el).opacity),
        }))
      );
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    void (async () => {
      for (let i = 0; i < presses; i++) {
        next.click();
        await sleep(gap);
      }
      for (let i = 0; i < presses; i++) {
        prev.click();
        await sleep(gap);
      }
      // Long enough for the last exit to finish and the batch to be flushed.
      await sleep(1500);
      running = false;
      const settled = kids().map((el) => ({
        id: idOf(el),
        label: el.textContent.trim(),
        x: readX(el),
        o: Number(getComputedStyle(el).opacity),
      }));
      resolve({ frames, settled, counter: document.querySelector('span.min-w-15')?.textContent.trim() });
    })();
  });

/** Collapses the per-frame snapshots into one series per live node. */
const seriesByNode = (frames) => {
  const nodes = new Map();
  for (const frame of frames) {
    for (const { id, label, x, o } of frame) {
      const node = nodes.get(id) ?? { label, xs: [], os: [] };
      node.xs.push(x);
      node.os.push(o);
      nodes.set(id, node);
    }
  }
  return [...nodes.entries()].map(([id, node]) => ({ id, ...node }));
};

const browser = await chromium.launch({
  args: [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
});
const page = await browser.newPage({ viewport: { width: 760, height: 620 } });

const gotoStory = async () => {
  await page.goto(STORY);
  await page.locator('[data-testid="step-stage"]').waitFor({ state: 'visible' });
};

// Mount has to stay quiet: the first step is expected to be composited at rest,
// not to slide/blur in on load. This is what the fix could plausibly regress.
await gotoStory();
const mount = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const stage = document.querySelector('[data-testid="step-stage"] > div');
      const samples = [];
      const t0 = performance.now();
      const tick = () => {
        const el = [...stage.children].find((c) => c.getAttribute('aria-hidden') !== 'true');
        if (el) {
          const style = getComputedStyle(el);
          const matrix = /matrix\(([^)]+)\)/.exec(style.transform);
          samples.push({ x: matrix ? Number(matrix[1].split(',')[4]) : 0, o: Number(style.opacity) });
        }
        if (performance.now() - t0 < 800) requestAnimationFrame(tick);
        else resolve(samples);
      };
      requestAnimationFrame(tick);
    })
);
const mountXs = mount.map((s) => s.x);
const mountOs = mount.map((s) => s.o);
const mountQuiet = Math.max(...mountXs.map(Math.abs)) < 0.5 && Math.min(...mountOs) > 0.99;
console.log(
  `mount: frames=${mount.length} |x|max=${Math.max(...mountXs.map(Math.abs))} o>=${Math.min(...mountOs).toFixed(2)} → ${
    mountQuiet ? 'QUIET (ok)' : 'ANIMATED ON MOUNT (regression)'
  }\n`
);

const rows = {};

for (const gap of GAPS) {
  for (let trial = 1; trial <= TRIALS; trial++) {
    if (RESET === 'reload') {
      await gotoStory();
      if (START > 0) await page.evaluate(warmTo, START);
    } else {
      // Walk back to the start slowly, leaving any leaked nodes in place.
      for (let i = 0; i < PRESSES + 2; i++) {
        await page.evaluate(() =>
          [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Prev'))?.click()
        );
        await page.waitForTimeout(600);
      }
      await page.waitForTimeout(800);
    }

    const { frames, settled, counter } = await page.evaluate(run, { gap, presses: PRESSES });
    const nodes = seriesByNode(frames);
    const visible = settled.filter((s) => s.o > 0.01);

    rows[`${gap}ms gap #${trial}`] = {
      counter,
      'settled kids': settled.length,
      visible: visible.length,
      'nodes seen': nodes.length,
      settled: settled.map((s) => `${s.label}@x${Math.round(s.x)}/o${s.o.toFixed(2)}`).join(' '),
      verdict: visible.length === 0 ? 'BLANK' : settled.length > 1 ? `LEAK +${settled.length - 1}` : 'ok',
    };

    if (visible.length === 0) {
      console.log(`--- BLANK at ${gap}ms gap #${trial}; per-node series ---`);
      for (const { id, label, xs, os } of nodes) {
        console.log(
          `  node#${id} "${label}" frames=${xs.length} ` +
            `x ${Math.round(xs[0])}→${Math.round(xs.at(-1))} (min ${Math.round(Math.min(...xs))} max ${Math.round(Math.max(...xs))}) ` +
            `o ${os[0].toFixed(2)}→${os.at(-1).toFixed(2)} (max ${Math.max(...os).toFixed(2)})`
        );
      }
      console.log('');
    }
  }
}

console.table(rows);

await browser.close();
