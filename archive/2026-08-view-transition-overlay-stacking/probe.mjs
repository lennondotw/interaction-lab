/**
 * Measures what a View Transition commit does to overlays that are not part of
 * the component running it, against the real
 * `Demos/Buffered Split Layout/View Transition Commit` story.
 *
 * The story is driven exactly as a user would drive it — one viewport resize,
 * which is the component's own debounced commit path. The overlays are the
 * probe's instrument, not part of the demo: each case appends one to `body`,
 * the way a portalled toast or dialog would arrive.
 *
 * The commit is normally 420ms, which is not long enough to inspect. So the
 * probe parks the transition: `animation-play-state: paused` on every view
 * transition pseudo-element holds `handle transition frame` in the `animating`
 * phase indefinitely, because that step counts a paused animation as active.
 * Removing the style releases it. Every "frozen" column below is therefore a
 * measurement of a real mid-commit frame, not a race against one.
 *
 * Four numbers matter:
 *
 *   hit frozen       what `elementFromPoint` returns at the overlay's centre
 *                    mid-commit. Anything other than the overlay means the
 *                    overlay stopped hit-testing.
 *   click frozen     whether a real click at that point reaches the overlay's
 *                    own listener. Paired with `click after`, which re-runs it
 *                    once the commit is done, to show the loss is transient.
 *   foreign px       share of the overlay's own rect not painted in its own
 *                    colour. The overlay is a flat colour block, so anything
 *                    above zero is another layer painting over it.
 *   opacity frozen   the overlay's computed opacity mid-commit. Stays "1" —
 *                    the suppression is not observable through style.
 *
 * The last case measures the abort rule instead: resizing the viewport while a
 * commit is animating changes the snapshot containing block, which the spec
 * requires the UA to treat as fatal to the transition.
 *
 * Requires `pnpm exec playwright install chromium` and the Storybook dev server
 * — `pnpm --filter @monorepo/app-storybook dev` in another shell.
 *
 *   node archive/2026-08-view-transition-overlay-stacking/probe.mjs
 */
import { mkdir } from 'node:fs/promises';

import { chromium } from 'playwright';

const STORYBOOK = process.env.STORYBOOK_URL ?? 'http://localhost:6009';
const SHOTS = new URL('__screenshots__/', import.meta.url);
const STORY = 'demos-buffered-split-layout-view-transition-commit--expanded';

const VIEWPORT = { width: 1100, height: 760 };
/** Sits well inside the left pane at a 0.6 split, over its paragraph column. */
const OVERLAY = { color: '#00ffff', h: 120, w: 220, x: 120, y: 300 };
/** Above the metrics panels' own group, which the demo pins at 20. */
const NAMED_GROUP_Z = 30;
const COMMIT_DEBOUNCE_MS = 200;

const CASES = [
  {
    id: 'C1',
    label: 'C1 portalled fixed toast',
    note: 'z-index 2147483647, no view-transition-name',
    named: false,
    topLayer: false,
  },
  {
    id: 'C2',
    label: 'C2 modal dialog (top layer)',
    note: 'dialog.showModal(), no view-transition-name',
    named: false,
    topLayer: true,
  },
  {
    id: 'C3',
    label: 'C3 same toast, but named',
    note: `view-transition-name + group z-index ${NAMED_GROUP_Z}`,
    named: true,
    topLayer: false,
  },
];

/** The three chrome flags matter: an occluded Chrome stalls rAF while still
 *  reporting `visibilityState: "visible"`, which would leave the transition
 *  parked for reasons the probe is not trying to measure. */
const browser = await chromium.launch({
  args: [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
});

const page = await browser.newPage({ deviceScaleFactor: 2, viewport: VIEWPORT });

/** Decodes a PNG through a canvas in a scratch page, so the probe keeps the
 *  archive's no-dependencies rule. Returns the share of pixels inside `rect`
 *  that are not `color`, as a percentage. */
const scratch = await browser.newPage();
await scratch.goto('about:blank');
const foreignShare = (png, rect, color) =>
  scratch.evaluate(
    async ([b64, box, want]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      // Inset by 2px: the overlay's own edge pixels are antialiased against
      // whatever is behind them, which would read as foreign at every sample.
      const data = ctx.getImageData(box.x + 2, box.y + 2, box.w - 4, box.h - 4).data;
      const [wr, wg, wb] = [1, 3, 5].map((i) => Number.parseInt(want.slice(i, i + 2), 16));
      let foreign = 0;
      for (let i = 0; i < data.length; i += 4) {
        // A tolerance of 8 per channel absorbs PNG quantisation without
        // absorbing text glyphs, which land tens of levels away.
        const off = Math.abs(data[i] - wr) > 8 || Math.abs(data[i + 1] - wg) > 8 || Math.abs(data[i + 2] - wb) > 8;
        if (off) foreign += 1;
      }
      return Math.round((foreign / (data.length / 4)) * 1000) / 10;
    },
    [png.toString('base64'), rect, color]
  );

/** `scale: 'css'` so screenshot coordinates are the CSS pixels the overlay was
 *  positioned in, regardless of deviceScaleFactor. */
const cssShot = () => page.screenshot({ scale: 'css' });

const setup = (testCase) =>
  page.evaluate(
    ([config, box, groupZ]) => {
      // Wrapping the API, not the component: the component swallows both
      // promises, so their outcomes are only observable from out here.
      const original = document.startViewTransition.bind(document);
      window.__vt = [];
      document.startViewTransition = (callback) => {
        const record = { finished: 'pending', ready: 'pending' };
        window.__vt.push(record);
        const transition = original(callback);
        transition.ready.then(
          () => (record.ready = 'fulfilled'),
          (error) => (record.ready = error.name)
        );
        transition.finished.then(
          () => (record.finished = 'fulfilled'),
          (error) => (record.finished = error.name)
        );
        return transition;
      };

      const freeze = document.createElement('style');
      freeze.id = 'probe-freeze';
      freeze.textContent = `
        ::view-transition-group(*), ::view-transition-image-pair(*),
        ::view-transition-old(*), ::view-transition-new(*) {
          animation-play-state: paused !important;
        }
        dialog#probe-overlay::backdrop { background: transparent; }
      `;
      document.head.append(freeze);

      const overlay = document.createElement(config.topLayer ? 'dialog' : 'div');
      overlay.id = 'probe-overlay';
      // No text content: the rect has to be one flat colour for `foreign px` to
      // mean "another layer painted here".
      overlay.style.cssText = [
        'position:fixed',
        `top:${box.y}px`,
        `left:${box.x}px`,
        `width:${box.w}px`,
        `height:${box.h}px`,
        'margin:0',
        'padding:0',
        'border:0',
        `background:${box.color}`,
        'z-index:2147483647',
      ].join(';');
      if (config.named) {
        overlay.style.viewTransitionName = 'probe-overlay';
        const rule = document.createElement('style');
        rule.textContent = `::view-transition-group(probe-overlay){z-index:${groupZ};}`;
        document.head.append(rule);
      }

      window.__clicks = 0;
      overlay.addEventListener('click', () => (window.__clicks += 1));
      document.body.append(overlay);
      if (config.topLayer) overlay.showModal();

      return { opened: config.topLayer ? overlay.open : null };
    },
    [testCase, OVERLAY, NAMED_GROUP_Z]
  );

const centre = { x: OVERLAY.x + OVERLAY.w / 2, y: OVERLAY.y + OVERLAY.h / 2 };

const probeState = async () => {
  const style = await page.evaluate(
    ([point]) => {
      const hit = document.elementFromPoint(point.x, point.y);
      const overlay = document.getElementById('probe-overlay');
      return {
        hit: hit === overlay ? 'overlay' : hit?.id || hit?.tagName.toLowerCase() || 'none',
        opacity: getComputedStyle(overlay).opacity,
      };
    },
    [centre]
  );

  const before = await page.evaluate(() => window.__clicks);
  await page.mouse.click(centre.x, centre.y);
  const after = await page.evaluate(() => window.__clicks);

  return { ...style, click: after > before ? 'yes' : 'no' };
};

const run = async (testCase) => {
  // `reactScan=false` is the preview's own opt-out; its overlay both repaints
  // over the stage and swallows clicks, which this probe measures.
  await page.setViewportSize(VIEWPORT);
  await page.goto(`${STORYBOOK}/iframe.html?viewMode=story&reactScan=false&id=${STORY}`);
  await page.locator('[data-demo-left-live]').waitFor({ state: 'visible' });
  await page.waitForTimeout(100);

  const { opened } = await setup(testCase);
  if (testCase.topLayer && opened !== true) throw new Error(`${testCase.id}: dialog did not open modally`);

  const idle = await probeState();
  const idleForeign = await foreignShare(await cssShot(), OVERLAY, OVERLAY.color);
  if (idle.hit !== 'overlay' || idle.click !== 'yes') {
    throw new Error(`${testCase.id}: overlay is not on top before the commit (${idle.hit}/${idle.click})`);
  }

  // One resize is the whole gesture: the component treats the first event as a
  // leading edge and debounces the committed layout to the trailing edge.
  await page.setViewportSize({ ...VIEWPORT, width: VIEWPORT.width - 100 });
  await page.waitForFunction(() => window.__vt[0]?.ready === 'fulfilled', null, { timeout: 10_000 });

  const frozen = await probeState();
  const frozenShot = await cssShot();
  const frozenForeign = await foreignShare(frozenShot, OVERLAY, OVERLAY.color);
  await page.screenshot({ path: new URL(`${testCase.id.toLowerCase()}-frozen.png`, SHOTS).pathname });

  // Releasing the paused animations lets the commit run to completion, so the
  // "after" columns say whether anything measured above was permanent.
  await page.evaluate(() => document.getElementById('probe-freeze')?.remove());
  await page.waitForFunction(() => window.__vt[0]?.finished !== 'pending', null, { timeout: 10_000 });
  const settled = await page.evaluate(() => window.__vt[0]);
  const after = await probeState();

  return {
    'hit frozen': frozen.hit,
    'click frozen': frozen.click,
    'click after': after.click,
    'hit after': after.hit,
    'foreign px idle': `${idleForeign}%`,
    'foreign px frozen': `${frozenForeign}%`,
    'opacity frozen': frozen.opacity,
    finished: settled.finished,
  };
};

/** Instruments the API without the overlay or the freeze, so the resize cases
 *  can decide for themselves whether to park the commit. */
const instrument = ({ park }) =>
  page.evaluate(
    ([shouldPark]) => {
      const original = document.startViewTransition.bind(document);
      window.__vt = [];
      document.startViewTransition = (callback) => {
        const record = { finished: 'pending', ready: 'pending' };
        window.__vt.push(record);
        const transition = original(callback);
        transition.ready.then(
          () => ((record.ready = 'fulfilled'), (record.readyAt = performance.now())),
          (error) => (record.ready = error.name)
        );
        transition.finished.then(
          () => ((record.finished = 'fulfilled'), (record.finishedAt = performance.now())),
          (error) => ((record.finished = error.name), (record.finishedAt = performance.now()))
        );
        return transition;
      };

      if (shouldPark) {
        const freeze = document.createElement('style');
        freeze.id = 'probe-freeze';
        freeze.textContent = `
          ::view-transition-group(*), ::view-transition-image-pair(*),
          ::view-transition-old(*), ::view-transition-new(*) {
            animation-play-state: paused !important;
          }
        `;
        document.head.append(freeze);
      }
    },
    [park]
  );

const openStory = async () => {
  await page.setViewportSize(VIEWPORT);
  await page.goto(`${STORYBOOK}/iframe.html?viewMode=story&reactScan=false&id=${STORY}`);
  await page.locator('[data-demo-left-live]').waitFor({ state: 'visible' });
  await page.waitForTimeout(100);
};

/**
 * One resize starts a commit; `second` then resizes again while that commit is
 * in flight, which is what the spec requires the UA to treat as fatal.
 *
 * `park` decides how the answer is read. A parked commit never settles on its
 * own, so if it settles anyway the transition was terminated from outside —
 * which is the only unambiguous signal available, because a mid-animation skip
 * resolves `finished` and leaves `ready` already fulfilled. It is not
 * distinguishable from success by its promises alone. The unparked rows read the
 * same thing the other way, as a `ready`→`finished` duration well under the
 * 420ms the cross-dissolve is written for.
 *
 * `burst` instead drags the window edge for real: a run of resize events too
 * close together for the 200ms debounce to fire between them.
 */
const resizeCase = async ({ burst = 0, park = false, second = false }) => {
  await openStory();
  await instrument({ park });

  if (burst > 0) {
    for (let step = 0; step < burst; step += 1) {
      await page.setViewportSize({ ...VIEWPORT, width: VIEWPORT.width - 20 * (step + 1) });
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(1_500);
    return { 'commits started': await page.evaluate(() => window.__vt.length) };
  }

  await page.setViewportSize({ ...VIEWPORT, width: VIEWPORT.width - 100 });
  await page.waitForFunction(() => window.__vt[0]?.ready === 'fulfilled', null, { timeout: 10_000 });
  if (second) await page.setViewportSize({ ...VIEWPORT, width: VIEWPORT.width - 160 });

  const settled = await page
    .waitForFunction(() => window.__vt[0]?.finished !== 'pending', null, { timeout: 3_000 })
    .then(() => true)
    .catch(() => false);

  const record = await page.evaluate(() => window.__vt[0]);
  return {
    settled: settled ? 'yes' : 'no',
    'ready→finished ms': record.finishedAt ? Math.round(record.finishedAt - record.readyAt) : '—',
    finished: record.finished,
    'commits started': await page.evaluate(() => window.__vt.length),
  };
};

/**
 * Whether an in-flight commit can be interrupted, and what happens if it is.
 *
 * The toggle is driven from the keyboard throughout, because a mouse click
 * anywhere mid-transition lands on `<html>` and blurs the button — which would
 * make the keyboard result unreadable rather than measuring it.
 *
 * `painted scaleX` is read off `::view-transition-image-pair`, so it is what is
 * actually on screen. `dom visual` is the component's own custom property. The
 * gap between the two is the finding: the intermediate state the user is looking
 * at exists only in the pseudo-element, so there is nothing in the DOM for a
 * second animation to start from.
 */
const runInterrupt = async () => {
  await openStory();
  await instrument({ park: true });
  await page.evaluate(() => {
    window.__toggleClicks = 0;
    document.querySelector('[data-demo-toggle-right]').addEventListener('click', () => (window.__toggleClicks += 1));
  });

  const readPainted = () =>
    page.evaluate(() => {
      const matrix = getComputedStyle(
        document.documentElement,
        '::view-transition-image-pair(buffered-split-left)'
      ).transform;
      const root = document.querySelector('[data-buffered-split-layout-view-transition-demo]');
      return {
        domVisual: root.style.getPropertyValue('--split-leading-visual-width'),
        paintedScaleX: matrix.startsWith('matrix') ? Number(matrix.slice(7).split(',')[0]).toFixed(4) : '—',
      };
    });

  const toggle = page.locator('[data-demo-toggle-right]');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__vt[0]?.ready === 'fulfilled', null, { timeout: 10_000 });
  const parked = await readPainted();

  // Pointer first. It also blurs the button, so focus has to be restored before
  // the keyboard attempt — the point here is only whether the click arrives.
  const clicksBeforePointer = await page.evaluate(() => window.__toggleClicks);
  const box = await toggle.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const pointerArrived = (await page.evaluate(() => window.__toggleClicks)) > clicksBeforePointer;

  await toggle.focus();
  const clicksBeforeKey = await page.evaluate(() => window.__toggleClicks);
  await page.keyboard.press('Enter');
  const keyArrived = await page
    .waitForFunction((seen) => window.__toggleClicks > seen, clicksBeforeKey, { timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(200);

  const records = await page.evaluate(() => window.__vt);
  return {
    'pointer arrives mid-commit': pointerArrived ? 'yes' : 'no',
    'keyboard arrives mid-commit': keyArrived ? 'yes' : 'no',
    'painted scaleX while parked': parked.paintedScaleX,
    'dom visual while parked': parked.domVisual,
    'first commit after interrupt': records[0].finished,
    'commits started': records.length,
  };
};

await mkdir(SHOTS, { recursive: true });

const rows = {};
for (const testCase of CASES) rows[`${testCase.label} — ${testCase.note}`] = await run(testCase);
console.log(
  `\nOverlay vs a parked commit  (Chromium ${browser.version()}, viewport ${VIEWPORT.width}x${VIEWPORT.height}, debounce ${COMMIT_DEBOUNCE_MS}ms)`
);
console.table(rows);

console.log('\nResizing while a commit is in flight');
console.table({
  'C4 parked commit, then resize': await resizeCase({ park: true, second: true }),
  'C5 parked commit, left alone (control)': await resizeCase({ park: true }),
  'C6 live commit, then resize': await resizeCase({ second: true }),
  'C7 live commit, left alone (baseline)': await resizeCase({}),
  'C8 ten resizes, 60ms apart': await resizeCase({ burst: 10 }),
});

console.log('\nInterrupting a commit');
console.table({ 'C9 parked toggle, then pointer and keyboard': await runInterrupt() });

await browser.close();
