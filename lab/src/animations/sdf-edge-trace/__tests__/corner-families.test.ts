/**
 * The corner families, and the two constants the CSS fit rests on.
 *
 * `archive/2026-08-corner-shape-vs-apple` established that a superellipse can sit 0.0031r
 * from Apple's curve with `k = 1.3844` and the radius scaled by 1.2409, against 0.0138r for
 * a plain circular arc. Those numbers decide which shape path `ContinuousCorner` uses, and
 * until now the only thing re-checking them was a story panel read by hand.
 *
 * So they are asserted here instead, and asserted the hard way: the curve under test is
 * generated from the closed-form superellipse rather than from anything in `field.ts`, and
 * measured against `squircleCorners`' own control points. Nothing in the chain is shared
 * with the implementation being judged, so if the exponent, the scale, or Apple's constants
 * drift, this fails rather than agreeing with itself.
 */

import { describe, expect, it } from 'vitest';

import {
  FAMILIES,
  appleOutline,
  deviationFromApple,
  familyById,
  familyShape,
  type FamilyId,
} from '../continuous-corner/corner-families.js';
import { SCENES, VIEW, sceneById, type SceneId } from '../continuous-corner/corner-scenes.js';
import { blob } from '../irregular/irregular-shapes.js';

/** Apple's own extent, from `SPEC.md`. The corner occupies this much of each edge. */
const EXTENT = 1.528665;

/**
 * A rounded box with p-norm corners, as a dense polyline — the independent reimplementation.
 *
 * Uses the superellipse's parametric form, `x = r·cos(θ)^(2/n)`, so it never consults a
 * distance field or a marching-squares walk. `n = 2` collapses to a circular arc.
 */
const pNormOutline = (width: number, height: number, radius: number, n: number, perCorner = 220): number[] => {
  const r = Math.min(radius, width / 2, height / 2);
  const points: number[] = [];
  // Corner centres, and the sign of the direction the corner curves in, clockwise from top left.
  const corners = [
    { cx: r, cy: r, sx: -1, sy: -1 },
    { cx: width - r, cy: r, sx: 1, sy: -1 },
    { cx: width - r, cy: height - r, sx: 1, sy: 1 },
    { cx: r, cy: height - r, sx: -1, sy: 1 },
  ];

  for (const { cx, cy, sx, sy } of corners) {
    for (let step = 0; step <= perCorner; step++) {
      const theta = (step / perCorner) * (Math.PI / 2);
      // Sweep the two axes in opposite senses so consecutive corners join along the edge.
      const along = sx * sy > 0 ? theta : Math.PI / 2 - theta;
      points.push(cx + sx * r * Math.cos(along) ** (2 / n), cy + sy * r * Math.sin(along) ** (2 / n));
    }
  }
  return points;
};

describe('Apple’s reference outline', () => {
  it('reaches EXTENT · r along each edge, below the clamp', () => {
    const width = 400;
    const height = 300;
    const radius = 60; // rho = 0.4 on the short axis, comfortably under 0.654166.
    const outline = appleOutline(width, height, radius);

    // The top edge is flat, so every point on it shares y = 0; the corner ends where it stops.
    let leftmostOnTop = Infinity;
    for (let i = 0; i < outline.length; i += 2) {
      if (Math.abs(outline[i + 1] ?? 0) < 1e-6) leftmostOnTop = Math.min(leftmostOnTop, outline[i] ?? 0);
    }
    expect(leftmostOnTop).toBeCloseTo(EXTENT * radius, 3);
  });

  it('closes, and stays inside its box', () => {
    const outline = appleOutline(320, 200, 48);
    expect(outline.length).toBeGreaterThan(200);
    for (let i = 0; i < outline.length; i += 2) {
      const x = outline[i] ?? 0;
      const y = outline[i + 1] ?? 0;
      expect(x).toBeGreaterThanOrEqual(-1e-6);
      expect(x).toBeLessThanOrEqual(320 + 1e-6);
      expect(y).toBeGreaterThanOrEqual(-1e-6);
      expect(y).toBeLessThanOrEqual(200 + 1e-6);
    }
  });
});

describe('how close each family gets to Apple', () => {
  const width = 400;
  const height = 300;
  const radius = 60;
  const outline = appleOutline(width, height, radius);
  const fractionOfR = (n: number, scale: number) =>
    deviationFromApple(pNormOutline(width, height, radius * scale, n), outline).maxPx / radius;

  it('puts a plain circular arc 0.0138r away', () => {
    expect(fractionOfR(2, 1)).toBeCloseTo(0.0138, 4);
  });

  it('puts the fitted superellipse near 0.003r — four times closer than the arc', () => {
    const family = familyById('apple-fit');
    const fit = fractionOfR(family.exponent(0), family.radiusScale(0));
    // 0.00317 on this box. SPEC quotes 0.0031r, which is a different box and a traced rather
    // than an analytic curve, so the third decimal is as far as the two can be held to agree —
    // the ratio below is the claim that actually decides `mode="css"`.
    expect(fit).toBeCloseTo(0.003, 3);
    expect(fractionOfR(2, 1) / fit).toBeGreaterThan(4);
  });

  it('is worse than the plain arc if the exponent is applied without the radius scale', () => {
    // The two fitted numbers are one decision, not two independent improvements. Shipping the
    // superellipse alone — which is what an unsupported `corner-shape` fallback would do if the
    // scale were baked in rather than gated — measures 0.0826r against the arc's 0.0139r, so it
    // is 5.96× further off than doing nothing. Asserted loosely, since the claim is the sign of
    // the effect rather than its size.
    const family = familyById('apple-fit');
    const unscaled = fractionOfR(family.exponent(0), 1);
    expect(unscaled).toBeGreaterThan(fractionOfR(2, 1) * 5);
  });
});

describe('the family table', () => {
  it('exposes every id exactly once', () => {
    const ids = FAMILIES.map((family) => family.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(familyById(id).id).toBe(id);
  });

  it('throws on an unknown id rather than returning undefined', () => {
    expect(() => familyById('nope' as FamilyId)).toThrow(/no corner family/);
  });

  it('clamps the radius to half the short side, scale included', () => {
    // 90 × 1.2409 is 111.7, which a 300 × 180 box cannot honour: it becomes a pill at 90.
    const shape = familyShape(familyById('apple-fit'), 0, 300, 180, 90);
    expect(shape.r).toBe(90);
    expect(shape.n).toBeCloseTo(2.611, 3);
  });
});

describe('the scenes', () => {
  const input = { family: familyById('apple-fit'), k: 1.3844, radius: 36 };

  it('throws on an unknown id', () => {
    expect(() => sceneById('nope' as SceneId)).toThrow(/no scene/);
  });

  it('centres the measured scene, so the reference outline lines up with it', () => {
    const [only] = sceneById('measured').shapes(input);
    expect(sceneById('measured').shapes(input)).toHaveLength(1);
    expect(only?.shape.x).toBe(VIEW / 2);
    expect(only?.shape.y).toBe(VIEW / 2);
  });

  it('gives the exponent scene a different n per shape — the thing one rect cannot show', () => {
    const shapes = sceneById('exponents').shapes(input);
    const exponents = shapes.map((member) => member.shape.n);
    expect(new Set(exponents).size).toBe(shapes.length);
    // Ignores the selected family, so its own exponents survive.
    expect(exponents).not.toContain(familyById('apple-fit').exponent(1.3844));
    for (const member of shapes) expect(member.label).toMatch(/^n = /);
  });

  it('keeps every shape inside the sampled domain', () => {
    for (const scene of SCENES) {
      for (const { shape } of scene.shapes(input)) {
        const { x, y, hw = 0, hh = 0 } = shape;
        expect(x - hw, scene.id).toBeGreaterThanOrEqual(0);
        expect(y - hh, scene.id).toBeGreaterThanOrEqual(0);
        expect(x + hw, scene.id).toBeLessThanOrEqual(VIEW);
        expect(y + hh, scene.id).toBeLessThanOrEqual(VIEW);
      }
    }
  });

  it('never lets a radius exceed half a shape’s short side, at any slider position', () => {
    for (const radius of [0, 8, 36, 60, 90]) {
      for (const scene of SCENES) {
        for (const { shape } of scene.shapes({ ...input, radius })) {
          const { hw = 0, hh = 0, r = 0 } = shape;
          expect(r, `${scene.id} at r=${radius}`).toBeLessThanOrEqual(Math.min(hw, hh) + 1e-9);
        }
      }
    }
  });
});

/**
 * The blob's flattening, which is the one shape in `irregular-shapes` that claims to be a
 * *curve* rather than a polygon.
 *
 * It used to be a fixed 48-gon and it read as one. The failure was not mainly the 0.47px
 * chord error — it was that the sharpest vertex turned 19.6°, because the wobble concentrates
 * curvature into a few places and an evenly spaced sample is coarsest exactly there. Both are
 * pinned here, since a fixed-count sampler passes the first and fails the second.
 */
describe('the blob is a curve, not a polygon', () => {
  /** The flattening at a given tolerance, as points. */
  const blobAt = (tolerance: number, maxTurn?: number): [number, number][] => {
    const flat = maxTurn === undefined ? blob(62, 1, tolerance) : blob(62, 1, tolerance, maxTurn);
    const out: [number, number][] = [];
    for (let i = 0; i < flat.length; i += 2) out.push([flat[i] ?? 0, flat[i + 1] ?? 0]);
    return out;
  };
  const distanceToPolyline = (p: readonly [number, number], poly: readonly [number, number][]): number => {
    let best = Infinity;
    for (let v = 0, j = poly.length - 1; v < poly.length; j = v++) {
      const a = poly[j] ?? [0, 0];
      const b = poly[v] ?? [0, 0];
      const ex = b[0] - a[0];
      const ey = b[1] - a[1];
      const wx = p[0] - a[0];
      const wy = p[1] - a[1];
      const l2 = ex * ex + ey * ey;
      const t = l2 > 0 ? Math.min(Math.max((wx * ex + wy * ey) / l2, 0), 1) : 0;
      best = Math.min(best, Math.hypot(wx - ex * t, wy - ey * t));
    }
    return best;
  };
  const sharpestTurn = (poly: readonly [number, number][]): number => {
    let worst = 0;
    for (let v = 0; v < poly.length; v++) {
      const a = poly[(v + poly.length - 1) % poly.length] ?? [0, 0];
      const b = poly[v] ?? [0, 0];
      const c = poly[(v + 1) % poly.length] ?? [0, 0];
      const first = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const second = Math.atan2(c[1] - b[1], c[0] - b[0]);
      let delta = Math.abs(second - first);
      if (delta > Math.PI) delta = Math.PI * 2 - delta;
      worst = Math.max(worst, (delta * 180) / Math.PI);
    }
    return worst;
  };

  it('stays within its tolerance of a far finer flattening of the same curve', () => {
    const fine = blobAt(0.0005, 0.5);
    for (const tolerance of [0.05, 0.15, 0.4]) {
      const coarse = blobAt(tolerance, 90);
      let worst = 0;
      for (const point of fine) worst = Math.max(worst, distanceToPolyline(point, coarse));
      // The bound is the tolerance plus the reference's own error, which is what makes this a
      // real check rather than a restatement of the subdivision predicate. `maxTurn` is opened
      // right up so this measures the chord criterion alone.
      expect(worst, `tolerance ${tolerance}`).toBeLessThanOrEqual(tolerance + 0.01);
    }
  });

  it('honours the turn limit at the junctions, not just inside a span', () => {
    // 19.6° was the sharpest vertex on the fixed 48-gon this replaced, and the reason it read as
    // a polygon however small the chord error was.
    //
    // The junction is the hard part and the reason a second pass exists. Subdividing on chord
    // error alone leaves a long chord meeting a short one where two spans stopped at different
    // depths, and neither span's own predicate ever looks at that angle — asking for 3° instead
    // of 10° changed the measured worst turn by nothing at all (7.4° either way).
    for (const limit of [3, 5, 8]) {
      expect(sharpestTurn(blobAt(0.05, limit)), `limit ${limit}`).toBeLessThanOrEqual(limit + 0.05);
    }
    expect(sharpestTurn(blobAt(0.05))).toBeLessThan(19.6 / 3);
  });

  it('never emits a repeated vertex, which would be a zero-length edge', () => {
    // Two neighbouring violations pick the span between them from opposite ends, so the same
    // midpoint arrives twice unless the inserts are deduplicated. A repeated vertex has no
    // direction — `atan2(0, 0)` — and made the turn metric report 137° on a sound curve.
    for (const seed of [1, 2, 3, 4, 7]) {
      for (const size of [30, 62, 150, 400]) {
        const flat = blob(size, seed, 0.05, 3);
        for (let i = 0; i < flat.length; i += 2) {
          const j = (i + 2) % flat.length;
          const step = Math.hypot((flat[j] ?? 0) - (flat[i] ?? 0), (flat[j + 1] ?? 0) - (flat[i + 1] ?? 0));
          expect(step, `seed ${seed} size ${size} vertex ${i / 2}`).toBeGreaterThan(1e-9);
        }
      }
    }
  });

  it('spends its vertices where the curve bends, not evenly', () => {
    // Even spacing is the thing being avoided: if the edges were uniform this would be ~1.
    const poly = blobAt(0.05);
    const lengths = poly.map((point, index) => {
      const next = poly[(index + 1) % poly.length] ?? [0, 0];
      return Math.hypot(next[0] - point[0], next[1] - point[1]);
    });
    expect(Math.max(...lengths) / Math.min(...lengths)).toBeGreaterThan(1.5);
  });

  it('degrades uniformly when the tolerance is unreachable, rather than coarsely in places', () => {
    // A running vertex budget is spent in traversal order, so the first spans refine fully and
    // the last stay single chords: asking for a finer tolerance than the budget allowed produced
    // 96px chords and 67° turns — a worse shape than a coarse tolerance. A depth limit caps every
    // span equally, so the unreachable case lands on "uniformly as fine as allowed".
    for (const [size, seed] of [
      [62, 1],
      [150, 7],
      [400, 2],
    ] as const) {
      const flat = blob(size, seed, 1e-9, 1e-9);
      expect(flat.length / 2, `${size}/${seed}`).toBeLessThanOrEqual(12 * 2 ** 5);
      const poly: [number, number][] = [];
      for (let i = 0; i < flat.length; i += 2) poly.push([flat[i] ?? 0, flat[i + 1] ?? 0]);
      expect(sharpestTurn(poly), `${size}/${seed}`).toBeLessThan(4);
    }
  });
});
