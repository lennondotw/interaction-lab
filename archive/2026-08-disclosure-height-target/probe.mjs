/**
 * Measures what a disclosure animation should own — a length or a ratio — against the
 * real `Demos/DisclosureHeight` story and the real `Components/FileTree` story.
 *
 * Three parts, because the question has two halves and a verdict:
 *
 *   platform    Can CSS express "a fraction of my own content height", and does it
 *               re-resolve when the content changes? Built with `setContent`, because
 *               this half is about what the engine does, not about what we drew.
 *   mechanisms  The four candidates under an interrupted nested expand. Drives the
 *               demo story's own Replay button and reads its own metrics back out, so
 *               the probe cannot drift from what the story measures.
 *   shipped     The component after the switch: the same interrupt, plus the geometry
 *               invariant the row design rests on (every visible row 52px apart).
 *
 * Four numbers matter:
 *
 *   step        largest movement of the row below the subtree in one frame. The
 *               discontinuity shows up here — but so does a dropped frame, which is
 *               why `stall` is reported beside it.
 *   stall       longest run with no movement while the disclosure is still running.
 *               Non-zero means the parent reached a target that no longer described
 *               its content and pinned there.
 *   settled     when the row below reached its final position.
 *   moved       total travel, as a sanity check that every mode ends in one place.
 *
 * Requires the Storybook dev server — `pnpm --filter @monorepo/lab dev` in another
 * shell — and `pnpm exec playwright install chromium`.
 *
 *   node archive/2026-08-disclosure-height-target/probe.mjs
 *   STORYBOOK_URL=http://localhost:6019 node archive/2026-08-disclosure-height-target/probe.mjs
 */
import { chromium } from 'playwright';

const STORYBOOK = process.env.STORYBOOK_URL ?? 'http://localhost:6009';
const MODES = ['length', 'ratio', 'arithmetic', 'observed'];
const INTERRUPT_MS = 150;
const RUNS = 3;

/** The three flags matter: an occluded Chrome stalls rAF while still reporting
 *  `visibilityState: "visible"`, which silently distorts every per-frame sample and
 *  reads as a mechanism difference. */
const browser = await chromium.launch({
  args: [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
});

const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { height: 1000, width: 1400 } });

const story = async (id) => {
  // `reactScan=false` is the preview's own opt-out; its overlay swallows clicks.
  await page.goto(`${STORYBOOK}/iframe.html?id=${id}&globals=theme:light&reactScan=false`);
  await page.waitForSelector('[data-testid="stage"], [data-slot="file-tree"]');
};

const table = (rows) => {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => String(row[i]).length)));
  for (const [index, row] of rows.entries()) {
    console.log(row.map((cell, i) => String(cell).padEnd(widths[i])).join('  '));
    if (index === 0) console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  }
};

// ---------------------------------------------------------------------------
// platform — is "a fraction of my own content height" expressible, and live?
// ---------------------------------------------------------------------------

await page.setContent('<body style="margin:0"></body>');

const platform = await page.evaluate(() => {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px';
  document.body.append(host);

  const build = (rowCount) => {
    host.innerHTML = '';
    const box = document.createElement('div');
    box.style.cssText = 'display:grid;grid-template-rows:1fr;overflow:hidden';
    const inner = document.createElement('div');
    // Both are load-bearing: they are what makes the track's base size zero.
    inner.style.cssText = 'min-height:0;overflow:hidden';
    for (let i = 0; i < rowCount; i += 1) {
      const row = document.createElement('div');
      row.style.cssText = 'height:52px';
      inner.append(row);
    }
    box.append(inner);
    host.append(box);
    return { box, inner };
  };

  const grow = (inner, rowCount) => {
    for (let i = 0; i < rowCount; i += 1) {
      const row = document.createElement('div');
      row.style.cssText = 'height:52px';
      inner.append(row);
    }
  };

  const round = (value) => Math.round(value * 10) / 10;
  const height = (el) => round(el.getBoundingClientRect().height);
  const FRACTIONS = [0, 0.25, 0.5, 0.75, 1];

  const sampleFr = (rowCount) => {
    const { box } = build(rowCount);
    return FRACTIONS.map((f) => {
      box.style.gridTemplateRows = `${f}fr`;
      return height(box);
    });
  };

  const fr = { at156: sampleFr(3), at312: sampleFr(6) };

  // Liveness: hold the fraction, grow the content, see whether the box follows.
  const held = build(3);
  held.box.style.gridTemplateRows = '0.5fr';
  const frBefore = height(held.box);
  grow(held.inner, 3);
  const frAfter = height(held.box);

  const supportsCalcSize = CSS.supports('height', 'calc-size(auto, size * 0.5)');
  let calcSize = null;

  if (supportsCalcSize) {
    const { box, inner } = build(3);
    box.style.display = 'block';
    box.style.gridTemplateRows = '';
    const at = FRACTIONS.map((f) => {
      box.style.height = `calc-size(auto, size * ${f})`;
      return height(box);
    });
    box.style.height = 'calc-size(auto, size * 0.5)';
    const before = height(box);
    grow(inner, 3);
    calcSize = { after: height(box), at, before };
  }

  host.remove();

  return {
    calcSize,
    fr,
    frLive: { after: frAfter, before: frBefore },
    interpolateSize: CSS.supports('interpolate-size', 'allow-keywords'),
    supportsCalcSize,
  };
});

console.log('\nplatform — a fraction of my own content height, content 156px then 312px\n');
table([
  ['mechanism', 'f=0', 'f=.25', 'f=.5', 'f=.75', 'f=1', 'live 0.5f, 156->312'],
  ['grid fr (156)', ...platform.fr.at156, `${platform.frLive.before} -> ${platform.frLive.after}`],
  ['grid fr (312)', ...platform.fr.at312, ''],
  platform.calcSize
    ? ['calc-size (156)', ...platform.calcSize.at, `${platform.calcSize.before} -> ${platform.calcSize.after}`]
    : ['calc-size', 'unsupported', '', '', '', '', ''],
]);
console.log(
  `\ninterpolate-size: ${platform.interpolateSize}   calc-size(): ${platform.supportsCalcSize}` +
    '  (Chrome-only at time of writing, which is why the shipped answer is grid fr)\n'
);

// ---------------------------------------------------------------------------
// mechanisms — the four candidates, through the demo story's own instrument
// ---------------------------------------------------------------------------

await story('demos-disclosureheight--interrupted');

const setDelay = async (ms) => {
  await page.evaluate((value) => {
    const slider = document.querySelector('input[type="range"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(slider, String(value));
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  }, ms);
};

const replay = async () => {
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Replay'));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  });
  // The story waits 500ms to settle, records 900ms, then renders.
  await page.waitForTimeout(1800);

  return page.evaluate(
    (modes) =>
      Object.fromEntries(
        modes.map((mode) => [
          mode,
          Object.fromEntries(
            ['step', 'stall', 'settled', 'moved'].map((label) => [
              label,
              document.querySelector(`[data-metric="${mode}-${label}"]`)?.textContent.trim() ?? '?',
            ])
          ),
        ])
      ),
    MODES
  );
};

await setDelay(INTERRUPT_MS);

// The first run after a navigation pays for compilation and first paint, and its
// dropped frames land on every mode at once. Discarded rather than reported.
await replay();

const runs = [];
for (let i = 0; i < RUNS; i += 1) runs.push(await replay());

console.log(`mechanisms — nested expand interrupted at ${INTERRUPT_MS}ms, ${RUNS} warm runs\n`);
table([
  ['mode', ...runs.map((_, i) => `step ${i + 1}`), 'stall', 'settled', 'moved'],
  ...MODES.map((mode) => [
    mode,
    ...runs.map((run) => run[mode].step),
    runs.at(-1)[mode].stall,
    runs.at(-1)[mode].settled,
    runs.at(-1)[mode].moved,
  ]),
]);

// ---------------------------------------------------------------------------
// shipped — the component after the switch
// ---------------------------------------------------------------------------

await story('components-filetree--with-actions');

const shipped = await page.evaluate(async (interruptAt) => {
  const row = (id) => document.querySelector(`[data-file-tree-node="${CSS.escape(id)}"]`);
  const click = (id) =>
    row(id)
      .querySelector('[data-file-tree-tile="disclosure"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  const A = '/Applications';
  const U = '/Applications/Utilities';

  if (row(A).getAttribute('aria-expanded') === 'true') click(A);
  await new Promise((resolve) => setTimeout(resolve, 600));

  const t = [];
  const top = [];
  const track = [];
  let interrupted = false;
  const t0 = performance.now();

  click(A);

  await new Promise((resolve) => {
    const tick = () => {
      const now = performance.now() - t0;
      t.push(now);
      track.push(row(A).nextElementSibling.style.gridTemplateRows);
      top.push(row('/Library').getBoundingClientRect().top);
      if (!interrupted && now > interruptAt) {
        interrupted = true;
        click(U);
      }
      if (now < 900) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });

  const settledAt = top.findIndex((v) => Math.abs(v - top.at(-1)) < 0.5);
  let step = 0;
  let stall = 0;
  let runStart = null;

  for (let i = 1; i <= settledAt; i += 1) {
    const delta = Math.abs(top[i] - top[i - 1]);
    step = Math.max(step, delta);
    if (delta < 0.5) {
      runStart ??= t[i - 1];
      stall = Math.max(stall, t[i] - runStart);
    } else {
      runStart = null;
    }
  }

  // The geometry the row design rests on: three hit targets tile a 52px band, so a
  // pitch that is not exactly 52 anywhere means a dead seam between two rows.
  const tops = [...document.querySelectorAll('[data-file-tree-node]')]
    .filter((r) => !r.closest('[role="none"][inert]'))
    .map((r) => Math.round(r.getBoundingClientRect().top));
  const pitches = [...new Set(tops.slice(1).map((v, i) => v - tops[i]))];

  return {
    moved: Math.round(top.at(-1) - top[0]),
    pitches,
    settled: Math.round(t[settledAt]),
    stall: Math.round(stall),
    step: Math.round(step * 10) / 10,
    trackEndsOn: track.at(-1),
  };
}, INTERRUPT_MS);

console.log('\nshipped — Components/FileTree, same interrupt\n');
table([
  ['step', 'stall', 'settled', 'moved', 'track ends on', 'distinct row pitches'],
  [
    `${shipped.step}px`,
    `${shipped.stall}ms`,
    `${shipped.settled}ms`,
    `${shipped.moved}px`,
    shipped.trackEndsOn,
    shipped.pitches.join(', '),
  ],
]);

console.log(
  '\n`track ends on 1fr` is the point: the animation finishes holding the string it was\n' +
    'given, not a number it measured, so there is nothing to write back and nothing to\n' +
    'go stale. A single distinct pitch of 52 says the extra grid wrapper cost no geometry.\n'
);

await browser.close();
