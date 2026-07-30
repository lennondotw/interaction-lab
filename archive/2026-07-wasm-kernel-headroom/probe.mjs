/**
 * Measures how much headroom is left in the `sdf-edge-trace` field kernel, and
 * — the actual question — whether that headroom belongs to the language or to
 * the shape of the loop.
 *
 * The kernel is the quadratic smooth-min over circle distances that
 * `ContourTracer.sdf` evaluates once per sample. It is 84% of the traced time,
 * so it is the only part a Rust/WASM port could meaningfully attack. This probe
 * walks it from the shipped form down to the bare hardware cost, so the gap that
 * a different language could close can be read off directly rather than guessed:
 *
 *   shipped    -> what `field.ts` does today
 *   reciprocal -> multiply by 1/K instead of dividing by K
 *   earlyOut   -> skip balls that provably cannot lower the running minimum,
 *                 which skips their sqrt
 *   twoPass    -> all sqrts first, then fold; breaks the loop-carried
 *                 dependency on `d` so the sqrts can pipeline. Generic in n.
 *   unrolled   -> no loop, constants inlined. Only valid for a fixed ball count.
 *   sqrtOnly   -> n sqrts and nothing else. The floor. No language goes below.
 *
 * Node and Chromium are the same V8, so these ratios carry over to the browser;
 * the absolute numbers track whatever machine runs them. The in-situ frame
 * measurements in the README are browser-only and are NOT reproduced here —
 * they depend on a real display's refresh rate. See README.md for that method.
 *
 *   node archive/2026-07-wasm-kernel-headroom/probe.mjs
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const R = 60; // ball radius, as shipped
const K = 40; // smin blend radius, as shipped
const INV_K = 1 / K;
const QUARTER_K = K * 0.25;
// Traced domain of the shipped demo: a 512px view plus 128px of overscan on every
// side. Only used as the range that sample coordinates sweep, so that the
// branchy variants see the same spread of distances the real traversal does.
const DOMAIN = 768;

function makeBalls(n) {
  const flat = new Float32Array(n * 2);
  const objs = [];
  for (let i = 0; i < n; i++) {
    const x = DOMAIN / 2 + Math.cos(i * 1.7) * 120;
    const y = DOMAIN / 2 + Math.sin(i * 1.3) * 120;
    flat[i * 2] = x;
    flat[i * 2 + 1] = y;
    objs.push({ x, y });
  }
  return { flat, objs };
}

// ---------------------------------------------------------------- variants

/** Exactly `ContourTracer.sdf`: for..of over objects, division by K. */
function makeShipped({ objs }) {
  return (x, y) => {
    let d = 1e9;
    for (const b of objs) {
      const dx = x - b.x;
      const dy = y - b.y;
      const di = Math.sqrt(dx * dx + dy * dy) - R;
      const h = Math.max(K - Math.abs(d - di), 0) / K;
      d = Math.min(d, di) - h * h * K * 0.25;
    }
    return d;
  };
}

/** Only change: reciprocal multiply instead of divide. */
function makeReciprocal({ objs }) {
  return (x, y) => {
    let d = 1e9;
    for (const b of objs) {
      const dx = x - b.x;
      const dy = y - b.y;
      const di = Math.sqrt(dx * dx + dy * dy) - R;
      const h = Math.max(K - Math.abs(d - di), 0) * INV_K;
      d = Math.min(d, di) - h * h * QUARTER_K;
    }
    return d;
  };
}

/**
 * Ball i cannot affect the result once `di >= d + K`, because then the blend
 * weight `h` is exactly 0 and smin degenerates to `min(d, di) = d`. Squaring,
 * that is `d2 >= (d + R + K)^2` — testable before the sqrt, so the sqrt is
 * skipped outright. Exact, not an approximation: no tolerance is involved.
 */
function makeEarlyOut({ flat }, n) {
  return (x, y) => {
    let d = 1e9;
    for (let i = 0; i < n; i++) {
      const dx = x - flat[i * 2];
      const dy = y - flat[i * 2 + 1];
      const d2 = dx * dx + dy * dy;
      const reach = d + R + K;
      if (reach > 0 && d2 >= reach * reach) continue;
      const di = Math.sqrt(d2) - R;
      const h = Math.max(K - Math.abs(d - di), 0) * INV_K;
      d = Math.min(d, di) - h * h * QUARTER_K;
    }
    return d;
  };
}

/**
 * `d` is loop-carried, so in the shipped form each iteration's smin waits on the
 * previous one. The sqrts do not depend on `d` at all, so hoisting them into
 * their own pass lets the CPU overlap them, leaving a fold over cheap arithmetic.
 */
function makeTwoPass({ flat }, n) {
  const scratch = new Float64Array(n);
  return (x, y) => {
    for (let i = 0; i < n; i++) {
      const dx = x - flat[i * 2];
      const dy = y - flat[i * 2 + 1];
      scratch[i] = Math.sqrt(dx * dx + dy * dy) - R;
    }
    let d = scratch[0];
    for (let i = 1; i < n; i++) {
      const di = scratch[i];
      const h = Math.max(K - Math.abs(d - di), 0) * INV_K;
      d = Math.min(d, di) - h * h * QUARTER_K;
    }
    return d;
  };
}

/** Fixed at 4 balls: no loop, no indexing, constants inlined. */
function makeUnrolled4({ objs }) {
  const [b0, b1, b2, b3] = objs;
  const x0 = b0.x;
  const y0 = b0.y;
  const x1 = b1.x;
  const y1 = b1.y;
  const x2 = b2.x;
  const y2 = b2.y;
  const x3 = b3.x;
  const y3 = b3.y;
  const smin = (a, b) => {
    const h = Math.max(K - Math.abs(a - b), 0) * INV_K;
    return Math.min(a, b) - h * h * QUARTER_K;
  };
  return (x, y) => {
    let dx = x - x0;
    let dy = y - y0;
    let d = Math.sqrt(dx * dx + dy * dy) - R;
    dx = x - x1;
    dy = y - y1;
    d = smin(d, Math.sqrt(dx * dx + dy * dy) - R);
    dx = x - x2;
    dy = y - y2;
    d = smin(d, Math.sqrt(dx * dx + dy * dy) - R);
    dx = x - x3;
    dy = y - y3;
    d = smin(d, Math.sqrt(dx * dx + dy * dy) - R);
    return d;
  };
}

/** n sqrts, summed. Not the same function — this is the hardware floor only. */
function makeSqrtOnly({ flat }, n) {
  return (x, y) => {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const dx = x - flat[i * 2];
      const dy = y - flat[i * 2 + 1];
      s += Math.sqrt(dx * dx + dy * dy);
    }
    return s;
  };
}

// ---------------------------------------------------------------- harness

const WARMUP = 400_000;
const ITERS = 2_000_000;
const BATCHES = 7;

/** Every variant, so a child process can be told which single one to measure. */
const VARIANTS = {
  shipped: (balls) => makeShipped(balls),
  reciprocal: (balls) => makeReciprocal(balls),
  earlyOut: (balls, n) => makeEarlyOut(balls, n),
  twoPass: (balls, n) => makeTwoPass(balls, n),
  unrolled: (balls) => makeUnrolled4(balls),
  sqrtOnly: (balls, n) => makeSqrtOnly(balls, n),
};

/**
 * Measures ONE variant, and is the whole reason this file re-executes itself.
 *
 * Timing every variant in a single process ranks them wrongly. `bench(fn)` puts
 * all of them through one `fn(...)` call site; after a dozen distinct closures
 * that site goes megamorphic, V8 stops inlining, and what gets measured is
 * dispatch plus whatever IC state the previous variant left behind. That is how
 * an earlier draft of this probe had `reciprocal` beating `shipped` by 2.7x on a
 * change that does nothing, and 8 balls costing less than 4.
 *
 * One process per measurement gives each variant a pristine V8 and a
 * monomorphic call site. Sample coordinates are inlined at the call rather than
 * returned from a helper, because a helper returning `[x, y]` allocates once per
 * iteration and that allocation outweighs the kernel.
 */
function measureOne(variant, n) {
  const balls = makeBalls(n);
  const fn = VARIANTS[variant](balls, n);
  const runs = [];
  for (let batch = 0; batch < BATCHES; batch++) {
    let sink = 0;
    for (let i = 0; i < WARMUP; i++) sink += fn(i % DOMAIN, (i * 7) % DOMAIN);
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < ITERS; i++) sink += fn(i % DOMAIN, (i * 7) % DOMAIN);
    const t1 = process.hrtime.bigint();
    if (!Number.isFinite(sink)) throw new Error('benchmark produced a non-finite sink');
    runs.push(Number(t1 - t0) / ITERS); // ns per evaluation
  }
  runs.sort((a, b) => a - b);
  return runs[(BATCHES - 1) >> 1];
}

if (process.argv[2] === '--measure') {
  const variant = process.argv[3];
  const n = Number(process.argv[4]);
  process.stdout.write(String(measureOne(variant, n)));
  process.exit(0);
}

/** Runs `--measure` in a fresh process and returns ns/eval. */
function bench(variant, n) {
  const out = execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--measure', variant, String(n)], {
    encoding: 'utf8',
  });
  return Number(out);
}

/**
 * Every variant that claims to compute the same field must actually compute it.
 * A faster kernel that returns a different distance is not a faster kernel.
 */
function agrees(reference, candidate) {
  let worst = 0;
  for (let i = 0; i < 200_000; i++) {
    const x = (i * 13) % DOMAIN;
    const y = (i * 91) % DOMAIN;
    const diff = Math.abs(reference(x, y) - candidate(x, y));
    if (diff > worst) worst = diff;
  }
  return worst;
}

console.log(`node ${process.version}   R=${R} K=${K} domain=${DOMAIN}\n`);

const BALL_COUNTS = [4, 8, 12];

// Correctness before timing, same discipline as the other two probes.
console.log('agreement with the shipped kernel (max |diff| over 200k points):');
for (const n of BALL_COUNTS) {
  const balls = makeBalls(n);
  const ref = makeShipped(balls);
  const checks = [
    ['reciprocal', makeReciprocal(balls)],
    ['earlyOut', makeEarlyOut(balls, n)],
    ['twoPass', makeTwoPass(balls, n)],
  ];
  if (n === 4) checks.push(['unrolled', makeUnrolled4(balls)]);
  const parts = checks.map(([label, fn]) => `${label} ${agrees(ref, fn).toExponential(1)}`);
  console.log(`  ${String(n).padStart(2)} balls: ${parts.join('   ')}`);
}
console.log('  (reciprocal/twoPass/unrolled differ only by float reassociation;');
console.log('   earlyOut is exact — its skip test is an equality, not a tolerance)\n');

const measured = new Map();
for (const n of BALL_COUNTS) {
  const names = ['shipped', 'reciprocal', 'earlyOut', 'twoPass'];
  if (n === 4) names.push('unrolled');
  names.push('sqrtOnly');

  console.log(`${n} balls`);
  let baseline = 0;
  for (const name of names) {
    const ns = bench(name, n);
    measured.set(`${name}/${n}`, ns);
    if (name === 'shipped') baseline = ns;
    const label = name === 'sqrtOnly' ? 'sqrtOnly (floor)' : name;
    console.log(
      `  ${label.padEnd(18)} ${ns.toFixed(2).padStart(7)} ns/eval   ${(baseline / ns).toFixed(2)}x vs shipped`
    );
  }
  console.log('');
}

// What the numbers mean for the configuration the demo actually ships. The eval
// count comes from the demo's own benchmark panel; see README.md.
const SHIPPED_EVALS = 6929; // sdf / quadtree / cell=2 / 4 balls
{
  const ms = (key) => ((measured.get(key) * SHIPPED_EVALS) / 1e6).toFixed(3);
  console.log(`at the shipped config (${SHIPPED_EVALS} evals, sdf/quadtree/cell=2, 4 balls):`);
  console.log(`  field evaluation as shipped      ${ms('shipped/4')} ms`);
  console.log(`  best scalar JS measured here     ${ms('earlyOut/4')} ms`);
  console.log(`  sqrt-only floor                  ${ms('sqrtOnly/4')} ms   <- no language goes below this`);
}
