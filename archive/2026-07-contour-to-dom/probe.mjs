/**
 * Measures what it costs to take the traced contour out of a canvas and into the
 * DOM, against the real `Studies/SDF edge trace` stories.
 *
 * Four questions, four tables:
 *
 *   1. `d` string vs `Path2D`. The trace is identical either way, so the story's
 *      benchmark traces once per cell size and holds that geometry still while
 *      both builders run against it. The ratio between them is the price of the
 *      move, isolated from everything else.
 *   2. The inset contour. A distance field's inset is just the iso level `-w`, so
 *      the second contour re-reads the first one's samples. That makes it free in
 *      *samples* on a grid walk and not free in *time*, and it is not free at all
 *      for a quadtree, which has to go find a second perimeter.
 *   3. Where the inset stops being the same shape. Past some width a narrow waist
 *      has nothing left in it and the inner contour breaks in two. The story
 *      walks the width and reports the threshold rather than asserting one.
 *
 * Nothing is re-implemented here for 1-3. The `runPathSweep` / `runInsetSweep`
 * modules that produce those numbers are the ones the stories ship, batched and
 * medianed the same way for both, and this probe presses their buttons and reads
 * the tables back out. A Node re-implementation would be free of the browser, and
 * would also be free to drift from what ships.
 *
 *   4. Whether a `clip-path` rewritten every frame makes its subtree re-raster.
 *      Measured here directly rather than through a panel, because it is not a
 *      property of any function — see `sampleFrames`.
 *
 * Requires the Storybook dev server — `pnpm --filter @monorepo/app-storybook dev`
 * in another shell — and `pnpm exec playwright install chromium`.
 *
 *   node archive/2026-07-contour-to-dom/probe.mjs
 */
import { chromium } from 'playwright';

const STORYBOOK = process.env.STORYBOOK_URL ?? 'http://localhost:6009';
const SVG_STORY = 'sdf-edge-trace-svg-path--default';
const DOM_STORY = 'sdf-edge-trace-clip-and-outline--default';

const VIEWPORT = { width: 1600, height: 1100 };
/**
 * Frames per sample window — about 3s at the 60Hz headless Chromium composites at,
 * long enough for a stall to land in p95 rather than hide in the tail.
 */
const FRAME_SAMPLES = 180;
/** Clipped-box widths swept for the reraster question, in CSS px. */
const CLIP_SIZES = [520, 1040, 1400];

/**
 * Confirm the Storybook at `STORYBOOK` is actually *this* project's before driving it.
 *
 * Worth the twenty lines: the default port is shared with whatever else a machine happens
 * to be running, and a probe pointed at a different Storybook does not fail cleanly — it
 * reports missing selectors and timeouts that read like the story is broken. This happened
 * for real, with another project's dev server holding 6009 while ours fell back to 6019.
 */
const requireStories = async (ids) => {
  let index;
  try {
    index = await fetch(`${STORYBOOK}/index.json`).then((r) => r.json());
  } catch {
    console.error(`Cannot reach a Storybook at ${STORYBOOK}.`);
    console.error('Start one with `pnpm --filter @monorepo/app-storybook dev`, or set STORYBOOK_URL.');
    process.exit(1);
  }
  const missing = ids.filter((id) => !(id in index.entries));
  if (missing.length > 0) {
    console.error(`The Storybook at ${STORYBOOK} does not have: ${missing.join(', ')}`);
    console.error('It is most likely a different project holding that port. Set STORYBOOK_URL.');
    process.exit(1);
  }
};

const open = async (context, story) => {
  const page = await context.newPage();
  // `reactScan=false` is the preview's own opt-out; left on, its overlay
  // swallows clicks and lands an FPS meter on top of the panel.
  await page.goto(`${STORYBOOK}/iframe.html?viewMode=story&reactScan=false&id=${story}`);
  await page.waitForTimeout(1200);
  return page;
};

/** Clicks a button by its label inside a specific labelled control group. */
const pick = (page, group, value) =>
  page.evaluate(
    ([label, wanted]) => {
      const field = [...document.querySelectorAll('div')].find((node) => node.textContent?.startsWith(label));
      if (!field) throw new Error(`no control group "${label}"`);
      const button = [...field.querySelectorAll('button')].find((node) => node.textContent.trim() === wanted);
      if (!button) throw new Error(`no "${wanted}" in "${label}"`);
      button.click();
    },
    [group, value]
  );

/**
 * Selects a ball arrangement and guarantees the positions are re-created.
 *
 * Clicking the arrangement that is already selected sets no state, so the story's
 * "rebuild the balls" effect never runs and the sweep would measure wherever
 * autoplay had drifted to instead of the documented shape. Bouncing off the other
 * arrangement forces a real change in both directions — and it has to be the
 * arrangement rather than the ball count, because the count control is disabled
 * while `neck` is active.
 */
const resetShape = async (page, target) => {
  await pick(page, 'Shape', target === 'ring' ? 'neck' : 'ring');
  await page.waitForTimeout(200);
  await pick(page, 'Shape', target);
  await page.waitForTimeout(400);
};

const readTable = (page, testId) =>
  page.evaluate(
    (id) =>
      [...document.querySelectorAll(`[data-testid="${id}"] tr`)].map((row) =>
        [...row.children].map((cell) => cell.textContent.trim())
      ),
    testId
  );

/**
 * Runs one of the story benchmark panels to completion.
 *
 * The caption only renders once the sweep has finished, which makes it a more
 * honest signal than the button re-enabling — the button is also enabled before
 * the first click.
 */
const runPanel = async (page, id, captionId) => {
  await page.locator(`[data-testid="run-${id}"]`).click();
  await page.waitForFunction((selector) => document.querySelector(selector) !== null, `[data-testid="${captionId}"]`, {
    timeout: 300_000,
  });
  await page.waitForTimeout(200);
};

/**
 * Frame-time distribution over `FRAME_SAMPLES` frames.
 *
 * Deliberately not the story's own `fps` stat: that is a median, and a median
 * cannot show a stall. p95 and the count of frames over budget can.
 */
const sampleFrames = (page) =>
  page.evaluate(
    (count) =>
      new Promise((resolve) => {
        const deltas = [];
        let last = performance.now();
        const tick = () => {
          const now = performance.now();
          deltas.push(now - last);
          last = now;
          if (deltas.length < count) {
            requestAnimationFrame(tick);
            return;
          }
          const sorted = [...deltas].sort((a, b) => a - b);
          const at = (q) => +sorted[Math.floor(sorted.length * q)].toFixed(2);
          resolve({ p50: at(0.5), p95: at(0.95), worst: +sorted[sorted.length - 1].toFixed(2) });
        };
        requestAnimationFrame(tick);
      }),
    FRAME_SAMPLES
  );

const table = (header, rows) => {
  const all = [header, ...rows];
  const widths = header.map((_, column) => Math.max(...all.map((row) => String(row[column] ?? '').length)));
  const line = (row, pad = ' ') =>
    `| ${row.map((cell, column) => String(cell ?? '').padEnd(widths[column], pad)).join(` | `)} |`;
  console.log(line(header));
  console.log(
    line(
      widths.map((width) => '-'.repeat(width)),
      '-'
    )
  );
  for (const row of rows) console.log(line(row));
  console.log('');
};

await requireStories([SVG_STORY, DOM_STORY]);

const main = async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT });

  // ---------------------------------------------------------------- 1. d vs Path2D
  const svg = await open(context, SVG_STORY);
  // Freeze the shape, then re-create it, so the table describes the documented
  // 4-ball ring rather than wherever autoplay had drifted to. The bounce through 8
  // is load-bearing: 4 is already selected, and re-selecting it sets no state, so
  // the effect that rebuilds the positions would never run.
  await svg.getByRole('checkbox', { name: 'autoplay' }).uncheck();
  await pick(svg, 'Balls', '8');
  await svg.waitForTimeout(200);
  await pick(svg, 'Balls', '4');
  await svg.waitForTimeout(400);
  await runPanel(svg, 'path-benchmark', 'path-benchmark-caption');

  console.log('## 1. Expressing the same vertices as a string instead of a Path2D\n');
  console.log(`${await svg.locator('[data-testid="path-benchmark-caption"]').textContent()}\n`);
  table(
    ['cell', 'cmd', 'prec', 'trace ms', 'Path2D ms', 'd ms', 'd/P2D', 'chars', 'b/vert', 'round-off'],
    await readTable(svg, 'path-benchmark-rows')
  );
  await svg.close();

  // ---------------------------------------------------------------- 2 + 3. the inset
  const dom = await open(context, DOM_STORY);
  await dom.getByRole('checkbox', { name: 'autoplay' }).uncheck();

  for (const shape of ['ring', 'neck']) {
    await resetShape(dom, shape);
    await runPanel(dom, 'inset-benchmark', 'inset-benchmark-caption');

    console.log(`## 2. Inset cost — ${shape}\n`);
    console.log(`${await dom.locator('[data-testid="inset-benchmark-caption"]').textContent()}\n`);
    table(
      ['traversal', 'cell', 'ms', 'ms +inset', 'ms x', 'evals', 'evals +inset', 'evals x', 'verts x', 'loops'],
      await readTable(dom, 'inset-benchmark-rows')
    );

    const pinchAt = await dom.evaluate(
      () => document.querySelector('[data-testid="pinch-at"]')?.textContent?.trim() ?? 'never splits'
    );
    console.log(`## 3. Topology vs inset width — ${shape} (${pinchAt})\n`);
    table(['inset', 'surface loops', 'inner loops', 'shape'], await readTable(dom, 'pinch-rows'));
  }

  // ---------------------------------------------------------------- 4. the clip
  console.log('## 4. Does a per-frame clip-path cost its subtree?\n');
  await resetShape(dom, 'ring');
  await dom.getByRole('checkbox', { name: 'autoplay' }).check();
  const clipRows = [];

  for (const size of CLIP_SIZES) {
    // Past the story's own 520px cap; `useMeasure` feeds `displaySize` from this
    // box, so the whole surface follows.
    await dom.evaluate((width) => {
      const box = document.querySelector('.max-w-\\[520px\\]');
      box.style.maxWidth = `${width}px`;
      box.style.width = `${width}px`;
    }, size);
    await dom.waitForTimeout(800);

    for (const content of ['gradient', 'text', 'filter']) {
      await pick(dom, 'Content', content);
      await dom.waitForTimeout(600);
      const on = await sampleFrames(dom);

      await dom.getByRole('checkbox', { name: 'clip content' }).uncheck();
      await dom.waitForTimeout(600);
      const off = await sampleFrames(dom);
      await dom.getByRole('checkbox', { name: 'clip content' }).check();

      clipRows.push([
        `${size}`,
        content,
        `${on.p50}`,
        `${off.p50}`,
        `${on.p95}`,
        `${off.p95}`,
        `${(on.p50 - off.p50).toFixed(2)}`,
      ]);
    }
  }

  table(['box px', 'content', 'p50 on', 'p50 off', 'p95 on', 'p95 off', 'Δp50'], clipRows);
  console.log(
    'A capped instrument: every row fits inside a frame, so this bounds the clip\n' +
      'rather than pricing it. Δp50 at or under the clock granularity means the clip\n' +
      'did not push the frame over budget at that size — not that it is free.\n'
  );

  await dom.close();
  await context.close();
  await browser.close();
};

await main();
