// How much material does a given α mean, and can one 0 → 1 drive a glass surface evenly?
//
//   pnpm exec playwright install chromium               # once
//   pnpm --filter @monorepo/lab dev                     # phase C only; STORYBOOK_URL to override
//   node archive/2026-08-glass-fade-perceptual-alpha/probe.mjs
//
// A frosted surface is made of two things that both ramp from nothing: a blur radius and a
// tint alpha. Driving both from one linear α is the obvious thing, and it feels wrong — the
// change arrives almost entirely in the first fraction of the ramp. The question is whether
// that is the eye's response to the material or a mistake in the driving, and if it is the
// former, what to convert α through instead.
//
// Phases A and B build their own page. The question is what Chromium's blur does to real
// content, so a story would put our component between the measurement and the thing being
// measured. Phase C is the opposite: it drives the shipped stories through their args,
// because the claim there is about our own layering and must not be able to drift from it.
//
//   detail      Mean absolute luminance difference between pixels k device px apart, inside
//               the panel, for k over the octaves 2 … 64. A blur is a low-pass filter, so
//               this is the thing it destroys, and it stands in for "can you still read what
//               is behind the glass" without modelling legibility.
//
//               One scale is not enough and the first attempt at this used one. At k = 2 a
//               single pixel of blur already removes 78% of the signal — a stroke width is
//               all it takes — so a single-scale metric saturates immediately and no exponent
//               fits the curve it produces (γ swung between 2.7 and 23 depending on which
//               part was fitted). Octaves, equally weighted, track words and lines and disc
//               edges dissolving in turn, which is what "more frosted" looks like.
//
//   perceived   1 − detail/detail₀ per scale, averaged over scales, normalised so that the
//               full-strength material is 1. This is the axis α is supposed to move evenly.
//
//   γ           The exponent in radius = R·αᵏ that would make `perceived` linear in α. Fitted
//               by inverting the measured curve at eighths, then reported with its spread,
//               because the spread is the finding: a wide spread means no exponent fits.
//
//   step        Percentage change in the detail sum between adjacent radii in a fine sweep.
//               Neighbouring steps run under 1%; anything far above that is the compositor
//               changing how it blurs, not the design changing.
//
// Everything is measured at 2× device pixels, over the same backdrop the demo ships: one
// unbroken paragraph of 11px copy over four large translucent discs. Both bands matter —
// copy alone shows only what a blur destroys, discs alone only what it keeps.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, '__screenshots__');
const STORYBOOK_URL = process.env.STORYBOOK_URL ?? 'http://localhost:6019';

const DPR = 2;
const STAGE = { height: 224, width: 640 };
const PANEL = { inset: { x: 32, y: 36 }, radius: 16 };
// The read is inset well past the panel's own edge, so the blur's edge sampling and the
// hairline never enter it.
const READ_INSET = 28;
const SCALES = [2, 4, 8, 16, 32, 64];

const BLUR_PX = 20;
const TINT_ALPHA = 0.18;
const RADII = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20];
// Three neighbourhoods an octave apart, to see whether the quantum scales with the radius.
const QUANTA_WINDOWS = [
  [3.6, 4.3],
  [8.6, 9.3],
  [17.9, 18.6],
];
const QUANTUM_FRAMES = [4.12, 4.14];
const TINT_ALPHAS = Array.from({ length: 11 }, (_, i) => Number(((TINT_ALPHA * i) / 10).toFixed(4)));

const LOREM_SOURCE =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem. Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur.';

const PAGE = `<!DOCTYPE html>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #fafafa; font: 400 11px/1.45 ui-sans-serif, system-ui, sans-serif; }
  #stage {
    position: relative;
    width: ${STAGE.width}px;
    height: ${STAGE.height}px;
    overflow: clip;
    border: 1px solid rgb(0 0 0 / 0.15);
  }
  /* Overscanned on three sides exactly as the demo does, so no edge of the copy block is
     inside the frame and the backdrop reads as an endless page. */
  #backdrop {
    position: absolute;
    inset: -24px -80px 0 -80px;
    color: rgb(0 0 0 / 0.75);
    background:
      radial-gradient(circle 92px at 14% 26%, rgb(244 63 94 / 0.5) 99%, transparent 100%),
      radial-gradient(circle 74px at 38% 88%, rgb(245 158 11 / 0.5) 99%, transparent 100%),
      radial-gradient(circle 108px at 62% 18%, rgb(16 185 129 / 0.5) 99%, transparent 100%),
      radial-gradient(circle 84px at 86% 72%, rgb(139 92 246 / 0.5) 99%, transparent 100%);
  }
  #panel {
    position: absolute;
    inset: ${PANEL.inset.y}px ${PANEL.inset.x}px;
    border-radius: ${PANEL.radius}px;
  }
</style>
<div id="stage"><div id="backdrop"></div><div id="panel"></div></div>
<script>
  document.getElementById('backdrop').textContent = ${JSON.stringify(
    Array.from({ length: 4 }, () => LOREM_SOURCE).join(' ')
  )};
  window.setMaterial = ({ radius, tintAlpha }) => {
    const panel = document.getElementById('panel');
    panel.style.backdropFilter = 'blur(' + radius + 'px)';
    panel.style.backgroundColor = 'rgb(255 255 255 / ' + tintAlpha + ')';
    panel.style.boxShadow = 'inset 0 0 0 1px rgb(255 255 255 / ' + Math.min(1, tintAlpha * 2) + ')';
  };

  // Node has no PNG decoder, and the artefact is a paint result no geometry API reports, so
  // the screenshot comes back in here and is measured on a canvas.
  window.measure = async (base64, scales) => {
    const image = new Image();
    image.src = 'data:image/png;base64,' + base64;
    await image.decode();
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, image.width, image.height);
    const luma = (x, y) => {
      const i = (y * width + x) * 4;
      return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    };

    return scales.map((k) => {
      let sum = 0;
      let count = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x + k < width; x++) {
          sum += Math.abs(luma(x + k, y) - luma(x, y));
          count++;
        }
      }
      return count === 0 ? 0 : sum / count;
    });
  };
</script>`;

const READ_BOX = {
  x: PANEL.inset.x + READ_INSET,
  y: PANEL.inset.y + READ_INSET,
  width: STAGE.width - 2 * (PANEL.inset.x + READ_INSET),
  height: STAGE.height - 2 * (PANEL.inset.y + READ_INSET),
};

/*
 * A *page* screenshot with `clip`, not an element screenshot: `clip` is a page-screenshot
 * option and an element screenshot ignores it silently, which is worth stating because the
 * failure is quiet and looks like a finding. Measuring the whole stage instead of the panel
 * interior mixes in the unblurred backdrop around the panel, and detail then plateaus high and
 * even *rises* with radius — a curve that invites a conclusion about Chromium rather than
 * about the crop. The stage sits at the page origin, so the box is the same in both spaces.
 */
async function detailAt(page, material) {
  await page.evaluate((m) => window.setMaterial(m), material);
  const shot = await page.screenshot({ clip: READ_BOX });
  return page.evaluate(([base64, scales]) => window.measure(base64, scales), [shot.toString('base64'), SCALES]);
}

/** Equal weight per octave: scale-free, which is what "how much structure is gone" wants. */
const perceivedOf = (perScale, base) =>
  perScale.reduce((total, value, i) => total + (1 - value / base[i]), 0) / perScale.length;

function fitGamma(rows, full) {
  const shareAt = (radius) => {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].radius >= radius) {
        const t = (radius - rows[i - 1].radius) / (rows[i].radius - rows[i - 1].radius);
        return (rows[i - 1].perceived + t * (rows[i].perceived - rows[i - 1].perceived)) / full.perceived;
      }
    }
    return 1;
  };
  const radiusFor = (target) => {
    for (let i = 1; i < rows.length; i++) {
      const from = rows[i - 1].perceived / full.perceived;
      const to = rows[i].perceived / full.perceived;
      if (to >= target)
        return rows[i - 1].radius + ((target - from) / (to - from)) * (rows[i].radius - rows[i - 1].radius);
    }
    return full.radius;
  };
  const targets = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  const gammas = targets.map((t) => Math.log(radiusFor(t) / full.radius) / Math.log(t));

  return {
    shareAt,
    mean: gammas.reduce((a, b) => a + b, 0) / gammas.length,
    spread: Math.max(...gammas) - Math.min(...gammas),
    /** What a chosen exponent actually delivers, against the even ramp it is aiming at. */
    deliveredBy: (gamma) => {
      const line = Array.from({ length: 8 }, (_, i) => shareAt(full.radius * ((i + 1) / 8) ** gamma));
      const error = line.reduce((total, value, i) => total + Math.abs(value - (i + 1) / 8), 0) / 8;
      return { line, error };
    },
  };
}

async function sweepRadius(page, radii) {
  const rows = [];
  for (const radius of radii) {
    rows.push({ radius, perScale: await detailAt(page, { radius, tintAlpha: TINT_ALPHA }) });
  }
  const base = rows[0].perScale;

  return rows.map((row) => ({
    ...row,
    perceived: perceivedOf(row.perScale, base),
    sum: row.perScale.reduce((a, b) => a + b, 0),
  }));
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: DPR, viewport: { width: 900, height: 400 } });
  await page.setContent(PAGE);
  await page.waitForFunction(() => document.fonts.status === 'loaded');

  console.log('\n== A · perceived frostiness against blur radius, tint held at full strength');
  const radiusRows = await sweepRadius(page, RADII);
  const full = radiusRows[radiusRows.length - 1];
  const fit = fitGamma(radiusRows, full);
  console.log('radius  ' + SCALES.map((k) => `d${k}`.padStart(7)).join('') + '  perceived    share');
  for (const row of radiusRows) {
    console.log(
      String(row.radius).padStart(6),
      row.perScale.map((v) => v.toFixed(2).padStart(6)).join(' '),
      row.perceived.toFixed(4).padStart(9),
      (row.perceived / full.perceived).toFixed(4).padStart(8)
    );
  }
  console.log(
    `\nfitted gamma  mean ${fit.mean.toFixed(2)}  spread ${fit.spread.toFixed(2)}  (a wide spread means no exponent fits)`
  );
  for (const gamma of [1, 2, 3, 4]) {
    const { line, error } = fit.deliveredBy(gamma);
    console.log(
      `  gamma ${gamma.toFixed(1)}  perceived at a=⅛..1: ${line.map((v) => v.toFixed(2)).join(' ')}   mean |error| ${error.toFixed(3)}`
    );
  }

  console.log('\n== A · perceived veiling against tint alpha, blur held at 0');
  const tintRows = [];
  for (const tintAlpha of TINT_ALPHAS) {
    tintRows.push({ tintAlpha, perScale: await detailAt(page, { radius: 0, tintAlpha }) });
  }
  const tintBase = tintRows[0].perScale;
  const tintFull = perceivedOf(tintRows[tintRows.length - 1].perScale, tintBase);
  console.log('alpha    perceived   share');
  for (const row of tintRows) {
    const perceived = perceivedOf(row.perScale, tintBase);
    console.log(
      String(row.tintAlpha).padStart(6),
      perceived.toFixed(4).padStart(10),
      (perceived / tintFull).toFixed(4).padStart(8)
    );
  }

  /*
   * Phase B asks whether the radius axis is continuous, and it has to hold position fixed to
   * ask it. The first attempt laid one stage per radius down a 6000px page, which put every
   * sample at a different y — and reported a clean 7.5% cliff at radius 9 that does not survive
   * re-measuring the same element in place. Whatever that was, it belonged to where the panel
   * sat rather than to how much it blurred. One element, restyled, is the control.
   */
  console.log('\n== B · is the radius axis continuous? one element restyled, 0.02px steps');
  for (const [from, to] of QUANTA_WINDOWS) {
    const rows = [];
    for (let r = from; r <= to + 1e-9; r = Number((r + 0.02).toFixed(2))) {
      rows.push({
        radius: r,
        sum: (await detailAt(page, { radius: r, tintAlpha: TINT_ALPHA })).reduce((a, b) => a + b, 0),
      });
    }
    const changes = rows
      .slice(1)
      .map((row, i) => ({ radius: row.radius, pct: ((row.sum - rows[i].sum) / rows[i].sum) * 100 }))
      .filter((step) => Math.abs(step.pct) > 0.05);
    const periods = changes.slice(1).map((step, i) => Number((step.radius - changes[i].radius).toFixed(2)));
    const sizes = changes.map((c) => Math.abs(c.pct));
    console.log(
      `radius ${String(from).padStart(5)}..${to}  changes at ${changes.map((c) => `${c.radius} (${c.pct.toFixed(1)}%)`).join(', ') || 'none'}`
    );
    console.log(
      `${' '.repeat(9)}period ${periods.join(', ') || 'n/a'}px`,
      `  magnitude ${sizes.length > 0 ? `${Math.min(...sizes).toFixed(1)}-${Math.max(...sizes).toFixed(1)}%` : 'n/a'}`
    );
  }

  // Two frames either side of one quantum, kept so a step is inspectable rather than only
  // tabulated. The pair sits in the low range, where each quantum costs the most detail.
  for (const radius of QUANTUM_FRAMES) {
    await page.evaluate((m) => window.setMaterial(m), { radius, tintAlpha: TINT_ALPHA });
    await writeFile(
      join(SHOTS, `quantum-radius-${radius}.png`),
      await page.screenshot({ clip: { height: STAGE.height, width: STAGE.width, x: 0, y: 0 } })
    );
  }
  console.log(`wrote __screenshots__/quantum-radius-${QUANTUM_FRAMES.join('.png and -')}.png`);

  await runStoryPhase(browser);
  await browser.close();
}

/*
 * Phase C drives the shipped stories rather than a copy, so the layering cannot drift from
 * what ships. Two claims, both about composition order:
 *
 *   1. args → α → mapping → style. The mapping is applied on the way to the styles only, so
 *      a slider still reads α while the radius follows α^γ.
 *   2. gesture → ease → α → mapping. The ease shapes α over time; the mapping then converts
 *      it. A CSS transition cannot express this — it interpolates each property's endpoint
 *      values and never evaluates the α between them, and both endpoints are the same under
 *      any mapping — which is why the stories drive α per frame.
 */
async function runStoryPhase(browser) {
  const page = await browser.newPage({ deviceScaleFactor: DPR, viewport: { width: 900, height: 700 } });
  const storyId = 'demos-glass-fade--material-strength-mapped';
  const url = `${STORYBOOK_URL}/iframe.html?id=${storyId}&viewMode=story`;
  const response = await page.goto(url, { waitUntil: 'load' }).catch(() => null);
  if (response === null || !response.ok()) {
    console.log(`\n== C · skipped: no Storybook at ${STORYBOOK_URL} (pnpm --filter @monorepo/lab dev)`);
    await page.close();

    return;
  }
  await page.waitForSelector('figure');

  console.log('\n== C · mode × α over the real stories, against the model');
  const matrix = await page.evaluate(async (id) => {
    const channel = window.__STORYBOOK_ADDONS_CHANNEL__;
    // `maskImage` hands back a whole gradient, so pull the first colour out of it first. An
    // opaque colour computes as `rgb(r, g, b)` with no alpha term at all, and a bare `, 0)`
    // match then reads it as fully transparent — which is a parser bug that looks like a
    // component bug at exactly one sample, alpha = 1.
    const alphaOf = (value) => {
      const colour = /rgba?\([^)]*\)/.exec(value)?.[0] ?? value;
      if (/^rgb\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*\)$/.test(colour)) return 1;
      const match = /\/\s*([\d.]+)\)/.exec(colour) ?? /,\s*([\d.]+)\)/.exec(colour);
      return match ? Number(match[1]) : colour === 'rgba(0, 0, 0, 0)' ? 0 : 1;
    };
    const read = () => {
      const plate = document.querySelector('figure > div');
      const wrapper = plate.querySelector(':scope > div.absolute.inset-0');
      const glass = wrapper ? wrapper.firstElementChild : plate.querySelector(':scope > div:nth-child(2)');
      const style = getComputedStyle(glass);

      return {
        radius:
          glass.style.backdropFilter === 'none' ? 'none' : Number(/([\d.]+)px/.exec(glass.style.backdropFilter)[1]),
        tint: alphaOf(style.backgroundColor),
        ring: alphaOf(style.boxShadow),
        opacity: Number(style.opacity),
        mask: style.maskImage === 'none' ? null : alphaOf(style.maskImage),
        wrapper: wrapper ? Number(getComputedStyle(wrapper).opacity) : null,
        chip: Number(getComputedStyle(glass.firstElementChild).opacity),
      };
    };
    // Args cross the channel to the manager and back. Settling on an observed change rather
    // than a fixed delay matters: a fixed delay silently reports the previous sample, which
    // reads as an off-by-one failure in every row.
    const set = async (args) => {
      const before = JSON.stringify(read());
      channel.emit('updateStoryArgs', { storyId: id, updatedArgs: args });
      for (let i = 0; i < 80; i++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        if (JSON.stringify(read()) !== before) break;
      }

      return read();
    };

    const rows = [];
    await set({
      backdrop: 'text',
      blurPx: 20,
      tint: '#ffffff',
      tintAlphaTarget: 0.18,
      mapping: 'linear',
      blurRadiusProgress: null,
      tintAlphaProgress: null,
      contentProgress: null,
      interaction: null,
      mode: 'material',
      progress: 1,
    });

    for (const mode of ['layer-opacity', 'mask-alpha', 'ancestor-opacity', 'material']) {
      for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
        rows.push({ mode, progress, mapping: 'linear', gamma: 1, got: await set({ mode, progress }) });
      }
    }
    for (const gamma of [1, 2, 4]) {
      for (const progress of [0.25, 0.5, 0.75]) {
        rows.push({
          mode: 'material',
          progress,
          mapping: 'perceptual',
          gamma,
          got: await set({ mode: 'material', mapping: 'perceptual', blurGamma: gamma, progress }),
        });
      }
    }

    return rows;
  }, storyId);

  const near = (a, b, tol = 0.006) => typeof a === 'number' && Math.abs(a - b) <= tol;
  let failures = 0;
  for (const { mode, progress, mapping, gamma, got } of matrix) {
    const axis = mode === 'material' ? progress : 1;
    const mapped = mapping === 'perceptual' ? axis ** gamma : axis;
    const wantRadius = 20 * mapped === 0 ? 'none' : 20 * mapped;
    const bad = [];
    if (wantRadius === 'none' ? got.radius !== 'none' : !near(got.radius, wantRadius, 0.02))
      bad.push(`radius ${got.radius} want ${wantRadius}`);
    if (!near(got.tint, 0.18 * axis)) bad.push(`tint ${got.tint} want ${(0.18 * axis).toFixed(3)}`);
    if (!near(got.ring, Math.min(1, 0.36 * axis))) bad.push(`ring ${got.ring}`);
    if (!near(got.opacity, mode === 'layer-opacity' ? progress : 1)) bad.push(`opacity ${got.opacity}`);
    if ((got.mask !== null) !== (mode === 'mask-alpha')) bad.push(`mask presence`);
    if (mode === 'mask-alpha' && !near(got.mask, progress)) bad.push(`maskAlpha ${got.mask}`);
    if (mode === 'ancestor-opacity' && !near(got.wrapper, progress)) bad.push(`wrapper ${got.wrapper}`);
    if (!near(got.chip, mode === 'material' ? axis : 1)) bad.push(`chip ${got.chip}`);
    if (bad.length > 0) failures++;
    console.log(
      `${mode.padEnd(17)} ${mapping.padEnd(11)} γ=${gamma} α=${String(progress).padEnd(5)}`,
      `r=${String(got.radius).padEnd(6)} tint=${String(got.tint).padEnd(6)} op=${String(got.opacity).padEnd(5)}`,
      `mask=${String(got.mask).padEnd(5)} wrap=${String(got.wrapper).padEnd(5)} chip=${got.chip}`,
      bad.length > 0 ? `  FAIL ${bad.join('; ')}` : ''
    );
  }
  console.log(`${matrix.length - failures}/${matrix.length} rows match the model`);

  console.log('\n== C · α over time, per easing, sampled per frame');
  for (const timing of ['linear', 'ease']) {
    const trace = await page.evaluate(
      async ([id, ease]) => {
        const channel = window.__STORYBOOK_ADDONS_CHANNEL__;
        channel.emit('updateStoryArgs', {
          storyId: id,
          updatedArgs: {
            interaction: 'toggle',
            timing: ease,
            mapping: 'perceptual',
            blurGamma: 2,
            mode: 'material',
            blurRadiusProgress: null,
            tintAlphaProgress: null,
            contentProgress: null,
          },
        });
        await new Promise((resolve) => setTimeout(resolve, 400));
        const panel = document.querySelector('figure > div > div:nth-child(2)');
        const button = [...document.querySelectorAll('button')].find((b) => /^(Show|Hide)/.test(b.textContent ?? ''));
        // Start from rest every time, or the second trace measures the reverse gesture and its
        // curve reads mirrored.
        if (button?.textContent?.startsWith('Hide')) {
          button.click();
          await new Promise((resolve) => setTimeout(resolve, 600));
        }
        const samples = [];
        button?.click();

        return new Promise((resolve) => {
          const start = performance.now();
          const tick = () => {
            const alpha = Number((panel.firstElementChild.textContent ?? '').replace('%', '')) / 100;
            const radius = Number(/blur\(([\d.]+)px\)/.exec(panel.style.backdropFilter)?.[1] ?? NaN);
            samples.push({ t: Math.round(performance.now() - start), alpha, radius });
            if (performance.now() - start < 460) requestAnimationFrame(tick);
            else resolve(samples);
          };
          requestAnimationFrame(tick);
        });
      },
      [storyId, timing]
    );
    const mappingHolds = trace.every(({ alpha, radius }) => Math.abs(radius - 20 * alpha ** 2) < 0.5);
    const quarter = trace.find((s) => s.t >= 100)?.alpha;
    const half = trace.find((s) => s.t >= 200)?.alpha;
    console.log(
      `${timing.padEnd(7)} frames ${String(trace.length).padStart(3)}  α at 100ms ${String(quarter).padEnd(5)} at 200ms ${String(half).padEnd(5)}`,
      ` radius = 20·α² every frame: ${mappingHolds}`
    );
    console.log(
      '        α:',
      trace
        .filter((_, i) => i % 3 === 0)
        .map((s) => s.alpha.toFixed(2))
        .join(' ')
    );
  }

  await page.close();
}

await main();
