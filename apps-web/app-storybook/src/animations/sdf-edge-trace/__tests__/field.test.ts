/**
 * The tracer's load-bearing invariant is that every chain it returns is a
 * *cycle*. The renderer calls `closePath()` on all of them, so an open chain
 * does not render as an open curve — it renders as a straight chord joining the
 * two loose ends, plus a fill bounded by that chord. That is what a contour
 * running off the sampled grid used to look like: a hard vertical line down the
 * frame with the shape's interior spilling across it.
 *
 * Sampling an overscan margin around the view is what keeps that from happening,
 * so these tests park balls exactly on the frame — the configuration that used
 * to break — and check closure geometrically. `overscanTooSmall` at the end
 * proves the check can actually see the bug it exists for.
 */

import { describe, expect, it } from 'vitest';
import { CELL_LEAF, ContourTracer, TraceConfig, Traversal } from '../field.js';

const VIEW = 512;
const OVERSCAN = 128;
const MIN_CELL = 1;
const RADIUS = 60;
const SIGMA = 12;
const BLEND = 40;

/** The furthest the surface can sit from the nearest centre, for either field. */
const REACH = RADIUS + Math.max(BLEND, SIGMA * 3);

const config = (overrides: Partial<TraceConfig> = {}): TraceConfig => ({
  field: 'sdf',
  traversal: 'sparse',
  cell: 2,
  radius: RADIUS,
  sigma: SIGMA,
  blend: BLEND,
  collectCells: false,
  ...overrides,
});

const makeTracer = (overscan = OVERSCAN): ContourTracer => new ContourTracer(VIEW, overscan, MIN_CELL);

interface Point {
  x: number;
  y: number;
}

function loopPoints(tracer: ContourTracer, loopIndex: number): Point[] {
  const loop = tracer.loops[loopIndex];
  if (loop === undefined) throw new Error(`expected a loop at index ${loopIndex}`);
  return Array.from({ length: loop.count }, (_, k) => {
    const index = tracer.ordered[loop.start + k] ?? 0;
    return { x: tracer.pointXY[index * 2] ?? 0, y: tracer.pointXY[index * 2 + 1] ?? 0 };
  });
}

function allPoints(tracer: ContourTracer): Point[] {
  return tracer.loops.flatMap((_, index) => loopPoints(tracer, index));
}

/**
 * Largest gap between consecutive vertices of a loop, including the wrap from
 * last back to first. Marching squares puts consecutive vertices on two edges of
 * one cell, so a closed loop can never exceed the cell diagonal; an open chain
 * closed by `closePath()` exceeds it by however far apart its ends drifted.
 */
function longestStep(points: readonly Point[]): number {
  let worst = 0;
  for (let k = 0; k < points.length; k++) {
    const a = points[k];
    const b = points[(k + 1) % points.length];
    if (a === undefined || b === undefined) continue;
    worst = Math.max(worst, Math.hypot(b.x - a.x, b.y - a.y));
  }
  return worst;
}

/** Ball placements that put shape outside the view on one or more sides. */
const EDGE_CASES: readonly { label: string; balls: Point[] }[] = [
  { label: 'single ball in the top-left corner', balls: [{ x: 0, y: 0 }] },
  { label: 'single ball in the bottom-right corner', balls: [{ x: VIEW, y: VIEW }] },
  {
    label: 'one ball per corner',
    balls: [
      { x: 0, y: 0 },
      { x: VIEW, y: 0 },
      { x: 0, y: VIEW },
      { x: VIEW, y: VIEW },
    ],
  },
  {
    label: 'two balls merging across the right edge',
    balls: [
      { x: VIEW, y: 240 },
      { x: VIEW, y: 300 },
    ],
  },
  {
    label: 'a ball on each edge midpoint',
    balls: [
      { x: VIEW / 2, y: 0 },
      { x: VIEW / 2, y: VIEW },
      { x: 0, y: VIEW / 2 },
      { x: VIEW, y: VIEW / 2 },
    ],
  },
  {
    label: '12 coincident balls in a corner (worst-case smin reach)',
    balls: Array.from({ length: 12 }, () => ({ x: VIEW, y: VIEW })),
  },
  {
    label: '12 balls strung along the bottom edge',
    balls: Array.from({ length: 12 }, (_, index) => ({ x: (index / 11) * VIEW, y: VIEW })),
  },
];

const FIELDS = ['sdf', 'density'] as const;
const CELLS = [8, 2, 1] as const;

describe('every contour closes on itself', () => {
  for (const { label, balls } of EDGE_CASES) {
    for (const field of FIELDS) {
      it(`${field}: ${label}`, () => {
        const tracer = makeTracer();
        for (const cell of CELLS) {
          tracer.trace(balls, config({ field, cell }));
          expect(tracer.loops.length).toBeGreaterThan(0);
          for (let index = 0; index < tracer.loops.length; index++) {
            const points = loopPoints(tracer, index);
            expect(longestStep(points)).toBeLessThanOrEqual(cell * Math.SQRT2 + 1e-6);
          }
        }
      });
    }
  }
});

describe('the overscan margin covers the shape', () => {
  it('keeps every vertex strictly inside the sampled grid', () => {
    const tracer = makeTracer();
    const low = tracer.origin;
    const high = tracer.origin + tracer.traced;

    for (const { balls } of EDGE_CASES) {
      for (const field of FIELDS) {
        tracer.trace(balls, config({ field, cell: 2 }));
        for (const point of allPoints(tracer)) {
          expect(point.x).toBeGreaterThan(low);
          expect(point.x).toBeLessThan(high);
          expect(point.y).toBeGreaterThan(low);
          expect(point.y).toBeLessThan(high);
        }
      }
    }
  });

  it('is wider than the furthest the surface can reach from a centre', () => {
    // Not a tautology: it is the reason the previous test can pass. Centres are
    // clamped to the view, so `view + 2 * REACH` is the widest the shape gets.
    expect(makeTracer().overscan).toBeGreaterThan(REACH);
    expect(makeTracer().traced).toBe(VIEW + 2 * OVERSCAN);
  });

  it('leaves the caller coordinate space alone', () => {
    // The view still starts at 0, so nothing downstream has to know the grid
    // extends behind it.
    const tracer = makeTracer();
    expect(tracer.view).toBe(VIEW);
    expect(tracer.origin).toBe(-OVERSCAN);
  });
});

describe('overscanTooSmall', () => {
  it('does produce chopped-off contours, which is what the margin buys back', () => {
    // A view-sized grid is what the story used to trace on. A ball on the frame
    // then has half its contour off the grid, and the chain comes back open.
    const tracer = makeTracer(0);
    tracer.trace([{ x: VIEW, y: VIEW / 2 }], config({ cell: 2 }));

    const gaps = tracer.loops.map((_, index) => longestStep(loopPoints(tracer, index)));
    expect(Math.max(...gaps)).toBeGreaterThan(2 * Math.SQRT2);
  });
});

describe('traversals agree with balls on the frame', () => {
  const shape = (tracer: ContourTracer, traversal: Traversal, cell: number, balls: readonly Point[]): string => {
    const stats = tracer.trace(balls, config({ traversal, cell }));
    return `${stats.loopCount}/${stats.pointCount}`;
  };

  for (const { label, balls } of EDGE_CASES) {
    it(label, () => {
      const tracer = makeTracer();
      for (const cell of CELLS) {
        const dense = shape(tracer, 'dense', cell, balls);
        expect(shape(tracer, 'bounded', cell, balls)).toBe(dense);
        expect(shape(tracer, 'sparse', cell, balls)).toBe(dense);
      }
    });
  }
});

describe('quadtree forest', () => {
  it('tiles a sampled domain that is not itself a power of two', () => {
    // 768 = 3 x 256. If the roots did not tile it, the walk would miss whole
    // strips of the grid and the vertex count would not match a dense scan —
    // which the agreement tests above would catch. This pins the cause down.
    const tracer = makeTracer();
    expect(tracer.traced % 256).toBe(0);
    expect(Math.log2(256) % 1).toBe(0);

    const balls = [
      { x: 60, y: 60 },
      { x: VIEW - 60, y: VIEW - 60 },
    ];
    const sparse = tracer.trace(balls, config({ traversal: 'sparse', cell: 1 }));
    const dense = tracer.trace(balls, config({ traversal: 'dense', cell: 1 }));
    expect(sparse.loopCount).toBe(dense.loopCount);
    expect(sparse.pointCount).toBe(dense.pointCount);
    // The whole point of the forest: it still culls almost everything.
    expect(sparse.fieldEvals).toBeLessThan(dense.fieldEvals / 20);
  });
});

describe('overlay rects', () => {
  it('records the bounded box at its real aspect, not as a square', () => {
    const tracer = makeTracer();
    const balls = [
      { x: 100, y: 250 },
      { x: 400, y: 262 },
    ];
    tracer.trace(balls, config({ traversal: 'bounded', cell: 2, collectCells: true }));

    expect(tracer.cellRectCount).toBe(1);
    const [x, y, width, height, kind] = Array.from(tracer.cellRects.subarray(0, 5));
    expect(kind).toBe(CELL_LEAF);
    // Wide and short: 300px of ball span horizontally, 12px vertically.
    expect(width).toBeGreaterThan((height ?? 0) * 2);
    expect(x).toBeLessThanOrEqual(100 - REACH);
    expect(y).toBeLessThanOrEqual(250 - REACH);
    expect((x ?? 0) + (width ?? 0)).toBeGreaterThanOrEqual(400 + REACH);
    expect((y ?? 0) + (height ?? 0)).toBeGreaterThanOrEqual(262 + REACH);
  });
});
