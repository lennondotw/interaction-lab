/**
 * Measures what it costs to extract a real contour from the metaball shape in
 * `sdf-effect`, to decide whether real-time tracing needs a Web Worker or a
 * native implementation.
 *
 * The component paints its shape with an SVG filter — a Gaussian blur plus an
 * `feColorMatrix` alpha threshold — so there is no geometry to read back. But
 * blur is linear, and while the discs stay disjoint the blurred union is just
 * the sum of the blurred discs, which is exactly the regime where they bridge.
 * So the field is reconstructible analytically, and this probe reconstructs it:
 * a sum of blurred-disc profiles, marching squares at the same iso value, then
 * segments linked into closed loops.
 *
 * Mirrors the shipped setup: 600x600, R=60, sigma=12, iso 0.4 (the alpha row
 * `0 0 0 20 -8` thresholds at 8/20).
 *
 *   node archive/2026-07-metaball-contour-cost/probe.mjs
 */

const W = 600;
const H = 600;
const R = 60;
const SIGMA = 12;
const BAND = 3 * SIGMA; // half-width of the transition band
const INF = R + BAND; // beyond this a ball contributes ~0
const INF2 = INF * INF;
const THRESH = 0.4;

/**
 * A blurred disc's alpha profile is 0.5*erfc((d-R)/(sigma*sqrt2)). Smootherstep
 * over the +/-3 sigma band is within a percent of it and costs no exp().
 */
function ballAlpha(d) {
  const t = (d - R) / BAND; // -1 .. 1 across the band
  if (t <= -1) return 1;
  if (t >= 1) return 0;
  const u = (t + 1) * 0.5;
  return 1 - u * u * u * (u * (u * 6 - 15) + 10);
}

function makeBalls(n, phase) {
  const balls = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i * Math.PI * 2) / n;
    balls.push({
      x: 300 + Math.cos(a) * (120 + 40 * Math.sin(phase * 1.7 + i)),
      y: 300 + Math.sin(a) * (120 + 40 * Math.cos(phase * 1.3 + i)),
    });
  }
  return balls;
}

// ---- preallocated scratch: allocation would dominate at these timescales ----
let rowA = new Float32Array(0);
let rowB = new Float32Array(0);
const segFrom = new Int32Array(1 << 16);
const segTo = new Int32Array(1 << 16);
const ptX = new Float32Array(1 << 16);
const ptY = new Float32Array(1 << 16);
const edgeToPt = new Map();

function field(balls, x, y) {
  let s = 0;
  for (let k = 0; k < balls.length; k++) {
    const dx = x - balls[k].x;
    const dy = y - balls[k].y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= INF2) continue;
    s += ballAlpha(Math.sqrt(d2));
    if (s >= 1) return 1; // saturated: no later ball can change the sign test
  }
  return s;
}

function contour(balls, cell) {
  const nx = Math.ceil(W / cell);
  const ny = Math.ceil(H / cell);
  if (rowA.length < nx + 1) {
    rowA = new Float32Array(nx + 1);
    rowB = new Float32Array(nx + 1);
  }
  edgeToPt.clear();
  let nPts = 0;
  let nSegs = 0;

  // Two rolling rows: every interior sample is shared by the cell above and
  // below it, so a full grid would double the field evaluations.
  let top = rowA;
  let bot = rowB;
  for (let i = 0; i <= nx; i++) top[i] = field(balls, i * cell, 0);

  for (let j = 0; j < ny; j++) {
    const y0 = j * cell;
    const y1 = y0 + cell;
    for (let i = 0; i <= nx; i++) bot[i] = field(balls, i * cell, y1);

    for (let i = 0; i < nx; i++) {
      const v00 = top[i];
      const v10 = top[i + 1];
      const v11 = bot[i + 1];
      const v01 = bot[i];
      let code = 0;
      if (v00 > THRESH) code |= 1;
      if (v10 > THRESH) code |= 2;
      if (v11 > THRESH) code |= 4;
      if (v01 > THRESH) code |= 8;
      if (code === 0 || code === 15) continue;

      const x0 = i * cell;
      const x1 = x0 + cell;

      // One vertex per grid edge, keyed by edge id, so adjacent cells reuse it
      // and the linking step gets a graph rather than a soup of segments.
      const idT = 2 * (j * (nx + 1) + i);
      const idB = 2 * ((j + 1) * (nx + 1) + i);
      const idL = 2 * (j * (nx + 1) + i) + 1;
      const idR = 2 * (j * (nx + 1) + i + 1) + 1;

      const pt = (id, ax, ay, bx, by, va, vb) => {
        let p = edgeToPt.get(id);
        if (p !== undefined) return p;
        const t = (THRESH - va) / (vb - va);
        p = nPts++;
        ptX[p] = ax + (bx - ax) * t;
        ptY[p] = ay + (by - ay) * t;
        edgeToPt.set(id, p);
        return p;
      };

      const T = () => pt(idT, x0, y0, x1, y0, v00, v10);
      const B = () => pt(idB, x0, y1, x1, y1, v01, v11);
      const L = () => pt(idL, x0, y0, x0, y1, v00, v01);
      const Rr = () => pt(idR, x1, y0, x1, y1, v10, v11);

      const emit = (a, b) => {
        segFrom[nSegs] = a;
        segTo[nSegs] = b;
        nSegs++;
      };

      // Complementary cases must run in OPPOSITE directions. Otherwise the
      // segments do not chain head-to-tail and the linking step below reports
      // a dozen fragments where the shape has four loops.
      //
      // Kept as a table, one case per line, and paired with its complement:
      // that adjacency is how you check the winding by eye. Exploded across
      // three lines each it stops being verifiable.
      // prettier-ignore
      switch (code) {
        case 1:  emit(L(), T()); break;
        case 14: emit(T(), L()); break;
        case 2:  emit(T(), Rr()); break;
        case 13: emit(Rr(), T()); break;
        case 3:  emit(L(), Rr()); break;
        case 12: emit(Rr(), L()); break;
        case 4:  emit(Rr(), B()); break;
        case 11: emit(B(), Rr()); break;
        case 6:  emit(T(), B()); break;
        case 9:  emit(B(), T()); break;
        case 7:  emit(L(), B()); break;
        case 8:  emit(B(), L()); break;
        // Saddles: two separate crossings in one cell.
        case 5:  emit(L(), T()); emit(Rr(), B()); break;
        case 10: emit(T(), Rr()); emit(B(), L()); break;
      }
    }
    const tmp = top;
    top = bot;
    bot = tmp;
  }

  // Walk the successor graph to recover closed loops.
  const next = new Int32Array(nPts).fill(-1);
  for (let s = 0; s < nSegs; s++) next[segFrom[s]] = segTo[s];
  const seen = new Uint8Array(nPts);
  const loops = [];
  let totalPts = 0;
  for (let p = 0; p < nPts; p++) {
    if (seen[p]) continue;
    let q = p;
    let len = 0;
    while (q !== -1 && !seen[q]) {
      seen[q] = 1;
      len++;
      q = next[q];
    }
    if (len > 2) {
      loops.push(len);
      totalPts += len;
    }
  }
  return { loops: loops.length, totalPts, nPts, nSegs };
}

function bench(label, nBalls, cell, iters) {
  for (let i = 0; i < 200; i++) contour(makeBalls(nBalls, i * 0.01), cell);
  const t0 = process.hrtime.bigint();
  let acc = 0;
  for (let i = 0; i < iters; i++) {
    // Balls move every iteration: a static shape would let the branch
    // predictor and the saturation early-out look better than they are.
    acc += contour(makeBalls(nBalls, i * 0.01), cell).totalPts;
  }
  const t1 = process.hrtime.bigint();
  const ms = Number(t1 - t0) / 1e6 / iters;
  const sample = contour(makeBalls(nBalls, 0.7), cell);
  console.log(
    `${label.padEnd(34)} ${ms.toFixed(3).padStart(8)} ms/frame   ` +
      `loops=${sample.loops} pts=${sample.totalPts} (acc ${acc})`
  );
}

console.log(`node ${process.version}\n`);

// Topology has to be right before any timing means anything: a traversal that
// drops half the contour is trivially fast.
{
  const one = [{ x: 300, y: 300 }];
  console.log(`1 ball   -> loops=${contour(one, 2).loops} (expect 1)`);

  const far = [
    { x: 150, y: 300 },
    { x: 450, y: 300 },
  ];
  console.log(`2 far    -> loops=${contour(far, 2).loops} (expect 2)`);

  const near = [
    { x: 270, y: 300 },
    { x: 330, y: 300 },
  ];
  console.log(`2 merged -> loops=${contour(near, 2).loops} (expect 1)`);

  const four = [
    { x: 200, y: 200 },
    { x: 400, y: 200 },
    { x: 400, y: 400 },
    { x: 200, y: 400 },
  ];
  console.log(`4 apart  -> loops=${contour(four, 2).loops} (expect 4)`);

  // The iso surface sits outside the geometric radius, because the threshold
  // is below 0.5. Worth knowing before comparing against the SVG output.
  let lo = 0;
  let hi = 200;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (field(one, 300 + mid, 300) > THRESH) lo = mid;
    else hi = mid;
  }
  console.log(`lone-ball rendered radius = ${lo.toFixed(2)}px (geometric R = ${R})\n`);
}

bench('4 balls, cell=8px', 4, 8, 2000);
bench('4 balls, cell=4px', 4, 4, 2000);
bench('4 balls, cell=2px', 4, 2, 1000);
bench('4 balls, cell=1px (full 600x600)', 4, 1, 300);
console.log('');
bench('16 balls, cell=4px', 16, 4, 1000);
bench('64 balls, cell=4px', 64, 4, 300);
bench('64 balls, cell=2px', 64, 2, 200);
