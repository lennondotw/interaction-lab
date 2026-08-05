/**
 * Measures when `AnimatePresence` actually removes an exiting child, against the
 * three real `Demos/AnimatePresence exit batching` stories.
 *
 * Each story owns a scripted run and a DOM trace panel; this probe presses Run,
 * waits for the script to finish, and reads the trace back out. Nothing is
 * re-implemented here, so the probe cannot drift away from what ships.
 *
 * Three numbers matter:
 *
 *   stranded ms     gap between a child's own `exit-done` and its `unmount`.
 *                   Above zero means removal is batched, not per-child.
 *   first x         where a re-entering child starts from. The enter target is
 *                   +300 and the exit target -300, so the sign alone says
 *                   whether `initial` was re-established.
 *   max frame jump  largest step between consecutive sampled frames. A resumed
 *                   animation is continuous; a reset one jumps.
 *
 * Requires the Storybook dev server — `pnpm --filter @monorepo/app-storybook dev`
 * in another shell.
 *
 *   node archive/2026-07-animate-presence-exit-batching/probe.mjs
 */
import { mkdir } from 'node:fs/promises';

import { chromium } from 'playwright';

const STORYBOOK = process.env.STORYBOOK_URL ?? 'http://localhost:6009';
const SHOTS = new URL('__screenshots__/', import.meta.url);

const CASES = [
  { id: 'S1', label: 'S1 batched removal', story: 'batched-removal', key: 'A' },
  { id: 'S2', label: 'S2 re-entry mid-exit', story: 're-entry-mid-exit', key: 'A' },
  { id: 'S3', label: 'S3 re-entry after exit', story: 're-entry-after-exit-complete', key: 'A' },
];

const STORY_PREFIX = 'demos-animatepresence-exit-batching--';

/** The three chrome flags matter: an occluded Chrome stalls rAF while still
 *  reporting `visibilityState: "visible"`, which silently distorts every
 *  per-frame sample. Headless plus these is the only configuration that held. */
const browser = await chromium.launch({
  args: [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
});

const page = await browser.newPage({ viewport: { width: 820, height: 900 }, deviceScaleFactor: 2 });

/** Pulls the rendered trace panel back into JS: one row per logged entry. */
const readTrace = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="trace"] > div')]
      .map((row) => [...row.querySelectorAll('span')].map((s) => s.textContent.trim()))
      .filter((cells) => cells.length === 3)
      .map(([t, kind, text]) => ({ t: Number.parseInt(t, 10), kind, text }))
  );

const numbers = (text) =>
  text
    .slice(text.indexOf(':') + 1)
    .trim()
    .split(/\s+/)
    .filter((token) => /^-?\d+$/.test(token))
    .map(Number);

const run = async ({ id, story, key }) => {
  // `reactScan=false` is the preview's own opt-out. Left on, react-scan paints
  // render outlines over every card and lands a FPS meter in the screenshots.
  await page.goto(`${STORYBOOK}/iframe.html?viewMode=story&reactScan=false&id=${STORY_PREFIX}${story}`);

  const button = `[data-testid="run-${id}"]`;
  await page.locator(button).waitFor({ state: 'visible' });
  await page.locator(button).click();

  // The button disables itself for the duration of the run, so waiting for it to
  // come back is waiting for the whole scenario — no fixed sleep to keep in sync
  // with the script. Wait for `disabled` to appear first: React has not
  // re-rendered at the instant the click resolves.
  await page.waitForSelector(`${button}[disabled]`, { timeout: 5_000 });
  await page.waitForSelector(`${button}:not([disabled])`, { timeout: 60_000 });

  const trace = await readTrace();
  // `section:has(…)` rather than `section`: something in the app renders an
  // aria-live notification region, which is also a bare `section`.
  await page
    .locator(`section:has([data-testid="stage-${id}"])`)
    .screenshot({ path: new URL(`${id.toLowerCase()}.png`, SHOTS).pathname });

  // Match the key as a word: the unmount line reads `− A (node #1)`, and its
  // leading glyph is a U+2212 minus that is easy to mistype.
  const forKey = new RegExp(`\\b${key}\\b`);
  const at = (kind, needle) => trace.find((e) => e.kind === kind && needle.test(e.text));
  const exitDone = at('exit-done', new RegExp(`\\b${key} EXIT`));
  const unmount = at('unmount', forKey);
  const sample = at('sample', /per frame/);

  const series = sample ? numbers(sample.text) : [];
  const jumps = series.slice(1).map((x, i) => Math.abs(x - series[i]));

  // Node ids come from the demo's own WeakMap, printed in every snapshot as
  // `A#1`. One distinct id across a remove and a re-add means React reused the
  // element — the re-entry really is a re-entry, not a fresh mount wearing the
  // same key. Read from the snapshots rather than the mount log because in S2
  // and S3 the node is never removed, so there is no mutation to observe.
  const ids = new RegExp(`${key}#(\\d+)`, 'g');
  const nodeIds = new Set(
    trace.filter((e) => e.kind === 'snapshot').flatMap((e) => [...e.text.matchAll(ids)].map((m) => m[1]))
  );

  return {
    'exit-done ms': exitDone?.t ?? '—',
    'unmount ms': unmount?.t ?? '—',
    'stranded ms': exitDone && unmount ? unmount.t - exitDone.t : '—',
    'first x': series.length ? series[0] : '—',
    'enters from': series.length ? (series[0] > 0 ? 'right' : 'left') : '—',
    'max frame jump': jumps.length ? Math.max(...jumps) : '—',
    'distinct nodes': nodeIds.size || '—',
  };
};

await mkdir(SHOTS, { recursive: true });

const rows = {};
for (const testCase of CASES) rows[testCase.label] = await run(testCase);

console.table(rows);

await browser.close();
