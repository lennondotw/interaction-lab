/**
 * Compares the two fields a metaball contour can be traced from, and the three
 * ways to walk them, to decide which pair the tracer should ship.
 *
 * The fields answer different questions. `density` reconstructs what
 * `sdf-effect` paints — a sum of blurred discs, thresholded — and says how much
 * ink is at a point; it saturates at 1 and carries no distance information.
 * `sdf` is a quadratic smooth-min of circle distance fields and says how far
 * the nearest edge is.
 *
 * That difference decides the traversal. A quadtree node is wholly inside or
 * wholly outside when |f(centre)| exceeds its half-diagonal, so it can be
 * culled with its whole subtree — which turns the walk from O(area) into
 * O(perimeter). Only a distance field supports that test, and the whole point
 * of the comparison is that SDF is the MORE expensive field per sample, so the
 * question is whether the culling repays it.
 *
 * Domain is 1024x1024 for every row so the numbers are directly comparable,
 * and a power of two so the quadtree subdivides cleanly.
 *
 *   node archive/2026-07-sdf-vs-density-traversal/probe.mjs
 */

const DOM = 1024;
const R = 60;
const SIGMA = 12;
const BAND = 3 * SIGMA;
const INF = R + BAND;
const INF2 = INF * INF;
const DENSITY_THRESH = 0.4;
const K = 40; // smin blend radius, tuned to look like the sigma=12 blur merge

// ---------- fields ----------

/** Sum of blurred discs, saturating at 1. Iso surface at 0.4. */
function density(balls, x, y) {
  let s = 0;
  for (let k = 0; k < balls.length; k++) {
    const dx = x - balls[k].x;
    const dy = y - balls[k].y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= INF2) continue;
    const t = (Math.sqrt(d2) - R) / BAND;
    if (t <= -1) {
      s += 1;
    } else {
      const u = (t + 1) * 0.5;
      s += 1 - u * u * u * (u * (u * 6 - 15) + 10);
    }
    if (s >= 1) return 1;
  }
  return s;
}

/** Quadratic smooth-min of circle SDFs. Iso surface at 0. */
function sdf(balls, x, y) {
  let d = 1e9;
  for (let k = 0; k < balls.length; k++) {
    const dx = x - balls[k].x;
    const dy = y - balls[k].y;
    const di = Math.sqrt(dx * dx + dy * dy) - R;
    const h = Math.max(K - Math.abs(d - di), 0) / K;
    d = Math.min(d, di) - h * h * K * 0.25;
  }
  return d;
}

function makeBalls(n, phase) {
  const balls = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i * Math.PI * 2) / n;
    balls.push({
      x: DOM / 2 + Math.cos(a) * (150 + 50 * Math.sin(phase * 1.7 + i)),
      y: DOM / 2 + Math.sin(a) * (150 + 50 * Math.cos(phase * 1.3 + i)),
    });
  }
  return balls;
}

// ---------- marching squares, shared by every traversal ----------

const MAXP = 1 << 18;
const ptX = new Float32Array(MAXP);
const ptY = new Float32Array(MAXP);
const segFrom = new Int32Array(MAXP);
const segTo = new Int32Array(MAXP);

let ctx = null;
function resetCtx(nx) {
  ctx = { nx, nPts: 0, nSegs: 0, edgeMap: ctx && ctx.nx === nx ? ctx.edgeMap : new Map() };
  ctx.edgeMap.clear();
}

function cellSegments(i, j, x0, y0, cell, v00, v10, v11, v01, iso) {
  let code = 0;
  if (v00 > iso) code |= 1;
  if (v10 > iso) code |= 2;
  if (v11 > iso) code |= 4;
  if (v01 > iso) code |= 8;
  if (code === 0 || code === 15) return;

  const nx = ctx.nx;
  const x1 = x0 + cell;
  const y1 = y0 + cell;
  const em = ctx.edgeMap;

  // One vertex per grid edge, so neighbouring cells share endpoints.
  const pt = (id, ax, ay, bx, by, va, vb) => {
    let p = em.get(id);
    if (p !== undefined) return p;
    const t = (iso - va) / (vb - va);
    p = ctx.nPts++;
    ptX[p] = ax + (bx - ax) * t;
    ptY[p] = ay + (by - ay) * t;
    em.set(id, p);
    return p;
  };
  const T = () => pt(2 * (j * (nx + 1) + i), x0, y0, x1, y0, v00, v10);
  const B = () => pt(2 * ((j + 1) * (nx + 1) + i), x0, y1, x1, y1, v01, v11);
  const L = () => pt(2 * (j * (nx + 1) + i) + 1, x0, y0, x0, y1, v00, v01);
  const Rr = () => pt(2 * (j * (nx + 1) + i + 1) + 1, x1, y0, x1, y1, v10, v11);
  const emit = (a, b) => {
    segFrom[ctx.nSegs] = a;
    segTo[ctx.nSegs] = b;
    ctx.nSegs++;
  };

  // Complementary cases run in OPPOSITE directions so segments chain. Kept as a
  // paired table so the winding is checkable by eye — see the previous probe.
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
    case 5:  emit(L(), T()); emit(Rr(), B()); break;
    case 10: emit(T(), Rr()); emit(B(), L()); break;
  }
}

function linkLoops() {
  const n = ctx.nPts;
  const next = new Int32Array(n).fill(-1);
  for (let s = 0; s < ctx.nSegs; s++) next[segFrom[s]] = segTo[s];
  const seen = new Uint8Array(n);
  let loops = 0;
  let totalPts = 0;
  for (let p = 0; p < n; p++) {
    if (seen[p]) continue;
    let q = p;
    let len = 0;
    while (q !== -1 && !seen[q]) {
      seen[q] = 1;
      len++;
      q = next[q];
    }
    if (len > 2) {
      loops++;
      totalPts += len;
    }
  }
  return { loops, totalPts };
}

// ---------- dense: sample every cell in the domain ----------

let denseTop = new Float32Array(0);
let denseBot = new Float32Array(0);
let denseEvals = 0;

function dense(balls, cell, f, iso) {
  const nx = Math.ceil(DOM / cell);
  const ny = nx;
  if (denseTop.length < nx + 1) {
    denseTop = new Float32Array(nx + 1);
    denseBot = new Float32Array(nx + 1);
  }
  resetCtx(nx);
  denseEvals = 0;

  let top = denseTop;
  let bot = denseBot;
  for (let i = 0; i <= nx; i++) {
    top[i] = f(balls, i * cell, 0);
    denseEvals++;
  }
  for (let j = 0; j < ny; j++) {
    const y1 = (j + 1) * cell;
    for (let i = 0; i <= nx; i++) {
      bot[i] = f(balls, i * cell, y1);
      denseEvals++;
    }
    for (let i = 0; i < nx; i++) {
      cellSegments(i, j, i * cell, j * cell, cell, top[i], top[i + 1], bot[i + 1], bot[i], iso);
    }
    const t = top;
    top = bot;
    bot = t;
  }
  return linkLoops();
}

// ---------- sparse: SDF-guided quadtree ----------

let cornerVal = new Float32Array(0);
let cornerGen = new Int32Array(0);
let genCounter = 0;
let sparseEvals = 0;

function sparse(balls, cell) {
  const nx = Math.ceil(DOM / cell);
  const need = (nx + 1) * (nx + 1);
  if (cornerVal.length < need) {
    cornerVal = new Float32Array(need);
    cornerGen = new Int32Array(need);
  }
  resetCtx(nx);
  // Generation counter instead of clearing: the cache is sized for the finest
  // cell, and zeroing it every frame would cost more than the walk.
  genCounter++;
  sparseEvals = 0;

  const corner = (i, j) => {
    const idx = j * (nx + 1) + i;
    if (cornerGen[idx] === genCounter) return cornerVal[idx];
    const v = sdf(balls, i * cell, j * cell);
    sparseEvals++;
    cornerVal[idx] = v;
    cornerGen[idx] = genCounter;
    return v;
  };

  // Quadratic smin is Lipschitz-bounded but not eikonal — |grad| can exceed 1
  // near a blend, so the exact half-diagonal test can cull a node that does
  // contain the surface. The margin buys that back.
  const SAFETY = 1.1;
  const stack = [[0, 0, nx]]; // i, j, size in cells
  while (stack.length) {
    const [i, j, s] = stack.pop();
    const sizePx = s * cell;
    const d = sdf(balls, (i + s * 0.5) * cell, (j + s * 0.5) * cell);
    sparseEvals++;
    if (Math.abs(d) > sizePx * Math.SQRT1_2 * SAFETY) continue; // wholly in or out
    if (s === 1) {
      cellSegments(
        i,
        j,
        i * cell,
        j * cell,
        cell,
        corner(i, j),
        corner(i + 1, j),
        corner(i + 1, j + 1),
        corner(i, j + 1),
        0
      );
    } else {
      const h = s >> 1;
      stack.push([i, j, h], [i + h, j, h], [i, j + h, h], [i + h, j + h, h]);
    }
  }
  return linkLoops();
}

// ---------- run ----------

function bench(fn, iters) {
  for (let i = 0; i < 100; i++) fn(makeBalls(4, i * 0.01));
  const t0 = process.hrtime.bigint();
  let acc = 0;
  for (let i = 0; i < iters; i++) acc += fn(makeBalls(4, i * 0.01)).totalPts;
  const t1 = process.hrtime.bigint();
  return { ms: Number(t1 - t0) / 1e6 / iters, acc };
}

console.log(`node ${process.version}   domain ${DOM}x${DOM}, 4 balls\n`);

// The two fields describe slightly different shapes — they blend on different
// terms — but within one field every traversal must return the same topology.
// A faster traversal that changes the output is not a faster traversal.
for (const [name, r] of [
  ['density dense  cell=2', dense(makeBalls(4, 0.7), 2, density, DENSITY_THRESH)],
  ['sdf     dense  cell=2', dense(makeBalls(4, 0.7), 2, sdf, 0)],
  ['sdf     sparse cell=2', sparse(makeBalls(4, 0.7), 2)],
  ['sdf     dense  cell=1', dense(makeBalls(4, 0.7), 1, sdf, 0)],
  ['sdf     sparse cell=1', sparse(makeBalls(4, 0.7), 1)],
]) {
  console.log(`  ${name} -> loops=${r.loops} pts=${r.totalPts}`);
}
console.log('');

const rows = [
  ['density  dense   cell=4', (b) => dense(b, 4, density, DENSITY_THRESH), 500],
  ['density  dense   cell=2', (b) => dense(b, 2, density, DENSITY_THRESH), 200],
  ['density  dense   cell=1', (b) => dense(b, 1, density, DENSITY_THRESH), 60],
  ['sdf      dense   cell=4', (b) => dense(b, 4, sdf, 0), 500],
  ['sdf      dense   cell=2', (b) => dense(b, 2, sdf, 0), 200],
  ['sdf      dense   cell=1', (b) => dense(b, 1, sdf, 0), 60],
  ['sdf      SPARSE  cell=4', (b) => sparse(b, 4), 2000],
  ['sdf      SPARSE  cell=2', (b) => sparse(b, 2), 2000],
  ['sdf      SPARSE  cell=1', (b) => sparse(b, 1), 1000],
  ['sdf      SPARSE  cell=0.5', (b) => sparse(b, 0.5), 1000],
];
for (const [label, fn, iters] of rows) {
  const { ms } = bench(fn, iters);
  fn(makeBalls(4, 0.7)); // one more run so the eval counter matches the shape
  const evals = label.includes('SPARSE') ? sparseEvals : denseEvals;
  console.log(`${label.padEnd(26)} ${ms.toFixed(3).padStart(8)} ms   field evals: ${String(evals).padStart(8)}`);
}
