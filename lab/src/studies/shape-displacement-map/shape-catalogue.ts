/**
 * The shapes the map is drawn for, each as a field *and* an outline that come from the
 * same geometry.
 *
 * That pairing is the point. If the drawn outline were a second reading of the shape —
 * a path hand-written to look like the field — then a map that was subtly wrong would
 * still line up with it, and the story would prove nothing. So Apple's corners are
 * flattened out of `squircleCorners`, the same function the shipping component calls,
 * and the polygons come from `irregular-shapes`, the same generators the tracer story
 * uses. Only the circle and the plain rounded rect are stated twice, because an arc is
 * closed-form on both sides.
 */

import { squircleCorners, type CornerRadii } from '#src/components/continuous-corner/squircle-path.js';
import { blob, star, triangle } from '#src/studies/sdf-edge-trace/irregular/irregular-shapes.js';

import { polygonSdf, roundedBoxSdf, type Sdf } from './shape-sdf.js';

/**
 * Every shape, as a tuple rather than inferred from `SHAPES`.
 *
 * Declared separately so `ShapeId` is a union of literals instead of `string`, which is what
 * lets a Storybook `select` control offer the real options and a typo in a story's args fail
 * the typecheck rather than silently render nothing.
 */
export const SHAPE_IDS = [
  'circle',
  'rounded-rect',
  'superellipse',
  'continuous-corner',
  'continuous-mixed',
  'continuous-capsule',
  'continuous-max-square',
  'triangle',
  'star5',
  'blob',
] as const;

export type ShapeId = (typeof SHAPE_IDS)[number];

export interface ShapeEntry {
  id: ShapeId;
  label: string;
  /** Why this shape is in the list — what its map shows that the others' do not. */
  note: string;
  /** Signed distance for a shape placed inside a `size × size` box. */
  sdf: (size: number) => Sdf;
  /** The same shape as an SVG path, in the same box. */
  path: (size: number) => string;
}

const even = (radius: number): CornerRadii => ({
  topLeft: radius,
  topRight: radius,
  bottomRight: radius,
  bottomLeft: radius,
});

/**
 * Apple's outline as a dense polyline, in box coordinates.
 *
 * `corner-families.appleOutline` does this already but takes one radius for all four
 * corners, and an asymmetric case is one of the shapes worth showing. Both call
 * `squircleCorners`, so this is the same geometry read the same way, not a second
 * implementation of the curve.
 *
 * De Casteljau at a fixed subdivision, and the subdivision is chosen against what the map
 * can actually represent rather than generously. At radius 44 a corner's three cubics span
 * roughly 134px, so 10 steps each leaves ~4.5px chords, whose sagitta against a curve of
 * that radius is about 0.06px — an order of magnitude under the 0.47px that one 8-bit code
 * of the encoding is worth. Going finer buys nothing visible and costs real time: the
 * polygon distance loops over every vertex for every pixel, and at 20 steps these shapes
 * took 300ms each against 17ms for a rounded box.
 */
const appleOutline = (width: number, height: number, radii: CornerRadii, perSegment = 10): number[] => {
  const corners = squircleCorners({ width, height, radii });
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

/** A polyline as a closed path. Used for every polygon shape, Apple's included. */
const polylinePath = (points: readonly number[], offsetX = 0, offsetY = 0): string => {
  const count = Math.floor(points.length / 2);
  if (count < 3) return '';
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = (points[i * 2] ?? 0) + offsetX;
    const y = (points[i * 2 + 1] ?? 0) + offsetY;
    parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return `${parts.join(' ')}Z`;
};

/** An axis-aligned rounded rect with circular corners. */
const arcRectPath = (x: number, y: number, w: number, h: number, r: number): string => {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  return (
    `M${x + radius},${y}` +
    `H${x + w - radius}A${radius},${radius} 0 0 1 ${x + w},${y + radius}` +
    `V${y + h - radius}A${radius},${radius} 0 0 1 ${x + w - radius},${y + h}` +
    `H${x + radius}A${radius},${radius} 0 0 1 ${x},${y + h - radius}` +
    `V${y + radius}A${radius},${radius} 0 0 1 ${x + radius},${y}Z`
  );
};

const circlePath = (cx: number, cy: number, r: number): string =>
  `M${cx - r},${cy}A${r},${r} 0 1 0 ${cx + r},${cy}A${r},${r} 0 1 0 ${cx - r},${cy}Z`;

/** Insets every shape from the box edge, so the rim's refraction is never clipped. */
const PAD = 18;

/**
 * Scales a point list so its furthest vertex sits exactly `radius` from the origin.
 *
 * `blob` takes a *base* radius and then multiplies it by a seeded wobble that peaks around
 * 1.43, so passing it `size / 2 - PAD` overflows the box by a third — measured at
 * `x 1.2..198.8` against the intended `18..182`, with the rim's refraction clipped off at
 * the canvas edge. Normalising against what the generator actually returned fixes that for
 * any seed, where a hand-picked shrink factor would only fix it for one.
 */
const fitToRadius = (points: readonly number[], radius: number): number[] => {
  let furthest = 0;
  for (let i = 0; i < points.length; i += 2) {
    const reach = Math.hypot(points[i] ?? 0, points[i + 1] ?? 0);
    if (reach > furthest) furthest = reach;
  }
  if (furthest === 0) return [...points];
  const scale = radius / furthest;
  return points.map((value) => value * scale);
};

export const SHAPES: readonly ShapeEntry[] = [
  {
    id: 'circle',
    label: 'circle',
    note: "The case the old radial map could already do, and the only one where a radial falloff and a real field agree — a circle's normal *is* its radial direction.",
    sdf: (size) => {
      const r = size / 2 - PAD;
      return roundedBoxSdf({ cx: size / 2, cy: size / 2, hw: r, hh: r, r, n: 2 });
    },
    path: (size) => circlePath(size / 2, size / 2, size / 2 - PAD),
  },
  {
    id: 'rounded-rect',
    label: 'rounded rect (arc)',
    note: 'Plain border-radius. Straight edges refract uniformly and the four corners are identical, so this is the control the corner families are read against.',
    sdf: (size) => {
      const half = size / 2 - PAD;
      return roundedBoxSdf({ cx: size / 2, cy: size / 2, hw: half, hh: half, r: 44, n: 2 });
    },
    path: (size) => arcRectPath(PAD, PAD, size - 2 * PAD, size - 2 * PAD, 44),
  },
  {
    id: 'superellipse',
    label: 'superellipse (squircle)',
    note: 'The p-norm corner at n = 4, which is CSS corner-shape: squircle. Its corner carries curvature further along the edge than an arc, and the rim band shows exactly that.',
    sdf: (size) => {
      const half = size / 2 - PAD;
      return roundedBoxSdf({ cx: size / 2, cy: size / 2, hw: half, hh: half, r: 44, n: 4 });
    },
    // Drawn from the field rather than stated: no closed-form path for a p-norm corner
    // exists in this repo, and inventing one here would be the second reading this file
    // is written to avoid.
    path: () => '',
  },
  {
    id: 'continuous-corner',
    label: 'continuous corner',
    note: "Apple's curve, three cubics per corner reaching 1.528665r along each edge. Compare the rim against the arc rect: the band stays the same width for longer before it turns.",
    sdf: (size) => {
      const box = size - 2 * PAD;
      return polygonSdf({ cx: PAD, cy: PAD, points: appleOutline(box, box, even(44)), r: 0 });
    },
    path: (size) => polylinePath(appleOutline(size - 2 * PAD, size - 2 * PAD, even(44)), PAD, PAD),
  },
  {
    id: 'continuous-mixed',
    label: 'continuous, mixed radii',
    note: 'The same curve with two radii, 12 and 68, on opposite corners. Nothing in the pipeline knows the corners differ — the field does, so the map does.',
    sdf: (size) => {
      const box = size - 2 * PAD;
      const radii: CornerRadii = { topLeft: 12, topRight: 68, bottomRight: 12, bottomLeft: 68 };
      return polygonSdf({ cx: PAD, cy: PAD, points: appleOutline(box, box, radii), r: 0 });
    },
    path: (size) => {
      const box = size - 2 * PAD;
      const radii: CornerRadii = { topLeft: 12, topRight: 68, bottomRight: 12, bottomLeft: 68 };
      return polylinePath(appleOutline(box, box, radii), PAD, PAD);
    },
  },
  {
    id: 'continuous-capsule',
    label: 'continuous capsule',
    note: "ContinuousCapsule: Apple's corner at the maximum radius the box allows. In a wide box that is a pill, and the rim band is what a capsule's ends do to a straight edge.",
    sdf: (size) => {
      const w = size - 2 * PAD;
      const h = (size - 2 * PAD) * 0.56;
      const top = (size - h) / 2;
      return polygonSdf({ cx: PAD, cy: top, points: appleOutline(w, h, even(h / 2)), r: 0 });
    },
    path: (size) => {
      const w = size - 2 * PAD;
      const h = (size - 2 * PAD) * 0.56;
      return polylinePath(appleOutline(w, h, even(h / 2)), PAD, (size - h) / 2);
    },
  },
  {
    id: 'continuous-max-square',
    label: 'continuous at max radius',
    note: "The same maximum radius in a *square* box, which is why ContinuousCircle exists as its own component: Apple's curve here is not quite round, it undulates. The map makes that visible — the rim band breathes where a circle's would be constant.",
    sdf: (size) => {
      const box = size - 2 * PAD;
      return polygonSdf({ cx: PAD, cy: PAD, points: appleOutline(box, box, even(box / 2)), r: 0 });
    },
    path: (size) => polylinePath(appleOutline(size - 2 * PAD, size - 2 * PAD, even((size - 2 * PAD) / 2)), PAD, PAD),
  },
  {
    id: 'triangle',
    label: 'triangle',
    note: 'Sharp 60° corners. The normal swings by 120° across a vertex, and the central-difference gradient averages the two faces instead of picking one — which is why the corner reads as a crease rather than as a tear.',
    sdf: (size) => polygonSdf({ cx: size / 2, cy: size / 2 + 10, points: triangle(size / 2 - PAD), r: 0 }),
    path: (size) => polylinePath(triangle(size / 2 - PAD), size / 2, size / 2 + 10),
  },
  {
    id: 'star5',
    label: 'star, 5',
    note: 'Five reflex vertices. A notch is outside the polygon while sitting inside its hull, so the map only comes out right because inside-ness is a crossing count, not a nearest-edge side test.',
    sdf: (size) => {
      const outer = size / 2 - PAD;
      return polygonSdf({ cx: size / 2, cy: size / 2, points: star(5, outer, outer * 0.45), r: 0 });
    },
    path: (size) => {
      const outer = size / 2 - PAD;
      return polylinePath(star(5, outer, outer * 0.45), size / 2, size / 2);
    },
  },
  {
    id: 'blob',
    label: 'irregular curve',
    note: '48 vertices on two seeded sinusoids — dense enough that no straight edge survives. An arbitrary smooth outline needs nothing the others did not: the field is the whole interface.',
    sdf: (size) =>
      polygonSdf({ cx: size / 2, cy: size / 2, points: fitToRadius(blob(size / 2 - PAD, 7), size / 2 - PAD), r: 0 }),
    path: (size) => polylinePath(fitToRadius(blob(size / 2 - PAD, 7), size / 2 - PAD), size / 2, size / 2),
  },
];

/**
 * The entry for an id, or a throw.
 *
 * Throws rather than falling back to the first shape: a story asking for a shape that is not
 * there is a mistake in the story, and quietly rendering a circle instead would hide it.
 */
export const shapeById = (id: ShapeId): ShapeEntry => {
  const found = SHAPES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no shape "${id}" in the catalogue`);
  return found;
};
