/**
 * Turns a signed distance field into an `feDisplacementMap` map, by refracting a ray
 * through a glass surface built on that field.
 *
 * The chain is SDF → height → normal → Snell → landing offset → R/G, and every step is
 * a physical quantity rather than a tuned curve. The alternative — a radial falloff with
 * a `t^gamma` shape, which is what the older `svg-displacement-map` story does — has no
 * scale to it: change the element's size and the look changes, and it only ever worked
 * because a circle's normal *is* its radial direction. Reading the normal off the field
 * instead is what makes a star's notch and a squircle's corner come out right without
 * being special-cased.
 *
 * Dispersion is deliberately out of scope. It would be three of these at slightly
 * different offsets, and getting one channel right first is the cheaper order —
 * `archive/2026-08-liquid-glass-internals` has what Apple actually does with the other two.
 */

import type { Sdf } from './shape-sdf.js';

export interface GlassConfig {
  /** Width of the curved rim band, in px. Inside this the surface is flat. */
  bevel: number;
  /** Height of the glass at the flat top, in px. The bevel climbs to this. */
  thickness: number;
  /** Distance from the exit face down to the backdrop, in px. Scales the whole effect. */
  depth: number;
  /** Refractive index. 1.5 is glass, 1.33 water, 1.0 no refraction at all. */
  ior: number;
}

export interface DisplacementMap {
  /** Device pixels. */
  width: number;
  height: number;
  dataUrl: string;
  /**
   * The `scale` that `feDisplacementMap` must be given for this encoding to mean what it
   * says. Chosen as `2 × maxOffset` so the 8-bit range is used fully and nothing clips:
   * the filter reads `offset = scale × (channel − 0.5)`, so a channel of 0 or 255 is
   * exactly ∓maxOffset.
   */
  scalePx: number;
  /** Largest landing offset anywhere in the map, in px. */
  maxOffsetPx: number;
  /** One 8-bit code, in px — the map's quantisation floor. */
  stepPx: number;
  /**
   * White inside the shape, transparent outside, antialiased across one device pixel.
   *
   * Comes out of the same pass as the map, which is the point: the glass has to be
   * clipped to the shape, and clipping it to a *stated* path would mean every shape
   * needed a closed-form outline — which a p-norm corner does not have. Taking the clip
   * from the field instead means it cannot disagree with the refraction inside it.
   */
  maskDataUrl: string;
  /** How long the field and the encoding took, in ms. */
  buildMs: number;
}

/**
 * Height of the glass at distance `a` inward from the rim.
 *
 * A spherical bevel: 0 at the rim, `thickness` where the flat top starts, joining it with
 * zero slope so there is no crease. Its slope goes to infinity at the rim, which is the
 * physically right thing — the surface there is vertical — and is what puts the strongest
 * refraction in the outermost pixels rather than smeared across the band.
 */
const bevelHeight = (a: number, bevel: number, thickness: number): number => {
  const t = Math.min(a / bevel, 1);
  const u = 1 - t;
  return thickness * Math.sqrt(Math.max(1 - u * u, 0));
};

/**
 * Rasterises the map for a `size × size` logical box at `dpr` device pixels per unit.
 *
 * The field is sampled once per pixel into a buffer, and the normal is then a difference
 * between *neighbouring samples* rather than four more calls to `sdf`. That is a 5×
 * saving on the only expensive thing here — a polygon's distance is a loop over every
 * edge, and Apple's flattened corner is a few hundred of them — and it is also the more
 * consistent choice, since the height profile and the normal then come from exactly the
 * same samples instead of from two different sets.
 *
 * Alpha in the map is 255 everywhere, and that is load-bearing rather than tidy:
 * `feDisplacementMap` reads unpremultiplied channels, so an alpha of 0 makes the colour
 * channels read as 0 — which is not "no displacement" but the *most negative*
 * displacement the scale allows. Any transparent pixel in a map is a smear.
 */
export const drawRefractionMap = (sdf: Sdf, size: number, dpr: number, config: GlassConfig): DisplacementMap | null => {
  const startedAt = performance.now();
  const pixels = Math.max(1, Math.round(size * dpr));
  const canvas = document.createElement('canvas');
  canvas.width = pixels;
  canvas.height = pixels;

  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;

  const field = new Float32Array(pixels * pixels);
  for (let py = 0; py < pixels; py++) {
    const y = (py + 0.5) / dpr;
    const row = py * pixels;
    for (let px = 0; px < pixels; px++) {
      field[row + px] = sdf((px + 0.5) / dpr, y);
    }
  }

  // Offsets first, encoding second: the scale cannot be chosen until the peak is known,
  // and guessing it either clips the rim or wastes most of the 8-bit range on nothing.
  const offsets = new Float32Array(pixels * pixels * 2);
  const coverage = new Uint8ClampedArray(pixels * pixels);
  let maxOffset = 0;

  const { bevel, thickness, depth, ior } = config;
  const eta = 1 / Math.max(ior, 1);
  const spacing = 1 / dpr; // logical px between neighbouring samples
  const last = pixels - 1;

  for (let py = 0; py < pixels; py++) {
    const row = py * pixels;
    const up = Math.max(py - 1, 0) * pixels;
    const down = Math.min(py + 1, last) * pixels;

    for (let px = 0; px < pixels; px++) {
      const index = row + px;
      const d = field[index] ?? 0;

      // Half a device pixel either side of the boundary, which is one pixel of ramp.
      coverage[index] = Math.round(255 * Math.min(Math.max(0.5 - d * dpr, 0), 1));

      const a = -d;
      if (d >= 0 || a >= bevel) continue; // outside, or on the flat top: straight through

      // Outward normal of the *shape*, from the field's gradient. Central differences
      // straddle creases — a star's notch, a triangle's vertex — where a one-sided
      // difference would pick a face and swing the normal by tens of degrees over a
      // pixel. Clamped at the border rather than wrapped.
      const left = Math.max(px - 1, 0);
      const right = Math.min(px + 1, last);
      const gx = ((field[row + right] ?? 0) - (field[row + left] ?? 0)) / (2 * spacing);
      const gy = ((field[down + px] ?? 0) - (field[up + px] ?? 0)) / (2 * spacing);
      const glen = Math.hypot(gx, gy);
      if (glen < 1e-6) continue; // medial axis: no meaningful normal, no displacement

      // Surface slope along that gradient. h rises going inward, so the 3D normal tilts
      // outward: N ∝ (h' · ĝ, 1).
      const hp =
        (bevelHeight(a + spacing, bevel, thickness) - bevelHeight(Math.max(a - spacing, 0), bevel, thickness)) /
        (2 * spacing);
      const nl = Math.hypot(hp, 1);
      const nx = (hp * gx) / glen / nl;
      const ny = (hp * gy) / glen / nl;
      const nz = 1 / nl;

      // Refract I = (0, 0, -1) at the air→glass interface.
      const cosI = nz;
      const k = 1 - eta * eta * (1 - cosI * cosI);
      const c = eta * cosI - Math.sqrt(Math.max(k, 0));
      const tz = -eta + c * nz;
      if (tz >= 0) continue; // not heading down; nothing to sample

      // Horizontal travel while the ray descends `depth` to the backdrop.
      //
      // Used verbatim as the displacement, with no sign flip, because
      // `feDisplacementMap` *gathers*: it reads `result(p) = source(p + offset)`, which
      // asks "where should this pixel look?" — the same question a ray traced backwards
      // from the eye answers. The two conventions agree, which is easy to assume and
      // worth checking once.
      //
      // The offsets come out pointing inward, and that is the only safe direction: the
      // backdrop only exists under the element, so a map sampling outward would reach
      // past it.
      const travel = depth / -tz;
      const dx = c * nx * travel;
      const dy = c * ny * travel;
      offsets[index * 2] = dx;
      offsets[index * 2 + 1] = dy;

      const magnitude = Math.hypot(dx, dy);
      if (magnitude > maxOffset) maxOffset = magnitude;
    }
  }

  const scalePx = maxOffset > 1e-6 ? maxOffset * 2 : 1;
  const image = ctx.createImageData(pixels, pixels);
  const { data } = image;

  for (let i = 0; i < pixels * pixels; i++) {
    data[i * 4 + 0] = Math.round(255 * (0.5 + (offsets[i * 2] ?? 0) / scalePx));
    data[i * 4 + 1] = Math.round(255 * (0.5 + (offsets[i * 2 + 1] ?? 0) / scalePx));
    data[i * 4 + 2] = 128; // unused by the filter; neutral so the map reads grey
    data[i * 4 + 3] = 255; // must be opaque — see the note above
  }

  ctx.putImageData(image, 0, 0);
  const dataUrl = canvas.toDataURL('image/png');

  // Reuse the canvas for the mask; the map is already encoded into a data URL by now.
  const maskImage = ctx.createImageData(pixels, pixels);
  for (let i = 0; i < pixels * pixels; i++) {
    maskImage.data[i * 4 + 0] = 255;
    maskImage.data[i * 4 + 1] = 255;
    maskImage.data[i * 4 + 2] = 255;
    maskImage.data[i * 4 + 3] = coverage[i] ?? 0;
  }
  ctx.putImageData(maskImage, 0, 0);

  return {
    width: pixels,
    height: pixels,
    dataUrl,
    scalePx,
    maxOffsetPx: maxOffset,
    stepPx: scalePx / 255,
    maskDataUrl: canvas.toDataURL('image/png'),
    buildMs: performance.now() - startedAt,
  };
};
