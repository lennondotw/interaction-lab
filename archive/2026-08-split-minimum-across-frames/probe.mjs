/**
 * Measures whether a split pane can be held at a stale width without ever being
 * painted below its own minimum, against the real
 * `Studies/Buffered split layout/Live commit` story.
 *
 * The story's window-resize policy is to hold the leading pane's width and let the
 * trailing pane absorb the whole viewport change live. Held width plus shrinking
 * viewport is exactly the shape of a minimum-width violation, so the question is
 * whether one is ever on screen, and if not, what stops it.
 *
 * Three parts:
 *
 *   bounds    the settled geometry across the width range, which is where the two
 *             minimums stop both being affordable. Establishes the range the
 *             invariant can even be stated over.
 *   frames    the same transitions watched by three observers at once. They differ
 *             in *when* they run relative to the rendering update, which turns out
 *             to be the whole answer.
 *   ordering  one viewport change, every observer's sample in sequence, to see
 *             which of them can read the un-clamped state.
 *
 * The three observers:
 *
 *   task      a 4ms `setInterval`. Free to land between the viewport being applied
 *             and the next rendering update.
 *   resize    a `resize` listener registered after the component's, so its sample
 *             is the DOM *after* the component has re-clamped.
 *   rAF       an animation frame callback: inside the rendering update, after the
 *             resize steps, so what it reads is what that frame paints.
 *   ro        a `ResizeObserver`, delivered later in the same update, after layout.
 *
 * Both minimums are 360px of *width*; a pane's box is 20px narrower, so the floor
 * to watch is a 340px box. Anything below that from `rAF` or `ro` is a violation
 * that reached the screen. From `task` it is a violation that existed only between
 * two tasks.
 *
 * Requires the Storybook dev server — `pnpm --filter @monorepo/lab dev` in another
 * shell — and `pnpm exec playwright install chromium`.
 *
 *   node archive/2026-08-split-minimum-across-frames/probe.mjs
 *   STORYBOOK_URL=http://localhost:6019 node archive/2026-08-split-minimum-across-frames/probe.mjs
 */
import { chromium } from 'playwright';

const STORYBOOK = process.env.STORYBOOK_URL ?? 'http://localhost:6009';
const STORY = 'studies-buffered-split-layout-live-commit--default';
const PANE_BOX_FLOOR_PX = 340;
const HEIGHT = 800;
const WIDE = 1200;
/** Long enough for the 100ms debounce plus the spring, which settles inside 500ms. */
const SETTLE_MS = 900;

/** The three flags matter: an occluded Chrome stalls rAF while still reporting
 *  `visibilityState: "visible"`, which would silently drop exactly the frames this
 *  probe is looking for and read as a clean result. */
const browser = await chromium.launch({
  args: [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
});

const page = await browser.newPage({ viewport: { height: HEIGHT, width: WIDE } });
// `reactScan=false` is the preview's own opt-out; its overlay swallows clicks.
await page.goto(`${STORYBOOK}/iframe.html?id=${STORY}&globals=theme:light&reactScan=false`);
await page.waitForSelector('[data-testid="stage"]');
await page.waitForTimeout(500);

const table = (rows) => {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => String(row[i]).length)));
  for (const [index, row] of rows.entries()) {
    console.log(row.map((cell, i) => String(cell).padEnd(widths[i])).join('  '));
    if (index === 0) console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  }
};

const setWidth = async (width) => page.setViewportSize({ height: HEIGHT, width });

const readSettled = () =>
  page.evaluate(() => {
    const box = (selector) => Math.round(document.querySelector(selector).getBoundingClientRect().width);

    return {
      lead: Math.round(
        Number.parseFloat(
          document.querySelector('[data-testid="stage"]').style.getPropertyValue('--split-leading-width')
        )
      ),
      left: box('[data-demo-left-pane]'),
      right: box('[data-demo-right-pane]'),
      vw: window.innerWidth,
    };
  });

// ---------------------------------------------------------------------------
// bounds — where can both minimums even hold
// ---------------------------------------------------------------------------

const bounds = [];
for (const width of [1200, 1000, 800, 720, 700, 600, 500, 420, 380, 360, 300, 200]) {
  await setWidth(width);
  await page.waitForTimeout(SETTLE_MS);
  bounds.push(await readSettled());
}

console.log('\nbounds — settled geometry, both minimums 360px of width = a 340px box\n');
table([
  ['viewport', 'leading width', 'leading box', 'trailing box', 'both >= 340'],
  ...bounds.map((row) => [
    `${row.vw}px`,
    `${row.lead}px`,
    `${row.left}px`,
    `${row.right}px`,
    row.left >= PANE_BOX_FLOOR_PX && row.right >= PANE_BOX_FLOOR_PX ? 'yes' : 'no',
  ]),
]);

// ---------------------------------------------------------------------------
// frames — three observers over the same transitions
// ---------------------------------------------------------------------------

const install = () =>
  page.evaluate(() => {
    window.__stop?.();
    const right = document.querySelector('[data-demo-right-pane]');
    const left = document.querySelector('[data-demo-left-pane]');
    const counter = document.querySelector('[data-demo-resize-counter]');
    const width = (element) => Math.round(element.getBoundingClientRect().width);
    window.__min = { ro: Infinity, task: Infinity, taskLeft: Infinity, raf: Infinity, rafLeft: Infinity };
    window.__worst = {};
    let running = true;

    const record = (kind, trailing, leading) => {
      if (trailing < window.__min[kind]) {
        window.__min[kind] = trailing;
        window.__worst[kind] = { retarget: counter.textContent.split('retarget ')[1], trailing, vw: window.innerWidth };
      }

      if (kind === 'raf' && leading < window.__min.rafLeft) window.__min.rafLeft = leading;
      if (kind === 'task' && leading < window.__min.taskLeft) window.__min.taskLeft = leading;
    };

    const tick = () => {
      record('raf', width(right), width(left));
      if (running) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    const observer = new ResizeObserver(() => record('ro', width(right), width(left)));
    observer.observe(right);
    const handle = setInterval(() => record('task', width(right), width(left)), 4);

    window.__stop = () => {
      running = false;
      observer.disconnect();
      clearInterval(handle);
    };
  });

const watch = async (steps) => {
  await setWidth(WIDE);
  await page.waitForTimeout(SETTLE_MS);
  await install();
  for (const [width, wait] of steps) {
    await setWidth(width);
    await page.waitForTimeout(wait);
  }

  await page.waitForTimeout(SETTLE_MS + 400);

  return page.evaluate(() => {
    window.__stop();
    return { min: window.__min, worst: window.__worst };
  });
};

const TRANSITIONS = [
  { label: '1200 -> 760, one event', steps: [[760, 400]] },
  { label: '1200 -> 900, one event', steps: [[900, 400]] },
  {
    label: '1200 -> 900, 6 events 50ms apart',
    steps: [
      [1150, 50],
      [1100, 50],
      [1050, 50],
      [1000, 50],
      [950, 50],
      [900, 50],
    ],
  },
  { label: '1200 -> 600, one event', steps: [[600, 400]] },
  { label: '1200 -> 380, one event', steps: [[380, 400]] },
];

const watched = [];
for (const transition of TRANSITIONS) watched.push({ ...transition, ...(await watch(transition.steps)) });

console.log('\nframes — smallest box each observer saw, across the whole transition\n');
table([
  ['transition', 'trailing rAF', 'trailing ro', 'trailing task', 'leading rAF', 'painted below 340'],
  ...watched.map((row) => [
    row.label,
    `${row.min.raf}px`,
    `${row.min.ro}px`,
    `${row.min.task}px`,
    `${row.min.rafLeft}px`,
    row.min.raf >= PANE_BOX_FLOOR_PX ? 'no' : `yes, ${row.min.raf}px`,
  ]),
]);

console.log("\n  worst frame each way, with the story's own retarget count at that moment:\n");
for (const row of watched) {
  console.log(
    `  ${row.label.padEnd(30)} rAF ${row.worst.raf.trailing}px at vw ${row.worst.raf.vw} after ${row.worst.raf.retarget} retargets` +
      `  |  task ${row.worst.task.trailing}px at vw ${row.worst.task.vw} after ${row.worst.task.retarget} retargets`
  );
}

// ---------------------------------------------------------------------------
// ordering — who can read the un-clamped state
// ---------------------------------------------------------------------------

await setWidth(WIDE);
await page.waitForTimeout(SETTLE_MS);

await page.evaluate(() => {
  const right = document.querySelector('[data-demo-right-pane]');
  window.__log = [];
  let frame = 0;
  const mark = (kind) =>
    window.__log.push({
      frame,
      kind,
      t: Math.round(performance.now() * 10) / 10,
      trailing: Math.round(right.getBoundingClientRect().width),
      vw: window.innerWidth,
    });

  // Registered after the component's own listener, so this sample is the DOM after
  // the component has had its turn on this event.
  window.addEventListener('resize', () => mark('resize (after component)'));
  const observer = new ResizeObserver(() => mark('ResizeObserver'));
  observer.observe(right);
  const tick = () => {
    frame += 1;
    mark('rAF');
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
  const handle = setInterval(() => mark('task (4ms timer)'), 4);
  window.__stopOrder = () => {
    observer.disconnect();
    clearInterval(handle);
  };
});

await setWidth(900);
await page.waitForTimeout(140);

const log = await page.evaluate(() => {
  window.__stopOrder();
  return window.__log;
});

const firstAtNewWidth = log.findIndex((entry) => entry.vw === 900);
const window_ = log.slice(Math.max(0, firstAtNewWidth - 2), firstAtNewWidth + 8);
const t0 = window_[0].t;

console.log('\nordering — one event, 1200 -> 900, samples around the change\n');
table([
  ['+ms', 'observer', 'viewport', 'trailing box', 'note'],
  ...window_.map((entry) => [
    (entry.t - t0).toFixed(1),
    entry.kind,
    `${entry.vw}px`,
    `${entry.trailing}px`,
    entry.vw === 900 && entry.trailing < PANE_BOX_FLOOR_PX ? 'below the floor' : '',
  ]),
]);

console.log(
  '\nThe order is the answer. A timer task can land after the viewport has been applied\n' +
    'and before the rendering update that describes it, so it reads the new viewport\n' +
    'against the old held width — a box under the floor that no frame ever paints. The\n' +
    'resize steps run inside that update, ahead of both rAF and ResizeObserver, so the\n' +
    'component re-clamps in the same task the bound moved in, and every observer that\n' +
    'runs after it sees the floor held. rAF and ResizeObserver agreeing is as close as an\n' +
    'in-page probe gets to the painted frame — both are inside the update that paints it,\n' +
    'neither is the compositor, so a frame drawn from a stale main thread during a window\n' +
    'drag is outside what this measures.\n\n' +
    'Which makes the invariant "no painted frame below 340px, for any viewport that can\n' +
    'afford both minimums" rest on three things: the bound is a function of the viewport\n' +
    'alone, every write to the width passes the clamp, and the resize handler re-publishes\n' +
    'the width it already holds so the bound and the published value move together. Drop\n' +
    'the third and the violation survives until the debounce fires, which the retarget\n' +
    'counts above put ~100ms later.\n'
);

await browser.close();
