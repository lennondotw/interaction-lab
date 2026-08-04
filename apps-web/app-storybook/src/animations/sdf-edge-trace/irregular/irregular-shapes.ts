/**
 * Shapes that are not rounded boxes: triangles, stars, irregular polygons, and curved blobs.
 *
 * All five kinds are the *same* primitive — `FieldShape.points`, a polygon with an outward
 * offset `r`. That is the interesting part and the reason they share a file: a star is a
 * polygon whose vertices alternate radius, a blob is a smooth curve flattened until the
 * flattening stops showing, and a triangle is the smallest polygon there is. Only the vertex
 * list differs.
 *
 * Note that an outward offset is *not* what makes the blob smooth, though it is the natural
 * guess: offsetting fillets each corner and leaves every straight run at its original length,
 * so a coarse polygon offset by `r` is a coarse polygon with rounded corners. See `blob`.
 *
 * Every generator is pure in its seed. The irregular ones need randomness to be irregular,
 * but `Math.random()` in a render is both a React Compiler purity violation and unreproducible
 * — a shape nobody can point at twice is no good for a lab — so the seed comes in from a
 * control and the same seed always gives the same menagerie.
 */

/**
 * mulberry32, chosen for being eight lines rather than for its statistics. Nothing here needs
 * more than "spread out and repeatable".
 */
const rng = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Interleaved `x, y` around the origin, which is what `FieldShape.points` wants. */
const ring = (count: number, radiusAt: (index: number, angle: number) => number, phase = -Math.PI / 2): number[] => {
  const points: number[] = [];
  for (let index = 0; index < count; index++) {
    const angle = (index / count) * Math.PI * 2 + phase;
    const radius = radiusAt(index, angle);
    points.push(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  return points;
};

export const triangle = (size: number): number[] => ring(3, () => size);

export const regular = (sides: number, size: number): number[] => ring(sides, () => size);

/** A star: `spikes * 2` vertices alternating between the two radii. Concave at every notch. */
export const star = (spikes: number, outer: number, inner: number): number[] =>
  ring(spikes * 2, (index) => (index % 2 === 0 ? outer : inner));

/**
 * An irregular polygon — the vertices sit at even angles but at randomised radii, so it is
 * lopsided without self-intersecting. `spread` is how far the radius may wander, as a
 * fraction: at 0.55 the long spokes are three times the short ones and the result reads as
 * genuinely arbitrary rather than as a wobbled circle.
 */
export const irregular = (count: number, size: number, seed: number, spread = 0.55): number[] => {
  const next = rng(seed);
  return ring(count, () => size * (1 - spread + next() * spread * 2 * 0.75));
};

/** The blob's polar radius as a multiplier of `size`: two sinusoids of seeded phase. */
const blobWobble = (seed: number): ((angle: number) => number) => {
  const next = rng(seed);
  const firstPhase = next() * Math.PI * 2;
  const secondPhase = next() * Math.PI * 2;
  const secondFrequency = 2 + Math.floor(next() * 3);
  const firstAmount = 0.16 + next() * 0.12;
  const secondAmount = 0.07 + next() * 0.08;
  return (angle) =>
    1 + Math.sin(angle * 2 + firstPhase) * firstAmount + Math.sin(angle * secondFrequency + secondPhase) * secondAmount;
};

/** Perpendicular distance from a point to the chord `a`–`b`. */
const chordError = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const ex = bx - ax;
  const ey = by - ay;
  const length = Math.hypot(ex, ey);
  if (length === 0) return Math.hypot(px - ax, py - ay);
  return Math.abs((px - ax) * ey - (py - ay) * ex) / length;
};

/** Spans the subdivision starts from, before any refinement. */
const BLOB_SPANS = 12;
/**
 * Subdivisions allowed per span, which is what bounds the vertex count: at most
 * `BLOB_SPANS · 2^BLOB_MAX_DEPTH` = 384. The field's pool is 1024 across *all* shapes and it
 * refuses a polygon it cannot hold in full, so a blob has to stay well inside that alone — and
 * a sample costs the total vertex count, so this is a cost ceiling as much as a memory one.
 *
 * A depth limit rather than a running vertex budget, and that is not a detail. A budget is
 * spent in traversal order, so the first spans refine fully and the last ones stay single
 * chords — asking for a *finer* tolerance than the budget allows produced 96px chords and 67°
 * turns, a worse shape than a coarse tolerance. A depth limit degrades every span equally, so
 * an unreachable tolerance lands on "uniformly as fine as allowed" instead.
 */
const BLOB_MAX_DEPTH = 5;
/**
 * Largest turn allowed between consecutive segments, in degrees.
 *
 * The second criterion, and the one that matters to a consumer reading the field's *gradient*
 * rather than its outline. Inside a polygon the nearest boundary point is on one facet for the
 * whole width of that facet, so the normal is constant across it and then jumps by the turn
 * angle — which a refraction or displacement map draws as flat bands with visible seams. Chord
 * error cannot catch that: a long chord across a gently curving run stays well inside a 0.05px
 * tolerance and is still one flat band. So spans are also split until they turn slowly.
 */
const BLOB_MAX_TURN = 5;

/**
 * A closed smooth curve, flattened to a polyline fine enough that the flattening does not show.
 *
 * The radius is two sinusoids of seeded phase and frequency, so neighbouring points differ by
 * a little rather than by a random amount and the outline undulates where `irregular` zig-zags.
 *
 * **Sampled adaptively against a tolerance, not at a fixed count**, which is the whole reason
 * this is not the 48-gon it used to be. Two things made that read as a polygon rather than as
 * a curve, and only the first is obvious:
 *
 * - The flattening error was 0.47px at `size = 62` — visible on its own.
 * - Worse, the *turn* at the sharpest vertex was 19.6°, not the 7.5° an even 48-gon of a
 *   circle would give. The wobble concentrates curvature into a few places, so an evenly
 *   spaced sample is far too coarse exactly where it matters and wasteful everywhere else.
 *   Subdividing where the chord is bad spends vertices where the curve actually bends.
 *
 * Note what an outward offset does *not* fix, because it is tempting to assume otherwise: it
 * fillets the corners and leaves every straight run at its full length. On the old 48-gon, 92%
 * of the outline was still straight at `r = 6` and 68% at `r = 32`. Rounding a coarse polygon
 * does not make a curve; sampling the curve finely does.
 *
 * Still a polygon, though, and worth saying plainly: a consumer that reads the field's gradient
 * sees facets however fine this gets, bounded by `BLOB_MAX_TURN` rather than removed. A truly
 * continuous normal needs a primitive whose curvature is continuous — an arc spline, say, which
 * a chain of biarcs would give in ~15 pieces instead of 200 segments.
 *
 * @param tolerance Largest allowed gap between the polyline and the true curve, in px.
 * @param maxTurnDegrees Largest allowed turn between consecutive segments.
 */
export const blob = (size: number, seed: number, tolerance = 0.05, maxTurnDegrees = BLOB_MAX_TURN): number[] => {
  const wobble = blobWobble(seed);
  const pointAt = (angle: number): [number, number] => {
    const radius = size * wobble(angle);
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  };

  const limit = Math.max(tolerance, 1e-4);
  const turnLimit = (Math.max(maxTurnDegrees, 0.25) * Math.PI) / 180;
  const start = -Math.PI / 2;

  // Pass 1: subdivide on chord error. Angles rather than points, because pass 2 has to be able
  // to ask the curve for a new vertex between two it already has.
  const angles: number[] = [];
  const refine = (a0: number, a1: number, p0: [number, number], p1: [number, number], depth: number): void => {
    if (depth < BLOB_MAX_DEPTH) {
      const middle = (a0 + a1) / 2;
      const pm = pointAt(middle);
      if (chordError(pm[0], pm[1], p0[0], p0[1], p1[0], p1[1]) > limit) {
        refine(a0, middle, p0, pm, depth + 1);
        refine(middle, a1, pm, p1, depth + 1);
        return;
      }
    }
    angles.push(a1);
  };

  angles.push(start);
  let previousAngle = start;
  let previous = pointAt(start);
  for (let span = 1; span <= BLOB_SPANS; span++) {
    const angle = start + (span / BLOB_SPANS) * Math.PI * 2;
    const point = pointAt(angle);
    refine(previousAngle, angle, previous, point, 0);
    previousAngle = angle;
    previous = point;
  }
  // The last span closes back onto the first vertex; the polygon is implicitly closed, so drop
  // the duplicate rather than handing the field a zero-length edge.
  angles.pop();

  /**
   * Pass 2: enforce the turn limit at the *junctions*.
   *
   * Pass 1 cannot: it only ever sees the turn inside one span, and the sharpest turns are
   * between two spans that stopped at different depths — a long chord meeting a short one. So
   * neither side tests that angle, and raising the limit in pass 1 changed nothing measurable
   * (7.4° either way). This walks the finished ring, finds every junction that turns too
   * sharply, and splits the longer of its two segments, which is the one carrying the error.
   */
  for (let round = 0; round < 8; round++) {
    const count = angles.length;
    const at = (index: number) => pointAt(angles[(index + count) % count] ?? 0);
    const violations: number[] = [];
    for (let index = 0; index < count; index++) {
      const a = at(index - 1);
      const b = at(index);
      const c = at(index + 1);
      const first = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const second = Math.atan2(c[1] - b[1], c[0] - b[0]);
      let turn = Math.abs(second - first);
      if (turn > Math.PI) turn = Math.PI * 2 - turn;
      if (turn > turnLimit) violations.push(index);
    }
    // Bail rather than truncate: stopping leaves a good curve with a few sharp junctions, where
    // running out of room mid-ring would leave one side of it coarse.
    if (violations.length === 0 || count + violations.length > BLOB_SPANS * 2 ** BLOB_MAX_DEPTH) break;

    // Deduplicated, and this is load-bearing: two neighbouring violations pick the span between
    // them from opposite ends, so the same midpoint arrives twice. A repeated angle is a
    // zero-length edge, whose direction is `atan2(0, 0)` — which made the turn metric report
    // 137° on a curve that was otherwise fine.
    const inserts: number[] = [];
    const claimed = new Set(angles.map((angle) => angle.toFixed(9)));
    const claim = (angle: number): void => {
      const key = angle.toFixed(9);
      if (claimed.has(key)) return;
      claimed.add(key);
      inserts.push(angle);
    };

    for (const index of violations) {
      const previousIndex = (index - 1 + count) % count;
      const nextIndex = (index + 1) % count;
      const before = at(previousIndex);
      const here = at(index);
      const after = at(nextIndex);
      const backLength = Math.hypot(here[0] - before[0], here[1] - before[1]);
      const forwardLength = Math.hypot(after[0] - here[0], after[1] - here[1]);
      // Angles are increasing, so the wrap has to be unrolled before a midpoint means anything.
      const wrap = (from: number, to: number) => (to > from ? (from + to) / 2 : (from + to + Math.PI * 2) / 2);
      claim(
        backLength >= forwardLength
          ? wrap(angles[previousIndex] ?? 0, angles[index] ?? 0)
          : wrap(angles[index] ?? 0, angles[nextIndex] ?? 0)
      );
    }
    if (inserts.length === 0) break;
    angles.push(...inserts);
    angles.sort((left, right) => left - right);
  }

  const points: number[] = [];
  for (const angle of angles) {
    const point = pointAt(angle);
    points.push(point[0], point[1]);
  }
  return points;
};

/**
 * A cross, as the plainest strongly-concave case: four reflex vertices, and an inside that a
 * "which side of the nearest edge" test gets wrong. Regular polygons and stars can both be
 * mistaken for smooth shapes at a glance; this one cannot.
 */
export const cross = (size: number, waist = 0.36): number[] => {
  const a = size;
  const b = size * waist;
  return [-b, -a, b, -a, b, -b, a, -b, a, b, b, b, b, a, -b, a, -b, b, -a, b, -a, -b, -b, -b];
};

export type ShapeKindId = 'triangle' | 'star5' | 'star7' | 'pentagon' | 'irregular' | 'cross' | 'blob';

export interface ShapeKind {
  id: ShapeKindId;
  label: string;
  /** Vertices around the origin, for a shape of roughly `size` and the given seed. */
  points: (size: number, seed: number) => number[];
  note: string;
}

export const SHAPE_KINDS: readonly ShapeKind[] = [
  {
    id: 'triangle',
    label: 'triangle',
    points: (size) => triangle(size),
    note: 'The smallest polygon. Sharp 60° corners are where an offset shows most — the fillet radius is visible even when it is small.',
  },
  {
    id: 'star5',
    label: 'star, 5',
    points: (size) => star(5, size, size * 0.42),
    note: 'Ten vertices, five of them reflex. Not reachable from the box family at any exponent.',
  },
  {
    id: 'star7',
    label: 'star, 7',
    points: (size) => star(7, size, size * 0.55),
    note: 'Shallower spikes, so the notches close up first as the offset grows — a star turns into a cog and then into a disc.',
  },
  {
    id: 'pentagon',
    label: 'pentagon',
    points: (size) => regular(5, size),
    note: 'Regular and convex, as the control: whatever the offset does here is what it does with no concavity involved.',
  },
  {
    id: 'irregular',
    label: 'irregular',
    points: (size, seed) => irregular(9, size, seed),
    note: 'Nine vertices at even angles and random radii. Lopsided, mildly concave, and different for every seed.',
  },
  {
    id: 'cross',
    label: 'cross',
    points: (size) => cross(size),
    note: 'Four reflex vertices and a narrow waist. The offset eventually swallows the notches, which is the topology change worth watching.',
  },
  {
    id: 'blob',
    label: 'blob',
    points: (size, seed) => blob(size * 0.92, seed),
    note: 'Two seeded sinusoids, flattened adaptively until it strays under 0.05px from the true curve and turns no more than 5° per segment — about 130 vertices. It was a fixed 48-gon and looked like one: 0.47px off the curve, with a 19.6° kink at the sharpest vertex.',
  },
];

/** Total vertices across a set of polygons, for the cost readout. */
export const vertexCount = (shapes: readonly { points?: readonly number[] }[]): number =>
  shapes.reduce((total, shape) => total + (shape.points?.length ?? 0) / 2, 0);
