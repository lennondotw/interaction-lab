/**
 * Two questions about seeding a distance field from laid-out DOM rects, measured
 * against the real `Components/Meta surface` stories.
 *
 *   1. **The quadtree domain.** `traverseSparse` roots at `nx & -nx`, so a domain
 *      *derived* from a measured element size instead of chosen can degenerate to
 *      single-cell roots — a flat scan plus a wasted centre probe per cell, strictly
 *      worse than `dense`, with nothing raised. This part runs in Node against the
 *      tracer directly, because it is arithmetic about the domain and needs no browser.
 *   2. **Does the contour keep up with the layout?** Five layout mutations, each
 *      sampled per frame against an independently measured field. This part drives the
 *      real story, because the answer is a property of the browser's observation
 *      primitives and not of any function.
 *
 * The second half deliberately reads the story's own trace panel rather than
 * re-implementing the measurement: the scalar it reports (`max |field(v)|` over the
 * painted vertices, against rects read via `getBoundingClientRect` where the items use
 * the `offsetParent` walk) is already an independent instrument, and a second copy here
 * would just be a third implementation to keep in sync.
 *
 * Part 1 needs nothing. Part 2 needs the Storybook dev server —
 * `pnpm --filter @monorepo/app-storybook dev` — and `pnpm exec playwright install
 * chromium`. It is skipped if the server is not reachable.
 *
 *   node archive/2026-07-metasurface-dom-field/probe.mjs
 */
import { chromium } from 'playwright';

const STORYBOOK = process.env.STORYBOOK_URL ?? 'http://localhost:6009';
const STORY = 'components-meta-surface--layout-tracking';
const CASES = ['S1', 'S2', 'S3', 'S4', 'S5'];
const VIEWPORT = { width: 1200, height: 900 };

const table = (header, rows) => {
  const all = [header, ...rows];
  const widths = header.map((_, column) => Math.max(...all.map((row) => String(row[column] ?? '').length)));
  const line = (row, pad = ' ') =>
    `| ${row.map((cell, column) => String(cell ?? '').padEnd(widths[column], pad)).join(' | ')} |`;
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

// ---------------------------------------------------------------- 1. the domain

/**
 * Reimplements only the two lines that decide the quadtree's root size, rather than
 * importing the tracer — the point is to show what the arithmetic does, and a
 * dependency-free probe is the archive's default.
 *
 *   traced = view + 2 * overscan     (ContourTracer constructor)
 *   tile   = nx & -nx                (traverseSparse)
 */
const domainShape = (view, overscan, cell) => {
  const traced = view + 2 * overscan;
  const nx = Math.round(traced / cell);
  const tile = nx & -nx;
  return { traced, nx, tile, roots: (nx / tile) ** 2 };
};

const QUADTREE_TILE = 256;
const padUp = (required) => Math.max(QUADTREE_TILE, Math.ceil(required / QUADTREE_TILE) * QUADTREE_TILE);

console.log('## 1. What a domain derived from an element size does to the quadtree\n');
console.log('Region sizes a real layout produces, at cell=2, overscan=128.\n');

const domainRows = [];
for (const region of [500, 640, 734, 863, 990, 1024, 1200]) {
  const fitted = domainShape(region, 128, 2);
  const padded = domainShape(padUp(region), 128, 2);
  domainRows.push([
    `${region}`,
    `${fitted.traced}`,
    `${fitted.nx}`,
    `${fitted.tile}`,
    fitted.roots.toLocaleString('en-US'),
    `${padUp(region)}`,
    `${padded.tile}`,
    padded.roots.toLocaleString('en-US'),
    fitted.tile === 1 ? 'DEGENERATE' : fitted.tile < 16 ? 'shallow' : 'ok',
  ]);
}
table(['region', 'fit dom', 'nx', 'tile', 'roots', 'pad view', 'tile', 'roots', 'fitted verdict'], domainRows);
console.log(
  'A root of size 1 makes every root a leaf, so `sparse` becomes a flat scan of the\n' +
    'whole domain plus one wasted centre probe per cell. Padding the domain to a\n' +
    'multiple of 256 keeps a large power-of-two root for every region size.\n'
);

// ---------------------------------------------------------------- 2. keeping up

/**
 * Confirm the Storybook is actually *this* project's before driving it.
 *
 * The default port is shared with whatever else a machine happens to be running, and a
 * probe pointed at a different Storybook does not fail cleanly — it reports missing
 * selectors and timeouts that read like the story is broken. This happened for real, with
 * another project's dev server holding 6009 while ours fell back to 6019.
 */
const index = await fetch(`${STORYBOOK}/index.json`)
  .then((response) => response.json())
  .catch(() => null);

if (index === null) {
  console.log(`## 2. Skipped — no Storybook at ${STORYBOOK}\n`);
  console.log('Start it with `pnpm --filter @monorepo/app-storybook dev`, or set STORYBOOK_URL.\n');
  process.exit(0);
}
if (!(`${STORY}` in index.entries)) {
  console.error(`The Storybook at ${STORYBOOK} has no story "${STORY}".`);
  console.error('It is most likely a different project holding that port. Set STORYBOOK_URL.');
  process.exit(1);
}

console.log('## 2. Does the contour keep up with the layout it is derived from?\n');

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORT });
const rows = [];

for (const id of CASES) {
  // A fresh page per case, like the beacon probe: a missed change leaves the surface
  // stale, and the next case would inherit a broken baseline and report a failure it
  // did not cause.
  const page = await context.newPage();
  await page.goto(`${STORYBOOK}/iframe.html?viewMode=story&reactScan=false&id=${STORY}`);

  const button = `[data-testid="run-${id}"]`;
  await page.locator(button).waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(700);
  await page.locator(button).click();
  await page.waitForSelector(`${button}[disabled]`, { timeout: 10_000 });
  await page.waitForSelector(`${button}:not([disabled])`, { timeout: 60_000 });

  const trace = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="trace"] > div')].map((node) => node.textContent.trim())
  );
  await page.close();

  const find = (pattern) => trace.find((line) => pattern.test(line)) ?? '';
  const label = find(/^\d+ms\s*S\d/).replace(/^\d+ms\s*/, '');
  const baseline = /max \|field\| ([\d.]+)px/.exec(find(/max \|field\|/))?.[1] ?? '?';
  const settle = find(/max Δ/);
  const maxDelta = /max Δ ([\d.]+)px/.exec(settle)?.[1] ?? '?';
  const settled = /settled Δ ([\d.]+)px/.exec(settle)?.[1] ?? '?';
  const recovery = /no frame ever disagreed/.test(settle)
    ? 'never disagreed'
    : (/recovered in (\d+ frames \/ \d+ms)/.exec(settle)?.[1] ?? 'never recovered');
  const verdict = /(tracked|MISSED)/.exec(find(/(tracked|MISSED) ·/))?.[1] ?? '?';

  rows.push([id, label.replace(/^S\d · /, ''), `${baseline}px`, `${maxDelta}px`, `${settled}px`, recovery, verdict]);
}

table(['case', 'mutation', 'baseline', 'max Δ', 'settled', 'recovery', 'verdict'], rows);
console.log(
  'Baseline is the error before any mutation: it is what the two independent\n' +
    'measurement paths disagree by at rest, and anything above the epsilon there means\n' +
    'the instrument is wrong rather than the subject.\n'
);

await context.close();
await browser.close();
