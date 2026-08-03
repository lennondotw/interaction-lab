/**
 * Shapes that are not rounded boxes: triangles, stars, irregular polygons, and curved blobs.
 *
 * All five kinds are the *same* primitive — `FieldShape.points`, a polygon with an outward
 * offset `r`. That is the interesting part and the reason they share a file: a star is a
 * polygon whose vertices alternate radius, a blob is a polygon with enough vertices and a
 * large enough offset that no straight edge survives, and a triangle is the smallest polygon
 * there is. Only the vertex list differs.
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

/**
 * A closed curve with no straight edges, from a polygon dense enough that its facets are
 * shorter than the offset that rounds them.
 *
 * The radius is two sinusoids of seeded phase and frequency, which is what keeps it smooth
 * where `irregular` is jagged: neighbouring vertices differ by a little rather than by a
 * random amount, so the outline undulates instead of zig-zagging. Hand this to the field with
 * a healthy `r` and there is no polygon left to see.
 */
export const blob = (size: number, seed: number, count = 48): number[] => {
  const next = rng(seed);
  const firstPhase = next() * Math.PI * 2;
  const secondPhase = next() * Math.PI * 2;
  const secondFrequency = 2 + Math.floor(next() * 3);
  const firstAmount = 0.16 + next() * 0.12;
  const secondAmount = 0.07 + next() * 0.08;
  return ring(count, (_, angle) => {
    const wobble =
      1 +
      Math.sin(angle * 2 + firstPhase) * firstAmount +
      Math.sin(angle * secondFrequency + secondPhase) * secondAmount;
    return size * wobble;
  });
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
    note: '48 vertices on two seeded sinusoids. Dense enough that a modest offset leaves no straight edge — an irregular curved shape out of the polygon primitive.',
  },
];

/** Total vertices across a set of polygons, for the cost readout. */
export const vertexCount = (shapes: readonly { points?: readonly number[] }[]): number =>
  shapes.reduce((total, shape) => total + (shape.points?.length ?? 0) / 2, 0);
