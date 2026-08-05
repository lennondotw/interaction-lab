/**
 * Measures which observation source keeps a beacon on its anchor, for ten kinds
 * of layout change, against the real `Demos/Beacon layout observation` story.
 *
 * `useBeaconAnchor` has no polling loop. It wires five browser primitives to one
 * `measure()` — a self `ResizeObserver`, an ancestor RO cascade up to the
 * container, a capture-phase window `scroll` listener, a window `resize`
 * listener, and an `IntersectionObserver` layout-shift frame. Running the cases
 * with everything on only shows that the union works. So each case is run five
 * times, once per source knocked out from outside the app via `addInitScript`,
 * and the column that turns a case red is the source that owns it.
 *
 * Nothing is re-implemented here: the story owns the stage, the mutations, and
 * the per-frame delta between the beacon's raw MotionValues and the target's
 * real rect. This probe presses buttons and reads the trace panel back out.
 *
 * Three numbers per cell:
 *
 *   base Δ       beacon vs target before the mutation. Non-zero means the
 *                measurement was already wrong, and the case proves nothing.
 *   settled Δ    the same gap after everything has come to rest. This is the
 *                verdict: 0 is tracked, anything else is how many pixels off
 *                the follower would be painting, forever.
 *   frames / ms  how long the gap lasted, counted from the first frame that
 *                could see it. Blank when no frame ever disagreed.
 *
 * A fresh page load per case, not per config: an ablated source leaves the
 * beacon stale, and `resetStage` cannot un-stale it — the next case would
 * inherit a broken baseline and report a failure it did not cause.
 *
 * Requires the Storybook dev server — `pnpm --filter @monorepo/app-storybook dev`
 * in another shell — and `pnpm exec playwright install chromium`.
 *
 *   node archive/2026-07-beacon-layout-observation/probe.mjs
 */
import { mkdir } from 'node:fs/promises';

import { chromium } from 'playwright';

const STORYBOOK = process.env.STORYBOOK_URL ?? 'http://localhost:6010';
const STORY = 'demos-beacon-layout-observation--probes';
const SHOTS = new URL('__screenshots__/', import.meta.url);

/** Wide enough that the stage is at its `maxWidth: 680`, so C9 can narrow it. */
const VIEWPORT = { width: 900, height: 900 };
const NARROWED = { width: 560, height: 900 };

const CASES = [
  { id: 'C1', label: 'C1 self resize · grow' },
  { id: 'C2', label: 'C2 self resize · shrink' },
  { id: 'C3', label: 'C3 sibling mounts' },
  { id: 'C4', label: 'C4 flex property' },
  { id: 'C5', label: 'C5 parent padding' },
  { id: 'C6', label: 'C6 own margin' },
  { id: 'C7', label: 'C7 nested scroll · static' },
  { id: 'C8', label: 'C8 nested scroll · positioned' },
  { id: 'C9', label: 'C9 viewport resize', external: 'narrow' },
  { id: 'C10', label: 'C10 ancestor transform' },
];

/**
 * Knocks a source out of the page before any app code runs.
 *
 * Blunt on purpose — the whole primitive goes, not just the hook's use of it.
 * Nothing else in the harness depends on any of them, and a targeted patch
 * would mean the probe knowing the hook's internals, which is exactly the
 * coupling that lets a probe drift from what ships.
 */
const ablate = (opts) => {
  if (opts.ro) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (opts.io) {
    window.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    };
  }
  if (opts.events?.length) {
    const add = window.addEventListener.bind(window);
    window.addEventListener = (type, fn, options) => {
      if (opts.events.includes(type)) return;
      add(type, fn, options);
    };
  }
};

const CONFIGS = [
  { id: 'all', label: 'all five sources', opts: {} },
  { id: 'no-ro', label: '− ResizeObserver', opts: { ro: true } },
  { id: 'no-io', label: '− IntersectionObserver', opts: { io: true } },
  { id: 'no-scroll', label: '− window scroll', opts: { events: ['scroll'] } },
  { id: 'no-resize', label: '− window resize', opts: { events: ['resize'] } },
];

/** The three flags matter: an occluded Chrome stalls rAF while still reporting
 *  `visibilityState: "visible"`, which silently distorts every per-frame sample. */
const browser = await chromium.launch({
  args: [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
});

/** One row per logged trace entry, in order. */
const readTrace = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="trace"] > div')]
      .map((row) => [...row.querySelectorAll('span')].map((s) => s.textContent.trim()))
      .filter((cells) => cells.length === 3)
      .map(([t, kind, text]) => ({ t: Number.parseInt(t, 10), kind, text }))
  );

const num = (text, pattern) => {
  const match = pattern.exec(text ?? '');
  return match ? Number(match[1]) : null;
};

/** Breathing room around the subject, in CSS px — as much of it as fits. */
const SHOT_PADDING = 24;

/**
 * Screenshot an element with even padding on all four sides.
 *
 * `locator.screenshot()` clips to the border box, so the stage comes out flush
 * against the image edge. A `clip` region is the only way to get margin, and it
 * has to stay inside the viewport — Playwright rejects a clip that runs off the
 * page. Taking the smallest of the four available gaps keeps the padding even
 * rather than letting one side clamp shorter than the others: the preview's own
 * gutter is 16px, so asking for 24 would otherwise give 16 on top and 24
 * everywhere else.
 *
 * The region is in CSS px. `deviceScaleFactor: 2` on the context is what makes
 * the file 2×, and applies on top of this.
 */
const shootPadded = async (page, selector, path) => {
  const box = await page.locator(selector).boundingBox();
  if (!box) return;
  const view = page.viewportSize();
  const pad = Math.floor(
    Math.max(
      0,
      Math.min(SHOT_PADDING, box.x, box.y, view.width - (box.x + box.width), view.height - (box.y + box.height))
    )
  );
  await page.screenshot({
    path,
    clip: { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 },
  });
};

const runCase = async (context, testCase, shotPath) => {
  // A fresh page per case, inheriting the context viewport — so C9's resize
  // cannot leak into the next case.
  const page = await context.newPage();
  // `reactScan=false` is the preview's own opt-out; left on, react-scan paints
  // render outlines over the stage and lands a FPS meter in the screenshots.
  await page.goto(`${STORYBOOK}/iframe.html?viewMode=story&reactScan=false&id=${STORY}`);

  const button = `[data-testid="run-${testCase.id}"]`;
  await page.locator(button).waitFor({ state: 'visible' });
  // The first measurement lands on mount; give the IO frame time to arm so the
  // baseline reflects a settled beacon rather than a half-wired one.
  await page.waitForTimeout(400);
  await page.locator(button).click();
  await page.waitForSelector(`${button}[disabled]`, { timeout: 5_000 });

  if (testCase.external === 'narrow') {
    // Wait for the story to log `mutate`, which is the last thing it does before
    // sampling opens — a fixed sleep here would drift out of the window.
    await page.waitForFunction(
      () => [...document.querySelectorAll('[data-testid="trace"] > div')].some((row) => /mutate/.test(row.textContent)),
      null,
      { timeout: 10_000 }
    );
    await page.waitForTimeout(150);
    await page.setViewportSize(NARROWED);
  }

  await page.waitForSelector(`${button}:not([disabled])`, { timeout: 30_000 });

  const trace = await readTrace(page);
  if (shotPath) {
    // `section:has(…)` rather than `section`: the preview also renders an
    // aria-live notification region, which is a bare `section` too.
    await shootPadded(page, 'section:has([data-testid="stage"])', shotPath);
  }

  const line = (kind) => trace.find((e) => e.kind === kind)?.text;
  const settle = line('settle');
  await page.close();

  const settled = num(settle, /settled Δ ([\d.]+)px/);
  const base = num(line('baseline'), /Δ ([\d.]+)$/);
  // A non-zero baseline means the case's own `setup` went unobserved, so the
  // beacon was already wrong before the mutation landed. Whatever the settled Δ
  // says then, it is not a result about the mutation — C2 under `− RO` even
  // shrinks back into agreement and reads as a pass. Only C2 has a setup that
  // moves anything, and this is the one cell it can poison.
  const conclusive = base !== null && base <= 1;
  return {
    'base Δ': base ?? '—',
    'max Δ': num(settle, /max Δ ([\d.]+)px/) ?? '—',
    'settled Δ': settled ?? '—',
    frames: num(settle, /in (\d+) frames/) ?? '',
    ms: num(settle, /\/ (\d+)ms/) ?? '',
    tracked: settled === null ? '?' : !conclusive ? 'n/a' : settled <= 1 ? 'yes' : 'NO',
  };
};

await mkdir(SHOTS, { recursive: true });

/** Cases worth a picture: the hardest case tracked, the ablation that turns it
 *  into a stranded follower, and the one divergence that is correct by design.
 *  Not C7 / C8 — a scrolled-out target photographs as an empty stage. */
const SHOTS_WANTED = new Set(['all/C4', 'no-io/C4', 'all/C10']);

const tables = {};
const matrix = {};

for (const config of CONFIGS) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  await context.addInitScript(ablate, config.opts);

  const rows = {};
  for (const testCase of CASES) {
    const key = `${config.id}/${testCase.id}`;
    const shot = SHOTS_WANTED.has(key) ? new URL(`${key.replace('/', '-').toLowerCase()}.png`, SHOTS).pathname : null;
    const row = await runCase(context, testCase, shot);
    rows[testCase.label] = row;
    matrix[testCase.label] ??= {};
    // `ok` alone would hide a source that owns a case's *latency* rather than
    // its outcome: without the scroll listener the beacon still gets there, a
    // second later and 80px wrong in between. A pass with a visible lag is a
    // different finding from a pass nobody could see.
    const slow = row.tracked === 'yes' && row.ms !== '' && row.ms > 100;
    matrix[testCase.label][config.label] =
      row.tracked === 'yes'
        ? slow
          ? `ok, Δ${String(row['max Δ'])} for ${String(row.ms)}ms`
          : 'ok'
        : row.tracked === 'n/a'
          ? 'setup missed'
          : `Δ${String(row['settled Δ'])}`;
  }

  tables[config.label] = rows;
  await context.close();
}

for (const [label, rows] of Object.entries(tables)) {
  console.log(`\n── ${label} ${'─'.repeat(Math.max(0, 60 - label.length))}`);
  console.table(rows);
}

console.log('\n── which source owns which case ───────────────────────────────');
console.table(matrix);

await browser.close();
