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
import { CELL_LEAF, ContourTracer, QUADTREE_TILE, TraceConfig, Traversal, quadtreeSafeView } from '../field.js';

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

/**
 * The inset level is the one thing here a density field cannot do, and the claim
 * that makes it worth having is that it is nearly free: the curve `inset` px
 * inside the surface is the iso level `-inset`, and every sample already taken
 * answers for it. These pin both halves — that it costs nothing, and that it is
 * actually in the right place.
 */
describe('an inset contour', () => {
  const makeInsetTracer = (): ContourTracer => new ContourTracer(VIEW, OVERSCAN, MIN_CELL, 2);

  /**
   * Quadratic smin over circle SDFs, written out again rather than reaching into
   * the tracer's private copy. An independent implementation is the point: it
   * fails if the two ever disagree, which reusing the subject could not.
   */
  const sdfAt = (balls: readonly Point[], x: number, y: number): number => {
    let d = 1e9;
    for (const ball of balls) {
      const di = Math.hypot(x - ball.x, y - ball.y) - RADIUS;
      const h = Math.max(BLEND - Math.abs(d - di), 0) / BLEND;
      d = Math.min(d, di) - h * h * BLEND * 0.25;
    }
    return d;
  };

  const levelPoints = (tracer: ContourTracer, level: number): Point[] =>
    tracer.loops.flatMap((loop, index) => (loop.level === level ? loopPoints(tracer, index) : []));

  const RING = [
    { x: 190, y: 230 },
    { x: 320, y: 250 },
    { x: 250, y: 350 },
  ];

  const withAndWithout = (
    tracer: ContourTracer,
    traversal: Traversal,
    cell: number
  ): { plain: number; inset: number; ratio: number } => {
    const plain = tracer.trace(RING, config({ traversal, cell })).fieldEvals;
    const stats = tracer.trace(RING, config({ traversal, cell, inset: 14 }));
    expect(stats.levelsTraced).toBe(2);
    // Whatever it costs, it did produce a second contour for the money.
    expect(tracer.loops.some((loop) => loop.level === 1)).toBe(true);
    return { plain, inset: stats.fieldEvals, ratio: stats.fieldEvals / plain };
  };

  it('is exactly free on a grid walk, which re-reads samples it already has', () => {
    const tracer = makeInsetTracer();
    for (const traversal of ['dense', 'bounded'] as const) {
      for (const cell of CELLS) {
        const { plain, inset } = withAndWithout(tracer, traversal, cell);
        // Equal, not merely close. A fixed grid visits the same cells either way,
        // and the second level reads corner values the row buffers already hold.
        expect(inset).toBe(plain);
      }
    }
  });

  it('costs a quadtree roughly a second perimeter, because that is what it walks', () => {
    // The sample sharing is real but it is not the whole cost: `sparse` has to
    // *find* its contours, and its cost is proportional to the length of what it
    // finds. Two contours is two perimeters. Under 2x because both levels share
    // ancestor nodes until the tree is fine enough to separate them; climbing
    // toward 2x as the cell shrinks because that shared prefix is a fixed number
    // of levels while the leaf count keeps doubling.
    const tracer = makeInsetTracer();
    const coarse = withAndWithout(tracer, 'sparse', 4);
    const fine = withAndWithout(tracer, 'sparse', 1);

    expect(coarse.ratio).toBeGreaterThan(1.4);
    expect(fine.ratio).toBeLessThan(2);
    expect(fine.ratio).toBeGreaterThan(coarse.ratio);

    // The headline the quadtree exists for survives the second level intact:
    // still an order of magnitude under the dense walk it replaces.
    const dense = tracer.trace(RING, config({ traversal: 'dense', cell: 1, inset: 14 })).fieldEvals;
    expect(fine.inset).toBeLessThan(dense / 20);
  });

  it('lands the promised distance inside the surface', () => {
    const tracer = makeInsetTracer();
    const inset = 16;
    tracer.trace(RING, config({ cell: 1, inset }));

    const surface = levelPoints(tracer, 0);
    const inner = levelPoints(tracer, 1);
    expect(surface.length).toBeGreaterThan(0);
    expect(inner.length).toBeGreaterThan(0);

    // Marching squares interpolates linearly across a cell, so a vertex sits on
    // the true iso to within the curvature error over one cell — not exactly on it.
    for (const point of surface) expect(Math.abs(sdfAt(RING, point.x, point.y))).toBeLessThan(0.6);
    for (const point of inner) expect(Math.abs(sdfAt(RING, point.x, point.y) + inset)).toBeLessThan(0.6);
  });

  it('closes every loop at both levels', () => {
    const tracer = makeInsetTracer();
    for (const cell of CELLS) {
      tracer.trace(RING, config({ cell, inset: 14 }));
      expect(tracer.loops.some((loop) => loop.level === 1)).toBe(true);
      for (let index = 0; index < tracer.loops.length; index++) {
        expect(longestStep(loopPoints(tracer, index))).toBeLessThanOrEqual(cell * Math.SQRT2 + 1e-6);
      }
    }
  });

  it('agrees between dense and sparse at both levels', () => {
    // The cull predicate had to grow: a node is only discardable when it clears
    // *every* iso, not just iso 0. Get that wrong and the inner contour comes
    // back with holes precisely where the outer surface is far away — which the
    // level-1 signature below is what catches.
    const signature = (tracer: ContourTracer, traversal: Traversal, cell: number): string => {
      tracer.trace(RING, config({ traversal, cell, inset: 18 }));
      return tracer.loops
        .map((loop) => `${loop.level}:${loop.count}`)
        .sort()
        .join(',');
    };

    const tracer = makeInsetTracer();
    for (const cell of CELLS) {
      const dense = signature(tracer, 'dense', cell);
      expect(dense).toContain('1:');
      expect(signature(tracer, 'sparse', cell)).toBe(dense);
      expect(signature(tracer, 'bounded', cell)).toBe(dense);
    }
  });

  it('pinches a narrow neck in two, which a clipped stroke cannot', () => {
    // The reason an iso offset is not interchangeable with a stroke of width
    // `2 * inset` clipped to the shape. Two balls bridged by a thin blend neck:
    // the surface is one loop, and far enough in there is nothing left of the
    // bridge, so the inner contour is two.
    const tracer = makeInsetTracer();
    const bridged = [
      { x: 200, y: 256 },
      { x: 330, y: 256 },
    ];

    const shallow = tracer.trace(bridged, config({ cell: 1, inset: 4 }));
    expect(shallow.loopCount).toBe(2);

    const deep = tracer.trace(bridged, config({ cell: 1, inset: 26 }));
    const levels = tracer.loops.filter((loop) => loop.level === 1).length;
    expect(tracer.loops.filter((loop) => loop.level === 0)).toHaveLength(1);
    expect(levels).toBe(2);
    expect(deep.levelsTraced).toBe(2);
  });

  it('is refused by a density field, which has no distance to offset along', () => {
    const tracer = makeInsetTracer();
    tracer.trace(RING, config({ field: 'density', cell: 2, inset: 14 }));
    expect(tracer.insetSupported).toBe(false);

    const stats = tracer.trace(RING, config({ field: 'density', cell: 2, inset: 14 }));
    expect(stats.levelsTraced).toBe(1);
    expect(tracer.loops.every((loop) => loop.level === 0)).toBe(true);
  });

  it('is refused by a tracer that was not built for two levels', () => {
    // The edge cache holds one vertex per (edge, iso), so a second level is a
    // second allocation. Asking a one-level tracer for it is ignored rather than
    // silently writing over level 0's vertices.
    const tracer = makeTracer();
    expect(tracer.levels).toBe(1);
    const stats = tracer.trace(RING, config({ cell: 2, inset: 14 }));
    expect(stats.levelsTraced).toBe(1);
    expect(tracer.insetSupported).toBe(false);
  });
});

/**
 * The rounded box is what lets a laid-out DOM rect seed the field. Two things have
 * to hold for that to be worth anything: the primitive has to be the exact distance
 * it claims to be, and a disc has to keep behaving exactly as it did before the
 * generalisation — the whole argument for one code path is that `hw = hh = r`
 * collapses to a circle, and if it collapses only approximately then every archived
 * number moved.
 */
describe('the rounded-box primitive', () => {
  /** Exact rounded-box distance, written out independently of the tracer's copy. */
  const sdBox = (px: number, py: number, cx: number, cy: number, hw: number, hh: number, r: number): number => {
    const qx = Math.abs(px - cx) - hw + r;
    const qy = Math.abs(py - cy) - hh + r;
    return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
  };

  it('collapses to a circle when the half-extents equal the radius', () => {
    // The identity the single code path rests on. Checked as arithmetic before any
    // contour is traced, because a contour test would only catch a gross violation.
    for (const r of [1, 12, 60, 200]) {
      for (const px of [-13, 0, 7, 61, 340]) {
        for (const py of [-90, 0, 41, 205]) {
          expect(sdBox(px, py, 0, 0, r, r, r)).toBeCloseTo(Math.hypot(px, py) - r, 10);
        }
      }
    }
  });

  it('traces a disc identically whether it is described as a ball or as a box', () => {
    const tracer = makeTracer();
    const asBall = tracer.trace([{ x: 200, y: 260 }], config({ cell: 1 }));
    const ballShape = `${asBall.loopCount}/${asBall.pointCount}`;

    const asBox = tracer.trace([{ x: 200, y: 260, hw: RADIUS, hh: RADIUS, r: RADIUS }], config({ cell: 1 }));
    expect(`${asBox.loopCount}/${asBox.pointCount}`).toBe(ballShape);
    expect(asBox.fieldEvals).toBe(asBall.fieldEvals);
  });

  it('puts every traced vertex on the iso of an independent box field', () => {
    const tracer = makeTracer();
    const boxes = [
      { x: 180, y: 200, hw: 90, hh: 40, r: 16 },
      { x: 330, y: 300, hw: 30, hh: 70, r: 30 },
    ];
    tracer.trace(boxes, config({ cell: 1 }));

    // smin of the two, reimplemented here — the tracer must agree with an outside
    // reading of the same field, not merely with itself.
    const field = (x: number, y: number): number => {
      let d = 1e9;
      for (const b of boxes) {
        const di = sdBox(x, y, b.x, b.y, b.hw, b.hh, b.r);
        const h = Math.max(BLEND - Math.abs(d - di), 0) / BLEND;
        d = Math.min(d, di) - (h * h * BLEND) / 4;
      }
      return d;
    };

    const points = allPoints(tracer);
    expect(points.length).toBeGreaterThan(100);
    for (const point of points) expect(Math.abs(field(point.x, point.y))).toBeLessThan(0.6);
  });

  it('clamps a corner radius larger than the box can hold', () => {
    // An unclamped r makes the distance formula describe a shape bulging outside its
    // own extent, which then escapes the bounds `bounded` and `sparse` derive and
    // gets silently clipped. The clamp is what keeps every traversal agreeing.
    const tracer = makeTracer();
    const absurd = [{ x: 256, y: 256, hw: 40, hh: 20, r: 500 }];
    const dense = tracer.trace(absurd, config({ traversal: 'dense', cell: 1 }));
    const sparse = tracer.trace(absurd, config({ traversal: 'sparse', cell: 1 }));
    expect(sparse.loopCount).toBe(dense.loopCount);
    expect(sparse.pointCount).toBe(dense.pointCount);
    expect(dense.loopCount).toBe(1);
  });

  it('agrees across traversals for boxes, as it does for balls', () => {
    const tracer = makeTracer();
    const boxes = [
      { x: 140, y: 180, hw: 70, hh: 26, r: 12 },
      { x: 300, y: 240, hw: 24, hh: 80, r: 24 },
      { x: 380, y: 380, hw: 50, hh: 50, r: 4 },
    ];
    for (const cell of CELLS) {
      const dense = tracer.trace(boxes, config({ traversal: 'dense', cell }));
      const reference = `${dense.loopCount}/${dense.pointCount}`;
      for (const traversal of ['bounded', 'sparse'] as const) {
        const stats = tracer.trace(boxes, config({ traversal, cell }));
        expect(`${stats.loopCount}/${stats.pointCount}`).toBe(reference);
      }
    }
  });

  it('closes every loop for boxes sitting on the frame', () => {
    const tracer = makeTracer();
    const onFrame = [
      { x: 0, y: VIEW / 2, hw: 60, hh: 30, r: 10 },
      { x: VIEW, y: VIEW, hw: 40, hh: 40, r: 40 },
    ];
    for (const cell of CELLS) {
      tracer.trace(onFrame, config({ cell }));
      expect(tracer.loops.length).toBeGreaterThan(0);
      for (let index = 0; index < tracer.loops.length; index++) {
        expect(longestStep(loopPoints(tracer, index))).toBeLessThanOrEqual(cell * Math.SQRT2 + 1e-6);
      }
    }
  });
});

/**
 * The trap that makes a domain derived from a measured element size quietly stop
 * being a quadtree. `traverseSparse` roots at `nx & -nx`, so an odd `nx` roots at 1,
 * every root is a leaf, and the walk becomes a flat scan plus a wasted probe per
 * cell — worse than `dense`, with nothing raised.
 */
describe('quadtreeSafeView', () => {
  it('pads a region size to a domain that still subdivides', () => {
    for (const region of [1, 200, 500, 640, 734, 863, 990, 1024, 1500]) {
      const view = quadtreeSafeView(region);
      expect(view).toBeGreaterThanOrEqual(region);
      expect(view % QUADTREE_TILE).toBe(0);

      const tracer = new ContourTracer(view, QUADTREE_TILE / 2, MIN_CELL);
      for (const cell of [8, 4, 2, 1]) {
        // 256 divides by every supported cell, so the coarsest still roots at 32.
        expect(tracer.quadtreeTileFor(cell)).toBeGreaterThanOrEqual(32);
      }
    }
  });

  it('demonstrates the degeneration it exists to prevent', () => {
    // Proof the check above can see the bug: fit the domain to the region instead of
    // padding it, and the roots collapse to single cells.
    const fitted = new ContourTracer(734, 128, MIN_CELL);
    expect(fitted.traced).toBe(990);
    expect(fitted.quadtreeTileFor(2)).toBe(1);

    const padded = new ContourTracer(quadtreeSafeView(734), 128, MIN_CELL);
    expect(padded.quadtreeTileFor(2)).toBe(512);
  });

  it('leaves the shipped domain alone', () => {
    // 512 + 2*128 = 768 was already healthy; the helper must not move it.
    expect(quadtreeSafeView(VIEW)).toBe(VIEW);
    expect(makeTracer().quadtreeTileFor(2)).toBe(128);
  });
});

describe('the superellipse corner exponent', () => {
  /** p-norm rounded box, written out independently of the tracer's copy. */
  const sdSuper = (
    px: number,
    py: number,
    cx: number,
    cy: number,
    hw: number,
    hh: number,
    r: number,
    n: number
  ): number => {
    const qx = Math.abs(px - cx) - hw + r;
    const qy = Math.abs(py - cy) - hh + r;
    const ox = Math.max(qx, 0);
    const oy = Math.max(qy, 0);
    return Math.min(Math.max(qx, qy), 0) + (ox ** n + oy ** n) ** (1 / n) - r;
  };

  const BOX = { x: 256, y: 256, hw: 120, hh: 80, r: 40 };

  it('is bit-identical to a circular corner at n = 2', () => {
    // The generalisation must not perturb the shape every archived figure was taken on.
    const tracer = makeTracer();
    const plain = tracer.trace([BOX], config({ cell: 1 }));
    const signature = `${plain.loopCount}/${plain.pointCount}/${plain.fieldEvals}`;
    const explicit = tracer.trace([{ ...BOX, n: 2 }], config({ cell: 1 }));
    expect(`${explicit.loopCount}/${explicit.pointCount}/${explicit.fieldEvals}`).toBe(signature);
  });

  it('leaves the straight edges exactly where they were at every exponent', () => {
    // Off the corners one component of q is negative and every norm agrees on one axis, so
    // an exponent that moved an edge would mean the corner term is leaking.
    for (const n of [1, 1.5, 2, 2.611, 4, 8]) {
      expect(sdSuper(BOX.x, BOX.y - BOX.hh, BOX.x, BOX.y, BOX.hw, BOX.hh, BOX.r, n)).toBeCloseTo(0, 10);
      expect(sdSuper(BOX.x + BOX.hw, BOX.y, BOX.x, BOX.y, BOX.hw, BOX.hh, BOX.r, n)).toBeCloseTo(0, 10);
    }
  });

  it('puts every traced vertex on the iso of an independent p-norm field', () => {
    const tracer = makeTracer();
    for (const n of [1.5, 2.611, 4]) {
      const shape = { ...BOX, n };
      tracer.trace([shape], config({ cell: 1 }));
      const points = allPoints(tracer);
      expect(points.length).toBeGreaterThan(100);
      for (const point of points) {
        expect(Math.abs(sdSuper(point.x, point.y, shape.x, shape.y, shape.hw, shape.hh, shape.r, n))).toBeLessThan(0.6);
      }
    }
  });

  it('agrees across traversals for every exponent, including below 2', () => {
    // The one that catches a cull that is too aggressive: `sparse` dropping a node the
    // surface passes through shows up as fewer loops or vertices than `dense`.
    const tracer = makeTracer();
    for (const n of [1, 1.2, 1.5, 2, 2.611, 4, 8]) {
      for (const cell of CELLS) {
        const shapes = [{ ...BOX, n }];
        const dense = tracer.trace(shapes, config({ traversal: 'dense', cell }));
        const reference = `${dense.loopCount}/${dense.pointCount}`;
        for (const traversal of ['bounded', 'sparse'] as const) {
          const stats = tracer.trace(shapes, config({ traversal, cell }));
          expect(`${stats.loopCount}/${stats.pointCount}`, `n=${n} cell=${cell} ${traversal}`).toBe(reference);
        }
      }
    }
  });

  it('pushes the corner out toward square as the exponent rises', () => {
    // The property that makes the family useful, and a check that `n` is not merely
    // accepted and ignored: the apex on the corner diagonal moves monotonically outward.
    const apexDepth = (n: number): number => {
      const vx = BOX.x + BOX.hw;
      const vy = BOX.y + BOX.hh;
      let lo = 0;
      let hi = BOX.r * 2;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        const t = mid / Math.SQRT2;
        if (sdSuper(vx - t, vy - t, BOX.x, BOX.y, BOX.hw, BOX.hh, BOX.r, n) < 0) hi = mid;
        else lo = mid;
      }
      return (lo + hi) / 2;
    };

    const depths = [1, 1.5, 2, 2.611, 4, 8].map(apexDepth);
    for (let i = 1; i < depths.length; i++) {
      expect(depths[i] ?? 0).toBeLessThan(depths[i - 1] ?? 0);
    }
    // n = 2 is the circular arc, whose apex sits `r * (sqrt(2) - 1)` from the vertex.
    expect(depths[2] ?? 0).toBeCloseTo(BOX.r * (Math.SQRT2 - 1), 2);
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
