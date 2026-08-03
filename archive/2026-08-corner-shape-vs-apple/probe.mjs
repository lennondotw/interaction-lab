/**
 * How close can CSS `corner-shape: superellipse(k)` get to Apple's continuous
 * corner?
 *
 * The question is not academic. `ContinuousCorner` measures its box before it can
 * emit a path, so its first paint has no corner at all. If `corner-shape` sits
 * within a pixel of the real curve it can be the progressive baseline — correct
 * immediately, then upgraded silently. If it does not, the upgrade is a visible pop
 * and leaving the first frame square is the more honest choice.
 *
 * No browser needed. Apple's curve is known exactly from its control points
 * (archive/2026-08-swiftui-corner-shapes), and `superellipse(k)` was confirmed
 * there to be |x|^n + |y|^n = 1 with n = 2^k, so both sides are closed form.
 *
 * Two parameters are fitted, not one. A superellipse is confined to the r x r
 * corner box while Apple's reaches 1.528665r, so comparing them at the same
 * nominal radius compares nothing — the CSS radius has to be free to scale. What
 * is minimised is the symmetric Hausdorff distance between the two *outlines*,
 * straight edges included, which is what makes the different start points on the
 * edge count as error rather than being ignored.
 *
 *   node archive/2026-08-corner-shape-vs-apple/probe.mjs
 */

/** Apple's corner at r = 1, from its own control points. Three cubics. */
const APPLE = [
  { p0: [0, 1.528665], c1: [0, 1.08849], c2: [0, 0.868407], p3: [0.074911, 0.631494] },
  {
    p0: [0.074911, 0.631494],
    c1: [0.16906, 0.372824],
    c2: [0.372824, 0.16906],
    p3: [0.631494, 0.074911],
  },
  { p0: [0.631494, 0.074911], c1: [0.868407, 0], c2: [1.08849, 0], p3: [1.528665, 0] },
];
const APPLE_EXTENT = 1.528665;

/** How far along each edge the sampled outline runs past the corner treatment. */
const TAIL = 2.2;
/** Samples per outline. Dense enough that polyline error is well under the answer. */
const SAMPLES = 900;

const cubic = ({ p0, c1, c2, p3 }, t) => {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0], a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1]];
};

/**
 * The outline near one corner, as a polyline: down the vertical edge, around the
 * corner, out along the horizontal edge. Sampled with the straight runs included so
 * that a curve which leaves the edge too early or too late is penalised for it.
 */
const appleOutline = () => {
  const points = [[0, TAIL]];
  const perSegment = Math.floor(SAMPLES / 3);
  for (const segment of APPLE) {
    for (let i = 1; i <= perSegment; i++) points.push(cubic(segment, i / perSegment));
  }
  points.push([TAIL, 0]);
  return points;
};

const superellipseOutline = (k, scale) => {
  const n = 2 ** k;
  const points = [[0, TAIL]];
  const steps = SAMPLES;
  // u runs from 1 at the edge to 0 at the diagonal and back, so walking x across
  // [0, scale] traces the whole corner.
  for (let i = 0; i <= steps; i++) {
    const x = (scale * i) / steps;
    const u = 1 - x / scale;
    const v = (1 - u ** n) ** (1 / n);
    points.push([x, scale * (1 - v)]);
  }
  points.push([TAIL, 0]);
  return points;
};

/** Squared distance from a point to a segment. */
const distToSegment = ([px, py], [ax, ay], [bx, by]) => {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2;
};

const directedHausdorff = (from, to) => {
  let worst = 0;
  for (const point of from) {
    let best = Infinity;
    for (let i = 0; i < to.length - 1; i++) {
      const d = distToSegment(point, to[i], to[i + 1]);
      if (d < best) best = d;
    }
    if (best > worst) worst = best;
  }
  return Math.sqrt(worst);
};

const apple = appleOutline();

const deviation = (k, scale) => {
  const other = superellipseOutline(k, scale);
  return Math.max(directedHausdorff(apple, other), directedHausdorff(other, apple));
};

/** Coarse-to-fine search over (k, radius scale). */
const fit = () => {
  let best = { k: 1.6, scale: 1.4, error: Infinity };
  let kRange = [1.0, 3.2];
  let sRange = [0.9, 1.9];
  let kStep = 0.05;
  let sStep = 0.02;

  for (let pass = 0; pass < 4; pass++) {
    for (let k = kRange[0]; k <= kRange[1] + 1e-9; k += kStep) {
      for (let s = sRange[0]; s <= sRange[1] + 1e-9; s += sStep) {
        const error = deviation(k, s);
        if (error < best.error) best = { k, scale: s, error };
      }
    }
    kRange = [best.k - kStep * 2, best.k + kStep * 2];
    sRange = [best.scale - sStep * 2, best.scale + sStep * 2];
    kStep /= 5;
    sStep /= 5;
  }
  return best;
};

const table = (headers, rows) => {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => `| ${cells.map((c, i) => String(c).padEnd(widths[i])).join(' | ')} |`;
  console.log(line(headers));
  console.log(`| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`);
  for (const row of rows) console.log(line(row));
  console.log('');
};

console.log('\n## 1. Best fit over both k and the radius scale\n');
const best = fit();
console.log(`  k              ${best.k.toFixed(4)}   (n = ${(2 ** best.k).toFixed(4)})`);
console.log(`  radius scale   ${best.scale.toFixed(4)}   css radius = scale * apple radius`);
console.log(`  deviation      ${best.error.toFixed(5)} r\n`);

console.log('## 2. What that costs in pixels, at radii people actually use\n');
table(
  ['apple radius', 'css radius', 'max deviation', 'visible at 2x DPR?'],
  [8, 12, 16, 20, 24, 32, 48, 64].map((r) => {
    const px = best.error * r;
    return [`${r}px`, `${(best.scale * r).toFixed(1)}px`, `${px.toFixed(3)}px`, px * 2 >= 1 ? 'yes' : 'no'];
  })
);

console.log('## 3. For comparison, the fit if k is pinned to the usual 1.6\n');
let pinned = { scale: 1, error: Infinity };
for (let s = 0.9; s <= 1.9; s += 0.001) {
  const error = deviation(1.6, s);
  if (error < pinned.error) pinned = { scale: s, error };
}
console.log(`  k = 1.6, best scale ${pinned.scale.toFixed(4)}, deviation ${pinned.error.toFixed(5)} r`);
console.log(`  at r = 24px that is ${(pinned.error * 24).toFixed(3)}px\n`);

console.log('## 4. And with no radius compensation at all, which is the naive port\n');
console.log(`  k = 1.6, scale 1.0, deviation ${deviation(1.6, 1).toFixed(5)} r`);
console.log(
  `  k = 1.6, scale ${(1 / 0.697).toFixed(3)} (depth-matched 1.4330), ` +
    `deviation ${deviation(1.6, 1.433).toFixed(5)} r\n`
);

console.log('## 5. Where the residual sits, along the best-fit corner\n');
const other = superellipseOutline(best.k, best.scale);
const rows = [];
for (const frac of [0, 0.15, 0.3, 0.45, 0.5, 0.55, 0.7, 0.85, 1]) {
  const index = Math.min(apple.length - 1, Math.round(frac * (apple.length - 1)));
  const point = apple[index];
  let nearest = Infinity;
  for (let i = 0; i < other.length - 1; i++) {
    nearest = Math.min(nearest, distToSegment(point, other[i], other[i + 1]));
  }
  rows.push([
    frac.toFixed(2),
    `(${point[0].toFixed(3)}, ${point[1].toFixed(3)})`,
    Math.sqrt(nearest).toFixed(5),
    (Math.sqrt(nearest) * 24).toFixed(3),
  ]);
}
table(['along outline', 'apple point (r=1)', 'gap / r', 'gap at r=24 (px)'], rows);
