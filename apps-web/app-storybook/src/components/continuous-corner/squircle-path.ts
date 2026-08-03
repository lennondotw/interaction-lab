/**
 * Apple's continuous corner, ported from its own control points.
 *
 * See `SPEC.md` for where every constant comes from and why the degradation rule
 * has the shape it does. The short version: three cubic Béziers per corner, the
 * corner reaches `EXTENT * r` along each edge rather than `r`, and the extent is
 * capped per axis against half that axis's side.
 */

/** How far the corner reaches along each edge, in radii. `1` would be an arc. */
const EXTENT = 1.528665;
/** The two collinear control points on the edge, nearest and next-nearest. */
const OUTER_1 = 1.08849;
const OUTER_2 = 0.868407;
/** Where the outer segments hand over to the middle one. */
const INNER_SHORT = 0.074911;
const INNER_LONG = 0.631494;
/** The middle segment's controls, which are mirrors of each other. */
const MIDDLE_SHORT = 0.16906;
const MIDDLE_LONG = 0.372824;

/** `r / half` past which the extent no longer fits and the curve starts flattening. */
const CROSSOVER = 1 / EXTENT;
/** The outer controls, as a fraction of `half`, once fully saturated at `r = half`. */
const SATURATED_1 = 0.96;
const SATURATED_2 = 0.82;

export interface CornerRadii {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

export type RadiusInput = number | Partial<CornerRadii>;

export interface SquircleGeometry {
  width: number;
  height: number;
  radii: CornerRadii;
}

/** One cubic segment: two controls and an end point, absolute in box coordinates. */
export interface CubicSegment {
  c1: readonly [number, number];
  c2: readonly [number, number];
  to: readonly [number, number];
}

export interface SquircleCorner {
  /** Where the corner's curve begins, on the edge it arrives along. */
  from: readonly [number, number];
  segments: readonly [CubicSegment, CubicSegment, CubicSegment];
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * The one-dimensional rule, applied to a single axis against half of that axis's
 * own side length. Returning the extent alongside the controls keeps the caller
 * from having to know which regime it landed in.
 */
const axisProfile = (radius: number, half: number): { extent: number; outer1: number; outer2: number } => {
  if (half <= 0 || radius <= 0) return { extent: 0, outer1: 0, outer2: 0 };

  const rho = radius / half;
  if (rho <= CROSSOVER) {
    return { extent: EXTENT * radius, outer1: OUTER_1 * radius, outer2: OUTER_2 * radius };
  }

  // Past the crossover the extent is pinned to the edge and only the two outer
  // controls keep moving, which flattens the curve toward the arc without
  // shrinking the radius.
  const t = (rho - CROSSOVER) / (1 - CROSSOVER);
  return {
    extent: half,
    outer1: lerp(OUTER_1 * CROSSOVER, SATURATED_1, t) * half,
    outer2: lerp(OUTER_2 * CROSSOVER, SATURATED_2, t) * half,
  };
};

export const resolveRadii = (radius: RadiusInput): CornerRadii =>
  typeof radius === 'number'
    ? { topLeft: radius, topRight: radius, bottomRight: radius, bottomLeft: radius }
    : {
        topLeft: radius.topLeft ?? 0,
        topRight: radius.topRight ?? 0,
        bottomRight: radius.bottomRight ?? 0,
        bottomLeft: radius.bottomLeft ?? 0,
      };

/**
 * Builds one corner in absolute box coordinates.
 *
 * `vertex` is the box corner itself, `toward` points from it into the box on each
 * axis, and `startOnVerticalEdge` says which of the two edges the traversal
 * arrives along — which decides whether the segments run in order or reversed.
 * Reversing a cubic is just swapping its two controls, so both directions come
 * out of the same three segments.
 */
const buildCorner = ({
  radius,
  halfX,
  halfY,
  vertex,
  toward,
  startOnVerticalEdge,
}: {
  radius: number;
  halfX: number;
  halfY: number;
  vertex: readonly [number, number];
  toward: readonly [number, number];
  startOnVerticalEdge: boolean;
}): SquircleCorner => {
  // A radius past half the short side has no room left, exactly as
  // `RoundedRectangle` treats it, so `cornerRadius: 10000` is not a special case.
  const r = Math.max(0, Math.min(radius, halfX, halfY));
  const x = axisProfile(r, halfX);
  const y = axisProfile(r, halfY);

  const at = (lx: number, ly: number): readonly [number, number] => [
    vertex[0] + toward[0] * lx,
    vertex[1] + toward[1] * ly,
  ];

  // Canonical order: start on the vertical edge, finish on the horizontal one.
  const start = at(0, y.extent);
  const forward: [CubicSegment, CubicSegment, CubicSegment] = [
    {
      c1: at(0, y.outer1),
      c2: at(0, y.outer2),
      to: at(INNER_SHORT * r, INNER_LONG * r),
    },
    {
      c1: at(MIDDLE_SHORT * r, MIDDLE_LONG * r),
      c2: at(MIDDLE_LONG * r, MIDDLE_SHORT * r),
      to: at(INNER_LONG * r, INNER_SHORT * r),
    },
    {
      c1: at(x.outer2, 0),
      c2: at(x.outer1, 0),
      to: at(x.extent, 0),
    },
  ];

  if (startOnVerticalEdge) return { from: start, segments: forward };

  const [first, middle, last] = forward;
  return {
    from: last.to,
    segments: [
      { c1: last.c2, c2: last.c1, to: middle.to },
      { c1: middle.c2, c2: middle.c1, to: first.to },
      { c1: first.c2, c2: first.c1, to: start },
    ],
  };
};

/**
 * The four corners, clockwise from the top-left, each in absolute coordinates.
 *
 * Exposed separately from the `d` string so the golden tests can assert on
 * numbers rather than on string formatting.
 */
export const squircleCorners = ({ width, height, radii }: SquircleGeometry): readonly SquircleCorner[] => {
  const halfX = width / 2;
  const halfY = height / 2;
  const common = { halfX, halfY };

  return [
    buildCorner({
      ...common,
      radius: radii.topLeft,
      vertex: [0, 0],
      toward: [1, 1],
      startOnVerticalEdge: true,
    }),
    buildCorner({
      ...common,
      radius: radii.topRight,
      vertex: [width, 0],
      toward: [-1, 1],
      startOnVerticalEdge: false,
    }),
    buildCorner({
      ...common,
      radius: radii.bottomRight,
      vertex: [width, height],
      toward: [-1, -1],
      startOnVerticalEdge: true,
    }),
    buildCorner({
      ...common,
      radius: radii.bottomLeft,
      vertex: [0, height],
      toward: [1, -1],
      startOnVerticalEdge: false,
    }),
  ];
};

/** Trims float noise without visibly moving anything, to keep the `d` string short. */
const round = (value: number): string => {
  const fixed = value.toFixed(3);
  return fixed.replace(/\.?0+$/, '') || '0';
};

const point = ([x, y]: readonly [number, number]): string => `${round(x)} ${round(y)}`;

/**
 * An SVG path for the box, usable as a `d` attribute or inside CSS
 * `clip-path: path(...)`.
 *
 * Coordinates are absolute pixels rather than a normalised `viewBox`, and they
 * have to be: a squircle corner cannot be scaled non-uniformly without ceasing to
 * be one, so there is no box-independent form of this path to cache.
 */
export const squirclePath = (geometry: SquircleGeometry): string => {
  const corners = squircleCorners(geometry);
  const [topLeft] = corners;
  if (!topLeft) return '';

  // Start where the top-left corner finishes, so the first move lands on the top
  // edge and every later corner is reached by a straight run.
  const parts = [`M${point(topLeft.segments[2].to)}`];

  for (const corner of [corners[1], corners[2], corners[3], corners[0]]) {
    if (!corner) continue;
    parts.push(`L${point(corner.from)}`);
    for (const segment of corner.segments) {
      parts.push(`C${point(segment.c1)} ${point(segment.c2)} ${point(segment.to)}`);
    }
  }

  parts.push('Z');
  return parts.join('');
};
