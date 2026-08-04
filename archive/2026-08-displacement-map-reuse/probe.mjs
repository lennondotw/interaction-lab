// How much of a merged group's displacement map actually changes when one shape moves.
//
//   node archive/2026-08-displacement-map-reuse/probe.mjs
//
// The question behind it: a displacement map is expensive enough that recomputing a whole
// group per frame is out (measured elsewhere at 12-65ms for one 400px map), so the only way
// SVG filters survive a merging group is if a move dirties a small region and the rest of the
// texture can be kept. That turns on two things this measures:
//
//   1. How wide the blend actually reaches. `sdf-edge-trace`'s quadratic smin is
//      `d = min(d1, d2) - h^2*k/4` with `h = max(k - |d1 - d2|, 0)/k`, so it equals `min`
//      *exactly* wherever the two distances differ by k or more. The blend is therefore
//      spatially local by construction — but "local" is only useful if it is also small.
//   2. How much of the map carries a displacement at all. The offset is zero outside the
//      bevel band, so the rim is the only part worth recomputing in the first place.
//
// Pure geometry, no browser. Discs because the answer depends on the fields' relative slope
// near the merge, and two discs are the case where that is easiest to reason about
// independently of this measurement.

const R = 60; // shape radius, px
const BEVEL = 26; // rim band width, matching the story's default
const PAD = 40; // domain margin around the pair
const STEP = 1; // sampling pitch, px

const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

/**
 * One arrangement: two discs `separation` apart, blended at `k`.
 *
 * `rim` counts pixels that carry a displacement — inside the shape and within the bevel of
 * the surface. `blended` counts rim pixels the blend actually moved. `dirtyBox` is the
 * bounding box of those, which is what a partial re-rasterisation would have to cover.
 */
const measure = (separation, k) => {
  const c1 = { x: PAD + R, y: PAD + R };
  const c2 = { x: c1.x + separation, y: c1.y };
  const width = Math.ceil(c2.x + R + PAD);
  const height = Math.ceil(2 * R + 2 * PAD);

  let rim = 0;
  let blended = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let y = 0; y < height; y += STEP) {
    for (let x = 0; x < width; x += STEP) {
      const d1 = Math.hypot(x - c1.x, y - c1.y) - R;
      const d2 = Math.hypot(x - c2.x, y - c2.y) - R;
      const d = smin(d1, d2, k);

      // Only the inward bevel band produces a nonzero offset.
      if (d >= 0 || -d >= BEVEL) continue;
      rim++;

      // The blend touched this pixel iff the two distances are within k of each other.
      if (Math.abs(d1 - d2) >= k) continue;
      blended++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  const groupArea = width * height;
  const boxArea = blended === 0 ? 0 : (maxX - minX + 1) * (maxY - minY + 1);
  return {
    separation,
    k,
    gap: (separation - 2 * R).toFixed(0),
    rimSharePct: ((rim / groupArea) * 100).toFixed(1),
    blendedOfRimPct: rim === 0 ? '0.0' : ((blended / rim) * 100).toFixed(1),
    dirtyBoxSharePct: ((boxArea / groupArea) * 100).toFixed(1),
  };
};

const rows = [];
for (const k of [20, 40]) {
  for (const separation of [2 * R - 20, 2 * R, 2 * R + 15, 2 * R + 30, 2 * R + 50]) {
    rows.push(measure(separation, k));
  }
}

const pad = (s, n) => String(s).padStart(n);
console.log('R=%d  bevel=%d  step=%dpx\n', R, BEVEL, STEP);
console.log('   k   gap   rim%ofgroup   blend%ofrim   dirtybox%ofgroup');
for (const r of rows) {
  console.log(
    `${pad(r.k, 4)} ${pad(r.gap, 5)} ${pad(r.rimSharePct, 13)} ${pad(r.blendedOfRimPct, 13)} ${pad(r.dirtyBoxSharePct, 18)}`
  );
}
console.log('\ngap = centre separation minus 2R: negative overlaps, 0 touches, positive is a gap.');
