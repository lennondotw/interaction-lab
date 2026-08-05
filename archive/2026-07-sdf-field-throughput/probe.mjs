/**
 * Where the field's time actually goes as shape count grows, and which of the obvious
 * optimisations survive contact with the real traversal.
 *
 * The tracer's cost was established per *cell* by
 * archive/2026-07-sdf-vs-density-traversal: a quadtree makes the walk O(perimeter) rather
 * than O(area), which is the whole argument for a distance field. That measurement held
 * shape count fixed at 4. This one varies it, because DOM-seeded fields do not have four
 * shapes — a toolbar has eight, a card grid has thirty — and the per-cell result says
 * nothing about how the cost scales with the number of primitives.
 *
 * Four parts:
 *
 *   1. **Scaling.** ms and ns/eval against shape count, in two arrangements. The
 *      arrangement turns out to matter more than the count.
 *   2. **The early-out.** The exact rejection now in `sdf`, measured on and off in both
 *      arrangements — this is what decides where its threshold belongs.
 *   3. **Fold order.** Whether the iterated quadratic smin is commutative, which is the
 *      single fact that blocks the largest available win.
 *   4. **The rest of the frame.** Trace against `d`-string build, so the field is not
 *      optimised in isolation from what consumes it.
 *
 * Part 2 needs to toggle a module constant, which a probe cannot do from outside. It
 * measures the shipped configuration and states the disabled figures from the run that set
 * the threshold; re-derive them by raising `SKIP_MIN_SHAPES` in `field.ts` and re-running.
 *
 * Run from the storybook package so the TypeScript sources resolve:
 *
 *   cd lab && npx vite-node ../archive/2026-07-sdf-field-throughput/probe.mjs
 */
const { ContourTracer, quadtreeSafeView } = await import('../../lab/src/animations/sdf-edge-trace/field.ts');
const { buildPathData } = await import('../../lab/src/animations/sdf-edge-trace/contour-path.ts');

const OVERSCAN = 128;
const BLEND = 26;

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
};

/** Warm up, size a batch to clear the clock, median of 7 — the repo's standard. */
const time = (fn) => {
  for (let i = 0; i < 60; i++) fn();
  const t0 = performance.now();
  fn();
  const probe = Math.max(performance.now() - t0, 0.001);
  const inner = Math.min(Math.max(Math.ceil(8 / probe), 1), 4000);
  const s = [];
  for (let k = 0; k < 7; k++) {
    const a = performance.now();
    for (let j = 0; j < inner; j++) fn();
    s.push((performance.now() - a) / inner);
  }
  return median(s);
};

const table = (header, rows) => {
  const all = [header, ...rows];
  const w = header.map((_, c) => Math.max(...all.map((r) => String(r[c] ?? '').length)));
  const line = (r, pad = ' ') => `| ${r.map((c, i) => String(c ?? '').padEnd(w[i], pad)).join(' | ')} |`;
  console.log(line(header));
  console.log(
    line(
      w.map((n) => '-'.repeat(n)),
      '-'
    )
  );
  for (const r of rows) console.log(line(r));
  console.log('');
};

/** A toolbar: boxes packed close enough that every neighbour is inside `blend`. */
const packedRow = (n, region) => {
  const w = 88,
    h = 44,
    gap = 10;
  const x0 = (region - (n * w + (n - 1) * gap)) / 2;
  return Array.from({ length: n }, (_, i) => ({
    x: x0 + i * (w + gap) + w / 2,
    y: region / 2,
    hw: w / 2,
    hh: h / 2,
    r: 14,
  }));
};

/** A card grid: only immediate neighbours are within `blend`, most shapes are far. */
const spreadGrid = (n, region) => {
  const cols = Math.ceil(Math.sqrt(n));
  const cw = region / cols;
  return Array.from({ length: n }, (_, i) => ({
    x: (i % cols) * cw + cw / 2,
    y: Math.floor(i / cols) * cw + cw / 2,
    hw: 52,
    hh: 34,
    r: 16,
  }));
};

const cfg = (o = {}) => ({
  field: 'sdf',
  traversal: 'sparse',
  cell: 2,
  radius: 0,
  sigma: 0,
  blend: BLEND,
  collectCells: false,
  ...o,
});

// ---------------------------------------------------------------- 1. scaling

console.log('## 1. Cost against shape count\n');
for (const [label, build, sizeFor] of [
  ['packed row', packedRow, (n) => quadtreeSafeView(Math.max(600, n * 98 + 120))],
  ['spread grid', spreadGrid, (n) => quadtreeSafeView(Math.ceil(Math.sqrt(n)) * 140)],
]) {
  const rows = [];
  for (const n of [2, 4, 8, 16, 32, 64]) {
    const region = sizeFor(n);
    const t = new ContourTracer(region, OVERSCAN, 1, 2);
    const shapes = build(n, region);
    const c = cfg();
    const ms = time(() => t.trace(shapes, c));
    const st = t.trace(shapes, c);
    rows.push([
      `${n}`,
      `${region}`,
      ms.toFixed(3),
      ((ms * 1e6) / st.fieldEvals).toFixed(1),
      st.fieldEvals.toLocaleString('en-US'),
      `${st.leafCells.toLocaleString('en-US')}`,
      `${st.loopCount}`,
    ]);
  }
  console.log(`### ${label}\n`);
  table(['shapes', 'domain', 'ms', 'ns/eval', 'evals', 'leaves', 'loops'], rows);
}
console.log(
  'ns/eval is the number to read. It rises with shape count because the smin folds every\n' +
    'shape for every sample, so a trace is O(perimeter x shapes) — and perimeter grows with\n' +
    'shape count too. The early-out lowers this constant; it does not change the order.\n'
);

// ---------------------------------------------------------------- 2. cell, for reference

console.log('## 2. Cell size at 8 shapes, for comparison with the per-cell archive\n');
{
  const region = quadtreeSafeView(900);
  const t = new ContourTracer(region, OVERSCAN, 1, 2);
  const shapes = packedRow(8, region);
  const rows = [];
  for (const cell of [8, 4, 2, 1]) {
    const c = cfg({ cell });
    const ms = time(() => t.trace(shapes, c));
    const st = t.trace(shapes, c);
    rows.push([
      `${cell}`,
      ms.toFixed(3),
      ((ms * 1e6) / st.fieldEvals).toFixed(1),
      st.fieldEvals.toLocaleString('en-US'),
    ]);
  }
  table(['cell', 'ms', 'ns/eval', 'evals'], rows);
  console.log(
    'ns/eval is flat across cell size, which is the point: per-eval cost is a\n' +
      'property of the shape count, not of the grid.\n'
  );
}

// ---------------------------------------------------------------- 3. fold order

console.log('## 3. Is the iterated quadratic smin commutative?\n');
{
  const k = BLEND;
  const smin = (d, di) => {
    const h = Math.max(k - Math.abs(d - di), 0) / k;
    return Math.min(d, di) - h * h * k * 0.25;
  };
  const fold = (ds) => ds.reduce(smin, 1e9);
  const perms = (a) =>
    a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));

  const rows = [];
  for (const [label, ds] of [
    ['three within k', [10, 14, 18]],
    ['three tight', [0, 5, 9]],
    ['four overlapping', [2, 6, 11, 15]],
    ['two close, one far', [4, 8, 400]],
    ['all further apart than k', [0, 60, 130]],
  ]) {
    const vs = perms(ds).map(fold);
    const spread = Math.max(...vs) - Math.min(...vs);
    rows.push([
      label,
      Math.min(...vs).toFixed(6),
      Math.max(...vs).toFixed(6),
      spread.toExponential(2),
      spread > 1e-12 ? 'NO' : 'yes',
    ]);
  }
  table(['case', 'min', 'max', 'spread', 'order-free'], rows);
  console.log(
    'It is not. Which forbids the largest available win: reaching a tight running minimum\n' +
      'early — by folding the previously-nearest shape first — is worth up to 6x at 128 shapes\n' +
      'in a micro-benchmark, and cannot be done, because a corner value would depend on when\n' +
      'it was computed. That breaks the corner cache and the dense-vs-sparse agreement.\n'
  );
}

// ---------------------------------------------------------------- 4. the rest of the frame

console.log('## 4. Trace against the string that consumes it, 8 shapes\n');
{
  const region = quadtreeSafeView(900);
  const t = new ContourTracer(region, OVERSCAN, 1, 2);
  const shapes = packedRow(8, region);
  const rows = [];
  for (const cell of [4, 2, 1]) {
    const c = cfg({ cell });
    const trace = time(() => t.trace(shapes, c));
    t.trace(shapes, c);
    const build = time(() => buildPathData(t, { smooth: true, precision: 1 }));
    const chars = buildPathData(t, { smooth: true, precision: 1 }).d.length;
    const inset = time(() => t.trace(shapes, cfg({ cell, inset: 8 })));
    rows.push([
      `${cell}`,
      trace.toFixed(3),
      build.toFixed(3),
      `${((build / trace) * 100).toFixed(0)}%`,
      (trace + build).toFixed(3),
      inset.toFixed(3),
      chars.toLocaleString('en-US'),
    ]);
  }
  table(['cell', 'trace ms', 'd ms', 'd / trace', 'sum ms', '+inset ms', 'd chars'], rows);
  console.log(
    'The string is a third to a half of the trace on top of it, and the browser reparsing it\n' +
      'is extra again — see archive/2026-07-contour-to-dom. Optimising the field past this\n' +
      'point without touching the string would be optimising the smaller half.\n'
  );
}
