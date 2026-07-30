/**
 * How far outside the ball-centre box can the iso surface reach, and what does
 * it cost to sample that far out?
 *
 * `sdf-edge-trace` clamps ball centres to [0, DOMAIN] and samples the same
 * [0, DOMAIN] grid. A ball parked on the edge therefore has half its shape
 * outside the sampled region, marching squares produces an open chain, and the
 * renderer's `closePath()` joins the loose ends with a straight chord along the
 * frame — the artefact this probe exists to size a fix for.
 *
 * Two numbers are needed:
 *
 *  1. REACH — max over interior points x of min_i |x - c_i|. If every centre
 *     lies in box B, the shape lies in B grown by REACH, so REACH is exactly
 *     the overscan the sampled domain needs. Measured by ray casting outward
 *     from every centre; the adversarial cluster cases are also solved in 1D.
 *
 *  2. The cost of a wider domain, per traversal. Only `dense` pays for area;
 *     `bounded` already clips to the balls and `sparse` is perimeter-bound, so
 *     the overscan should be close to free for both.
 *
 *   node archive/2026-07-contour-domain-overscan/probe.mjs
 */

const R = 60;
const SIGMA = 12;
const BAND = 3 * SIGMA;
const INF = R + BAND;
const INF2 = INF * INF;
const DENSITY_ISO = 0.4;
const K = 40;
const CULL_SAFETY = 1.1;

// ---------- fields (verbatim from field.ts) ----------

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

const FIELDS = {
  sdf: { f: sdf, iso: 0, inside: (v) => v < 0 },
  density: { f: density, iso: DENSITY_ISO, inside: (v) => v > DENSITY_ISO },
};

// ---------- 1. reach ----------

function nearestCentre(balls, x, y) {
  let best = Infinity;
  for (const b of balls) {
    const d = Math.hypot(x - b.x, y - b.y);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Max distance from the nearest centre to any interior point, found by casting
 * rays outward from each centre and bisecting the outermost sign change.
 *
 * Rays from centres suffice because the interior is a union of centre-anchored
 * star-shaped lobes: every interior point is reachable from the centre nearest
 * it without leaving the interior, so the outermost crossing on some ray from
 * some centre is at least as far out as the deepest point of the reach.
 */
function measureReach(kind, balls, rays = 720) {
  const { f, inside } = FIELDS[kind];
  const limit = R + 2 * Math.max(K, BAND);
  const step = 0.5;
  let worst = 0;

  for (const b of balls) {
    for (let r = 0; r < rays; r++) {
      const a = (r / rays) * Math.PI * 2;
      const cx = Math.cos(a);
      const cy = Math.sin(a);

      // Walk inward from the outside: the first crossing found is the outermost.
      let t = limit;
      let prev = f(balls, b.x + cx * t, b.y + cy * t);
      for (t = limit - step; t > 0; t -= step) {
        const v = f(balls, b.x + cx * t, b.y + cy * t);
        if (inside(v) && !inside(prev)) {
          // Bisect [t, t + step] for the crossing.
          let lo = t;
          let hi = t + step;
          for (let it = 0; it < 40; it++) {
            const mid = (lo + hi) * 0.5;
            if (inside(f(balls, b.x + cx * mid, b.y + cy * mid))) lo = mid;
            else hi = mid;
          }
          const reach = nearestCentre(balls, b.x + cx * lo, b.y + cy * lo);
          if (reach > worst) worst = reach;
          break;
        }
        prev = v;
      }
    }
  }
  return worst;
}

/** Exact 1D reach for n coincident centres: the radius at which f hits iso. */
function coincidentReach(kind, n) {
  const balls = Array.from({ length: n }, () => ({ x: 0, y: 0 }));
  const { f, inside } = FIELDS[kind];
  let lo = 0;
  let hi = R + 2 * Math.max(K, BAND);
  for (let it = 0; it < 80; it++) {
    const mid = (lo + hi) * 0.5;
    if (inside(f(balls, mid, 0))) lo = mid;
    else hi = mid;
  }
  return lo;
}

// ---------- configurations ----------

let seed = 0x2f6e2b1;
const rand = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  seed >>>= 0;
  return seed / 0x100000000;
};

/** Ring layout, matching the story's own `createBalls` / autoplay motion. */
function ring(n, phase, spread = 110) {
  return Array.from({ length: n }, (_, i) => {
    const a = phase + (i * Math.PI * 2) / n;
    return { x: Math.cos(a) * spread, y: Math.sin(a) * spread };
  });
}

/** All centres within `jitter` of one point — the worst case for smin stacking. */
function cluster(n, jitter) {
  return Array.from({ length: n }, () => ({
    x: (rand() - 0.5) * 2 * jitter,
    y: (rand() - 0.5) * 2 * jitter,
  }));
}

function scattered(n, extent) {
  return Array.from({ length: n }, () => ({
    x: (rand() - 0.5) * 2 * extent,
    y: (rand() - 0.5) * 2 * extent,
  }));
}

// ---------- 2. traversal cost ----------

function traceCost(kind, traversal, domain, cell, balls, origin) {
  const nx = Math.round(domain / cell);
  const { f, iso } = FIELDS[kind];
  let evals = 0;
  const sample = (x, y) => {
    evals++;
    return f(balls, x, y);
  };

  if (traversal === 'sparse') {
    // Quadtree forest: the largest power-of-two tile that divides the domain.
    const tile = nx & -nx;
    const tiles = nx / tile;
    const stack = [];
    for (let tj = 0; tj < tiles; tj++) {
      for (let ti = 0; ti < tiles; ti++) stack.push([ti * tile, tj * tile, tile]);
    }
    let leaves = 0;
    while (stack.length > 0) {
      const [i, j, size] = stack.pop();
      const sizePx = size * cell;
      const d = sample(origin + (i + size * 0.5) * cell, origin + (j + size * 0.5) * cell);
      if (Math.abs(d) > sizePx * Math.SQRT1_2 * CULL_SAFETY) continue;
      if (size === 1) {
        leaves++;
        continue;
      }
      const h = size >> 1;
      stack.push([i, j, h], [i + h, j, h], [i, j + h, h], [i + h, j + h, h]);
    }
    return { evals, leaves };
  }

  let i0 = 0;
  let i1 = nx;
  let j0 = 0;
  let j1 = nx;
  if (traversal === 'bounded') {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const b of balls) {
      minX = Math.min(minX, b.x - INF);
      minY = Math.min(minY, b.y - INF);
      maxX = Math.max(maxX, b.x + INF);
      maxY = Math.max(maxY, b.y + INF);
    }
    i0 = Math.max(0, Math.floor((minX - origin) / cell));
    j0 = Math.max(0, Math.floor((minY - origin) / cell));
    i1 = Math.min(nx, Math.ceil((maxX - origin) / cell));
    j1 = Math.min(nx, Math.ceil((maxY - origin) / cell));
  }
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) sample(origin + i * cell, origin + j * cell);
  }
  return { evals, leaves: Math.max(0, (i1 - i0) * (j1 - j0)) };
}

// ---------- report ----------

const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);

console.log(`config: R=${R} sigma=${SIGMA} band=${BAND} k=${K} iso_density=${DENSITY_ISO}`);
console.log(`bounds under test: sdf R+k=${R + K}   density R+3sigma=${R + BAND}\n`);

console.log('=== 1. coincident centres (exact, worst case for smin stacking) ===');
console.log(`${pad('n', 4)}${num('sdf reach', 12)}${num('density reach', 16)}`);
for (const n of [1, 2, 3, 4, 8, 12, 24, 64]) {
  console.log(
    `${pad(n, 4)}${num(coincidentReach('sdf', n).toFixed(3), 12)}${num(coincidentReach('density', n).toFixed(3), 16)}`
  );
}

console.log('\n=== 2. reach over configurations (ray cast, 720 rays per centre) ===');
console.log(`${pad('layout', 26)}${num('n', 3)}${num('sdf reach', 12)}${num('density reach', 16)}`);

const cases = [];
for (const n of [2, 4, 8, 12]) {
  cases.push([`ring spread=110`, n, ring(n, 0.3)]);
  cases.push([`ring spread=140 (autoplay)`, n, ring(n, 1.1, 140)]);
  cases.push([`cluster jitter=0`, n, cluster(n, 0)]);
  cases.push([`cluster jitter=5`, n, cluster(n, 5)]);
  cases.push([`cluster jitter=20`, n, cluster(n, 20)]);
  cases.push([`cluster jitter=40`, n, cluster(n, 40)]);
  cases.push([`scattered extent=180`, n, scattered(n, 180)]);
}

let maxSdf = 0;
let maxDensity = 0;
let argMaxSdf = '';
let argMaxDensity = '';
for (const [label, n, balls] of cases) {
  const s = measureReach('sdf', balls);
  const d = measureReach('density', balls);
  if (s > maxSdf) {
    maxSdf = s;
    argMaxSdf = `${label} n=${n}`;
  }
  if (d > maxDensity) {
    maxDensity = d;
    argMaxDensity = `${label} n=${n}`;
  }
  console.log(`${pad(label, 26)}${num(n, 3)}${num(s.toFixed(3), 12)}${num(d.toFixed(3), 16)}`);
}

console.log('\n=== 3. random sweep (400 configs, n in 2..12) ===');
for (let t = 0; t < 400; t++) {
  const n = 2 + Math.floor(rand() * 11);
  const style = Math.floor(rand() * 3);
  const balls =
    style === 0
      ? cluster(n, rand() * 60)
      : style === 1
        ? scattered(n, 40 + rand() * 200)
        : ring(n, rand() * 6, 20 + rand() * 180);
  const s = measureReach('sdf', balls, 360);
  const d = measureReach('density', balls, 360);
  if (s > maxSdf) {
    maxSdf = s;
    argMaxSdf = `random style=${style} n=${n}`;
  }
  if (d > maxDensity) {
    maxDensity = d;
    argMaxDensity = `random style=${style} n=${n}`;
  }
}
console.log(
  `sdf     max reach ${maxSdf.toFixed(3)}  (bound R+k=${R + K}, slack ${(R + K - maxSdf).toFixed(3)})  at ${argMaxSdf}`
);
console.log(
  `density max reach ${maxDensity.toFixed(3)}  (bound R+3sigma=${R + BAND}, slack ${(R + BAND - maxDensity).toFixed(3)})  at ${argMaxDensity}`
);

console.log('\n=== 4. cost of a wider domain (4 balls, ring spread=110, centred) ===');
const VIEW = 512;
const variants = [
  ['512 (today, no overscan)', 512, 0],
  ['768 (view 512 + 128 each side)', 768, -128],
  ['1024 (view 512 + 256 each side)', 1024, -256],
];
console.log(`${pad('domain', 34)}${pad('traversal', 11)}${num('cell', 5)}${num('evals', 12)}${num('vs 512', 9)}`);
for (const cell of [4, 1]) {
  for (const traversal of ['dense', 'bounded', 'sparse']) {
    let base = 0;
    for (const [label, domain, origin] of variants) {
      const balls = ring(4, 0.3).map((b) => ({ x: b.x + VIEW / 2, y: b.y + VIEW / 2 }));
      const { evals } = traceCost('sdf', traversal, domain, cell, balls, origin);
      if (base === 0) base = evals;
      console.log(
        `${pad(label, 34)}${pad(traversal, 11)}${num(cell, 5)}${num(evals.toLocaleString('en-US'), 12)}${num(`${(evals / base).toFixed(2)}x`, 9)}`
      );
    }
    console.log('');
  }
}

console.log('=== 5. buffer footprint, minCell=1 ===');
for (const [label, domain] of variants) {
  const corners = (domain + 1) * (domain + 1);
  const maxPoints = Math.min(corners, 1 << 18);
  // cornerVal f32 + cornerGen i32 + edgePoint i32*2 + edgeGen i32*2
  const cornerBytes = corners * 4 * 6;
  // pointXY f32*2 + ordered i32 + nextPoint i32 + seen u8 + segFrom i32*2 + segTo i32*2
  const pointBytes = maxPoints * (8 + 4 + 4 + 1 + 8 + 8);
  console.log(
    `${pad(label, 34)}corners ${num(corners.toLocaleString('en-US'), 11)}  ${num(((cornerBytes + pointBytes) / 1048576).toFixed(1), 6)} MB`
  );
}
