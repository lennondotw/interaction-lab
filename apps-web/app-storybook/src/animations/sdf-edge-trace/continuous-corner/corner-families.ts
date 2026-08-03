/**
 * The three corner families the field is asked to trace, and how to measure it against
 * the one it cannot express.
 *
 * They are genuinely three different curves, not three settings of one:
 *
 * - **circular arc** — `border-radius`. Occupies exactly `r` of each edge.
 * - **CSS `corner-shape: superellipse(k)`** — `|x|ⁿ + |y|ⁿ = rⁿ` with `n = 2ᵏ`, confined
 *   to the `r × r` corner box, so it can only bulge inward. The field expresses this
 *   family *exactly*, because the p-norm level set in the corner box **is** this curve.
 * - **Apple's continuous corner** — three cubic Béziers per corner reaching `1.528665r`
 *   along each edge. Not a superellipse and no exponent reproduces it; it buys curvature
 *   continuity by spending edge length rather than by cutting inward. The field cannot
 *   express it, only approximate it.
 *
 * See `components/continuous-corner/SPEC.md`, plus
 * archive/2026-07-corner-shape-superellipse and archive/2026-08-corner-shape-vs-apple.
 */

import { CSS_SHAPE_K, CSS_SHAPE_RADIUS_SCALE } from '#src/components/continuous-corner/shape-css.js';
import { squircleCorners, type CornerRadii } from '#src/components/continuous-corner/squircle-path.js';
import type { FieldShape } from '../field.js';

export type FamilyId = 'round' | 'superellipse' | 'apple-fit';

export interface Family {
  id: FamilyId;
  label: string;
  /** `n` for the p-norm corner, or a function of the caller's `k`. */
  exponent: (k: number) => number;
  /** Radius multiplier the family needs to sit where it should. */
  radiusScale: (k: number) => number;
  note: string;
}

export const FAMILIES: readonly Family[] = [
  {
    id: 'round',
    label: 'round',
    exponent: () => 2,
    radiusScale: () => 1,
    note: 'A circular arc — the n = 2 member. Exact, and what every earlier story traced.',
  },
  {
    id: 'superellipse',
    label: 'superellipse(k)',
    exponent: (k) => 2 ** k,
    radiusScale: () => 1,
    note:
      'CSS corner-shape, exactly — the p-norm level set in the r × r corner box is this curve. ' +
      'The deviation is measured against Apple with the radius left alone, so it bottoms out at ' +
      'k = 1, a plain arc: measured 0.014r there against 0.080r at k = 1.3844. The fitted k without ' +
      'the radius scale is six times worse than not trying, which is why the next family scales too.',
  },
  {
    id: 'apple-fit',
    label: 'apple (fitted)',
    exponent: () => 2 ** CSS_SHAPE_K,
    radiusScale: () => CSS_SHAPE_RADIUS_SCALE,
    note: `The best superellipse fit to Apple's curve: k = ${CSS_SHAPE_K}, radius × ${CSS_SHAPE_RADIUS_SCALE}. An approximation, and only below the clamp.`,
  },
];

export const familyById = (id: FamilyId): Family => {
  const found = FAMILIES.find((family) => family.id === id);
  if (found === undefined) throw new Error(`no corner family "${id}"`);
  return found;
};

/** One shape for the field, centred in a `width × height` box at the origin. */
export const familyShape = (family: Family, k: number, width: number, height: number, radius: number): FieldShape => {
  const scaled = radius * family.radiusScale(k);
  return {
    x: width / 2,
    y: height / 2,
    hw: width / 2,
    hh: height / 2,
    r: Math.min(scaled, width / 2, height / 2),
    n: family.exponent(k),
  };
};

const evenRadii = (radius: number): CornerRadii => ({
  topLeft: radius,
  topRight: radius,
  bottomRight: radius,
  bottomLeft: radius,
});

/**
 * Apple's exact outline as a dense polyline, in box coordinates.
 *
 * Flattened from the component's own `squircleCorners` rather than by parsing its `d`
 * string, so this measures against the geometry that ships instead of against a second
 * reading of it. De Casteljau at a fixed subdivision: the segments are short and gently
 * curved, so uniform sampling is well inside the tolerance this is used to judge.
 */
export const appleOutline = (width: number, height: number, radius: number, perSegment = 24): number[] => {
  const corners = squircleCorners({ width, height, radii: evenRadii(radius) });
  const points: number[] = [];

  for (const corner of corners) {
    let [px, py] = corner.from;
    points.push(px, py);
    for (const segment of corner.segments) {
      const [x1, y1] = segment.c1;
      const [x2, y2] = segment.c2;
      const [x3, y3] = segment.to;
      for (let step = 1; step <= perSegment; step++) {
        const t = step / perSegment;
        const u = 1 - t;
        points.push(
          u * u * u * px + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * py + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3
        );
      }
      px = x3;
      py = y3;
    }
  }
  return points;
};

/** Squared distance from a point to a segment. */
const segmentDistance2 = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.min(Math.max(((px - ax) * vx + (py - ay) * vy) / len2, 0), 1);
  const dx = px - (ax + vx * t);
  const dy = py - (ay + vy * t);
  return dx * dx + dy * dy;
};

export interface Deviation {
  maxPx: number;
  meanPx: number;
  samples: number;
}

/**
 * How far the traced contour sits from Apple's outline, in px.
 *
 * One-sided on purpose — every traced vertex is measured to the nearest point on Apple's
 * polyline, not the reverse. The traced curve is the thing under test and it is sampled
 * densely enough by marching squares that the two-sided Hausdorff distance would only add
 * the polyline's own sampling error. `archive/2026-08-corner-shape-vs-apple` fits with the
 * symmetric distance because *there* both sides were closed form.
 */
export const deviationFromApple = (vertices: readonly number[], outline: readonly number[]): Deviation => {
  let worst = 0;
  let total = 0;
  let count = 0;
  const segments = outline.length / 2;

  for (let v = 0; v < vertices.length; v += 2) {
    const px = vertices[v] ?? 0;
    const py = vertices[v + 1] ?? 0;
    let best = Infinity;
    for (let s = 0; s < segments; s++) {
      const ax = outline[s * 2] ?? 0;
      const ay = outline[s * 2 + 1] ?? 0;
      const next = (s + 1) % segments;
      const d2 = segmentDistance2(px, py, ax, ay, outline[next * 2] ?? 0, outline[next * 2 + 1] ?? 0);
      if (d2 < best) best = d2;
    }
    const d = Math.sqrt(best);
    if (d > worst) worst = d;
    total += d;
    count++;
  }

  return { maxPx: worst, meanPx: count > 0 ? total / count : 0, samples: count };
};
