// Why does a blurred bar leave a bright thread along a rounded frame's corner, and which
// layer has to carry the colour for it to go away?
//
//   pnpm exec playwright install chromium      # once
//   node archive/2026-08-backdrop-filter-corner-thread/probe.mjs
//
// The frame is `border-radius` + `overflow: hidden`; every layer inside it is square. A bar
// with `backdrop-filter` sits at the top and reaches both top corners. Along each corner
// curve a subpixel ring of the content underneath comes out *untinted*, which reads as a
// bright hairline tracing the corner — brightest where the curve meets the straight edge.
//
// The suspicion is that the filter promotes the bar to its own compositing layer, and that
// the frame's rounded clip is then rasterised separately for that layer with coverage along
// the curve that does not agree with the main layer's. If so, the fix is not geometry: it is
// making sure the layer that carries the *colour* is not the promoted one. This measures both
// halves of that claim across five arrangements of the same bar.
//
// Nothing here imports the component. The question is about what the compositor does with a
// rounded clip, so the page is built from scratch — a story would put our code between the
// measurement and the thing being measured.
//
// Three numbers per arrangement, each with an obvious pass condition.
//
// The first is measured *differentially*, against the same arrangement with `backdrop-filter`
// removed. That control is a pixel-exact reference for what the corner should look like,
// because over a solid colour a blur is a no-op — so any difference is the compositing, not
// the design. It also cancels the anti-aliasing of the frame's own edge, which turns out to
// matter: a translucent layer at partial coverage is *marginally brighter* than its own
// interior (the tint's effective alpha falls with coverage faster than the content's
// contribution does), so an absolute "brightest pixel in the corner" reading has a nonzero
// floor in a perfectly correct render and cannot separate the defect from the floor.
//
//   threadMax   Over SOLID content, the largest per-pixel luminance difference from the
//               no-filter control inside the corner box, 0-255. 0 is what a correct corner
//               scores.
//   threadPx    How many device pixels in that box differ by more than 8 luma — enough to
//               see. This is the number that separates *a ring* from *an edge that moved*:
//               a peak on its own cannot tell a hairline tracing the whole curve from two
//               pixels at the tangent point, and it is the ring that reads as a defect.
//   arcStep     Over a GRADIENT, the largest step between adjacent pixels along a horizontal
//               line 6px below the frame's top edge, crossing the region where a rounded blur
//               layer's own edge would fall. A blurred region's boundary is visible over
//               non-uniform content even when the layer has no colour of its own, so this is
//               what catches a second, wrongly-sized arc drawn inside the corner. A gradient
//               alone climbs smoothly, so a high value is an edge that should not be there.
//   midVar      Over STRIPED content, the luminance standard deviation in the middle of the
//               bar. The control for the control: near zero means the blur is actually
//               running. An arrangement that scores 0 on threadMax by having quietly stopped
//               blurring is not a fix.
//
// Screenshots are read by handing the PNG back into the page and decoding it with a canvas,
// because Node has no PNG decoder and the artefact is a paint result that no geometry API
// reports. The corner crops written to `__screenshots__/` are magnified with
// `imageSmoothingEnabled = false`, so one output pixel block is exactly one device pixel and
// the hairline is countable rather than interpolated.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, '__screenshots__');

const DPR = 2; // the artefact is per-device-pixel; 2x is where it was reported
const FRAME = { x: 40, y: 40, size: 400, radius: 16 };
const BAR_HEIGHT = 84;
const MAGNIFY = 10;
const CROP = 30; // CSS px of the corner to crop, including a little outside the frame

/** Bright enough that anything untinted reads far above the tinted bar. */
const CONTENT_SOLID = '#c9a6ff';
/** Smooth, so the only edge in the corner is one a layer boundary put there. */
const CONTENT_GRADIENT = 'linear-gradient(160deg, #c9a6ff, #2a1f52)';
/** 3px hard stripes: the highest-frequency backdrop there is, so blur is unmistakable. */
const CONTENT_STRIPES = 'repeating-linear-gradient(0deg, #fff 0 3px, #000 3px 6px)';

const TINT = 'rgba(10, 10, 12, 0.6)';
const BLUR = 'blur(12px)';

/**
 * Each arrangement is the same bar drawn a different way.
 *
 * Whether one layer holds both `tint` and `blur` is the variable that matters: it decides
 * whether the element carrying the translucent colour is also the one carrying
 * `backdrop-filter`, and therefore promoted to its own compositing layer. `radius` and the
 * frame-level `mask` are the two fixes that look right and are not.
 */
const VARIANTS = [
  {
    name: 'single',
    note: 'one layer: tint and blur together, overdrawn 1px',
    layers: [{ tint: true, blur: true, overdraw: true, radius: 0 }],
  },
  {
    name: 'split',
    note: 'tint alone (overdrawn) under blur alone, both square',
    layers: [
      { tint: false, blur: true, overdraw: false, radius: 0 },
      { tint: true, blur: false, overdraw: true, radius: 0 },
    ],
  },
  {
    name: 'split-r16',
    note: 'as split, blur radius = frame radius',
    layers: [
      { tint: false, blur: true, overdraw: false, radius: 16 },
      { tint: true, blur: false, overdraw: true, radius: 0 },
    ],
  },
  {
    name: 'split-r28',
    note: 'as split, blur radius 12px wider than the frame',
    layers: [
      { tint: false, blur: true, overdraw: false, radius: 28 },
      { tint: true, blur: false, overdraw: true, radius: 0 },
    ],
  },
  {
    name: 'single-masked',
    note: 'single, plus a no-op mask on the frame to force flatten-then-clip',
    mask: true,
    layers: [{ tint: true, blur: true, overdraw: true, radius: 0 }],
  },
];

function layerStyle({ tint, blur, overdraw, radius }, noFilter) {
  const inset = overdraw
    ? `top:-1px;left:-1px;right:-1px;height:${BAR_HEIGHT + 1}px`
    : `top:0;left:0;right:0;height:${BAR_HEIGHT}px`;
  return [
    'position:absolute',
    inset,
    'pointer-events:none',
    tint ? `background:${TINT}` : '',
    blur && !noFilter ? `backdrop-filter:${BLUR};-webkit-backdrop-filter:${BLUR}` : '',
    radius > 0 ? `border-top-left-radius:${radius}px;border-top-right-radius:${radius}px` : '',
  ]
    .filter(Boolean)
    .join(';');
}

function html(variant, content, noFilter = false) {
  const mask = variant.mask
    ? 'mask-image:linear-gradient(#000,#000);-webkit-mask-image:linear-gradient(#000,#000);'
    : '';
  return `<body style="margin:0;background:#262626">
    <div style="position:absolute;left:${FRAME.x}px;top:${FRAME.y}px;width:${FRAME.size}px;height:${FRAME.size}px;
                border-radius:${FRAME.radius}px;overflow:hidden;contain:layout style paint;${mask}">
      <div style="position:absolute;inset:0;background:${content}"></div>
      ${variant.layers.map((l) => `<div style="${layerStyle(l, noFilter)}"></div>`).join('\n')}
    </div>
  </body>`;
}

/**
 * Boxes are in CSS px relative to the viewport, and converted to device px in the page.
 *
 * `corner` is the top-right corner plus a sliver of the outside; it is diffed against the
 * control rather than read absolutely, so the outside costs nothing and keeps the crop
 * legible. `scan` is a one-pixel line 6px below the top edge, stopping short of the frame's
 * own curve, which at that height sits ~3.5px in — a 28px blur layer's edge crosses the same
 * line ~11px in, so the two never collide. `mid` and `ref` are deep inside the bar.
 */
const right = FRAME.x + FRAME.size;
const BOXES = {
  corner: { x: right - CROP + 6, y: FRAME.y - 6, w: CROP, h: CROP },
  scan: { x: right - 40, y: FRAME.y + 6, w: 34, h: 1 },
  mid: { x: FRAME.x + FRAME.size / 2 - 15, y: FRAME.y + 30, w: 30, h: 24 },
  /** Well inside the bar, away from every corner: what a correctly tinted pixel looks like. */
  ref: { x: FRAME.x + FRAME.size / 2 - 5, y: FRAME.y + 60, w: 10, h: 10 },
};

const page = await (
  await chromium.launch()
).newPage({
  viewport: { width: FRAME.x * 2 + FRAME.size, height: FRAME.y * 2 + FRAME.size },
  deviceScaleFactor: DPR,
});

/** Rec. 709 luma, which is what "brighter" means to an eye looking for a hairline. */
const read = async ([data, boxes, dpr, crop, magnify]) => {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = `data:image/png;base64,${data}`;
  });

  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);

  const lums = (box) => {
    const d = ctx.getImageData(box.x * dpr, box.y * dpr, box.w * dpr, box.h * dpr).data;
    const out = [];
    for (let i = 0; i < d.length; i += 4) out.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    return out;
  };
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const stdev = (a) => {
    const m = mean(a);
    return Math.sqrt(mean(a.map((v) => (v - m) ** 2)));
  };

  const out = {};
  for (const [key, box] of Object.entries(boxes)) {
    const l = lums(box);
    out[key] = { max: Math.max(...l), mean: mean(l), stdev: stdev(l) };
  }
  // Returned whole so Node can diff two renders pixel for pixel, and walk the scan line.
  out.cornerLums = lums(boxes.corner);
  out.scanLums = lums(boxes.scan).slice(0, boxes.scan.w * dpr);

  // Nearest-neighbour magnification of the corner, so a reader can count the pixels.
  const m = document.createElement('canvas');
  m.width = crop * dpr * magnify;
  m.height = crop * dpr * magnify;
  const mc = m.getContext('2d');
  mc.imageSmoothingEnabled = false;
  mc.drawImage(c, boxes.corner.x * dpr, boxes.corner.y * dpr, crop * dpr, crop * dpr, 0, 0, m.width, m.height);
  out.crop = m.toDataURL('image/png');
  return out;
};

async function measure(variant, content, noFilter = false) {
  await page.setContent(html(variant, content, noFilter));
  await page.waitForTimeout(300); // let the compositor settle before the capture
  const shot = (await page.screenshot()).toString('base64');
  return page.evaluate(read, [shot, BOXES, DPR, CROP, MAGNIFY]);
}

const maxAbsDiff = (a, b) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);
const maxStep = (a) => a.slice(1).reduce((m, v, i) => Math.max(m, Math.abs(v - a[i])), 0);

/** Device pixels that differ by enough to be seen rather than measured. */
const VISIBLE_LUMA = 8;
const countAbove = (a, b) => a.filter((v, i) => Math.abs(v - b[i]) > VISIBLE_LUMA).length;

await mkdir(SHOTS, { recursive: true });

const rows = [];
for (const variant of VARIANTS) {
  const solid = await measure(variant, CONTENT_SOLID);
  const control = await measure(variant, CONTENT_SOLID, true);
  const gradient = await measure(variant, CONTENT_GRADIENT);
  const striped = await measure(variant, CONTENT_STRIPES);

  rows.push({
    variant: variant.name,
    threadMax: maxAbsDiff(solid.cornerLums, control.cornerLums),
    threadPx: countAbove(solid.cornerLums, control.cornerLums),
    arcStep: maxStep(gradient.scanLums),
    midVar: striped.mid.stdev,
    note: variant.note,
  });

  for (const [mode, shot] of [
    ['solid', solid],
    ['control', control],
    ['gradient', gradient],
    ['striped', striped],
  ]) {
    await writeFile(join(SHOTS, `corner-${variant.name}-${mode}.png`), Buffer.from(shot.crop.split(',')[1], 'base64'));
  }
}

// The floor for `arcStep`: the gradient with no bar over it at all, which is the most
// featureless thing the scan line can cross. Anything at this level is the gradient itself.
const bare = await measure({ name: 'bare', layers: [] }, CONTENT_GRADIENT);

const pad = (s, n) => String(s).padEnd(n);
const num = (v, n) => v.toFixed(1).padStart(n);

console.log(`\n${FRAME.size}px frame, ${FRAME.radius}px radius, ${BAR_HEIGHT}px bar, ${DPR}x. Luminance 0-255.\n`);
console.log(
  `${pad('variant', 15)}${pad('threadMax', 11)}${pad('threadPx', 10)}${pad('arcStep', 9)}${pad('midVar', 8)}note`
);
for (const r of rows) {
  console.log(
    `${pad(r.variant, 15)}${num(r.threadMax, 9)}  ${String(r.threadPx).padStart(8)}  ${num(r.arcStep, 7)}  ${num(r.midVar, 6)}  ${r.note}`
  );
}
console.log(
  `${pad('(no bar)', 15)}${pad('', 11)}${pad('', 10)}${num(maxStep(bare.scanLums), 7)}  ${pad('', 8)}gradient alone — the arcStep floor`
);
console.log(`\nCorner box is ${CROP}x${CROP} CSS px = ${CROP * DPR * (CROP * DPR)} device px.`);
console.log(`\nCorner crops (${MAGNIFY}x, nearest-neighbour) in __screenshots__/.\n`);

await page.context().browser().close();
