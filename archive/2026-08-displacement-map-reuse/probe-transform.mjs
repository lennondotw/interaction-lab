// In which coordinate space does `backdrop-filter` evaluate, when an ancestor is transformed?
//
//   pnpm exec playwright install chromium      # once
//   node archive/2026-08-displacement-map-reuse/probe-transform.mjs
//
// This is the whole question behind "can one precomputed map survive a transform". If the
// filter runs in the element's own pre-transform space and the ancestor's transform is applied
// to the *result*, then a cached map stays correct under any affine transform — the picture is
// deformed as a unit and the refraction inside it was solved in local geometry that never
// changed. If instead the filter samples the backdrop in screen space, the offsets are in
// screen pixels while the geometry is scaled, the two disagree, and the map has to be rebuilt
// on every scale change.
//
// The spec is not the place to settle it and neither is reasoning: implementations differ on
// where the backdrop image is snapshotted. So this measures it.
//
// Method: a uniform displacement map — `feFlood` at R=255 with `scale=80`, which is a constant
// +40 unit offset in x, since the filter reads `offset = scale * (channel - 0.5)`. The backdrop
// is a hard black/white step at a known x. Through the glass the step appears shifted; the
// question is by 40 screen px or by 80 when the ancestor is scaled 2x.
//
// The screenshot is handed back into the page and read with a canvas, because Node has no PNG
// decoder and the effect is a paint result that no geometry API reports.

import { chromium } from 'playwright';

const SCALE = 80; // filter scale: a channel of 255 means +SCALE/2 units
const EDGE_X = 400; // where the backdrop's step sits, in CSS px
const EXPECTED_LOCAL = SCALE / 2; // 40 unshifted, doubling under scaleX(2) if local-space

const page = await (
  await chromium.launch()
).newPage({
  viewport: { width: 900, height: 500 },
  deviceScaleFactor: 1,
});

await page.setContent(`<body style="margin:0">
<svg width="0" height="0"><defs>
  <filter id="shift" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
    <feFlood flood-color="rgb(255,128,128)" flood-opacity="1" result="m"/>
    <feDisplacementMap in="SourceGraphic" in2="m" scale="${SCALE}" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</defs></svg>

<div style="position:absolute;inset:0;background:linear-gradient(to right,#000 0 ${EDGE_X}px,#fff ${EDGE_X}px 100%)"></div>

<!-- control: the glass with no ancestor transform -->
<div style="position:absolute;left:0;top:40px;width:900px;height:120px">
  <div style="position:absolute;left:200px;top:0;width:400px;height:120px;backdrop-filter:url(#shift)"></div>
</div>

<!-- the same glass, inside an ancestor scaled 2x horizontally about its left edge -->
<div style="position:absolute;left:0;top:240px;width:450px;height:120px;transform:scaleX(2);transform-origin:0 0">
  <div style="position:absolute;left:100px;top:0;width:200px;height:120px;backdrop-filter:url(#shift)"></div>
</div>
</body>`);

await page.waitForTimeout(400);
const shot = (await page.screenshot()).toString('base64');

const rows = await page.evaluate(async (data) => {
  const img = await new Promise((resolve) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.src = `data:image/png;base64,${data}`;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  // First bright pixel on a row: where the black/white step landed.
  const edgeAt = (row) => {
    for (let x = 1; x < canvas.width; x++) {
      if (pixels[(row * canvas.width + x) * 4] > 128) return x;
    }
    return -1;
  };
  return { background: edgeAt(10), control: edgeAt(100), scaled: edgeAt(300) };
}, shot);

const controlShift = rows.background - rows.control;
const scaledShift = rows.background - rows.scaled;
const verdict =
  Math.abs(scaledShift - controlShift * 2) <= 2
    ? 'LOCAL SPACE — the ancestor transform applies to the filtered result, so a cached map survives it'
    : Math.abs(scaledShift - controlShift) <= 2
      ? 'SCREEN SPACE — offsets stay in screen px while the geometry scales, so a scale invalidates the map'
      : 'NEITHER — the shift matches no simple model; look at the numbers';

console.log(`filter scale ${SCALE} -> a constant offset of ${EXPECTED_LOCAL}px in local units\n`);
console.log(`backdrop step at x            ${rows.background}`);
console.log(`through unscaled glass        ${rows.control}   shift ${controlShift}px`);
console.log(`through scaleX(2) ancestor    ${rows.scaled}   shift ${scaledShift}px`);
console.log(`\n${verdict}`);

process.exit(0);
