/**
 * What gets put in front of the tracer.
 *
 * One rect only ever exercises one corner shape, which is enough to *measure* the field
 * against a reference but not enough to see it trace. The field carries `n` per shape, so
 * the interesting cases are several rects of genuinely different shape in one field —
 * different exponents, different aspect ratios, different radii, some clamped to pills and
 * circles — and then bridged, where corners of different sharpness have to negotiate a
 * single contour between them.
 *
 * Positions are centres in domain coordinates, so a scene is laid out for `VIEW` directly
 * and needs no transform at draw time.
 */

import { quadtreeSafeView, type FieldShape } from '#src/components/meta-surface/sdf/field.js';

import { familyShape, type Family } from './corner-families.js';

/** Square sampling domain, padded so the quadtree keeps a large root. */
export const VIEW = quadtreeSafeView(620);

/** The box the measured scene traces, and that Apple's reference outline is built for. */
export const MEASURED_BOX = { width: 300, height: 180 };

export type SceneId = 'measured' | 'exponents' | 'assorted';

/** A shape plus what to write next to it, when a scene labels its members. */
export interface SceneShape {
  shape: FieldShape;
  label?: string;
}

export interface SceneInput {
  /** The family the controls have selected. Scenes are free to ignore it. */
  family: Family;
  k: number;
  /** Nominal radius in px, straight off the slider. */
  radius: number;
}

export interface Scene {
  id: SceneId;
  label: string;
  /** Whether the deviation readout means anything here. */
  measured: boolean;
  /** Whether the family and k controls do anything here. */
  usesFamily: boolean;
  note: string;
  shapes: (input: SceneInput) => SceneShape[];
}

const centred = (family: Family, k: number, width: number, height: number, radius: number, cx: number, cy: number) => {
  const local = familyShape(family, k, width, height, radius);
  return { ...local, x: cx, y: cy };
};

/**
 * The assorted scene's members, as fractions rather than pixels so one slider drives them
 * all and each still lands somewhere different. `radiusFactor` above 1 is deliberate — it
 * clamps to half the short side, which is how a pill and a circle get into the scene without
 * being special-cased.
 */
const ASSORTED = [
  { width: 260, height: 150, cx: 250, cy: 196, radiusFactor: 0.85 },
  { width: 112, height: 226, cx: 452, cy: 212, radiusFactor: 0.5 },
  { width: 96, height: 176, cx: 606, cy: 296, radiusFactor: 0.7 },
  { width: 244, height: 100, cx: 296, cy: 366, radiusFactor: 3 },
  { width: 124, height: 124, cx: 494, cy: 412, radiusFactor: 3 },
  { width: 124, height: 94, cx: 176, cy: 476, radiusFactor: 0.22 },
  { width: 296, height: 112, cx: 340, cy: 552, radiusFactor: 1 },
  { width: 100, height: 100, cx: 552, cy: 556, radiusFactor: 0.6 },
] as const;

/** Exponents the `families` scene lays out, as `n` directly rather than as a `k`. */
const EXPONENT_ROW = [1.25, 2, 2.611, 4, 8] as const;

export const SCENES: readonly Scene[] = [
  {
    id: 'measured',
    label: 'one, measured',
    measured: true,
    usesFamily: true,
    note: 'A single rect against ContinuousCorner’s own outline. The only scene where the deviation readout means anything, and the reason the others can be trusted.',
    shapes: ({ family, k, radius }) => [
      {
        shape: centred(family, k, MEASURED_BOX.width, MEASURED_BOX.height, radius, VIEW / 2, VIEW / 2),
      },
    ],
  },
  {
    id: 'exponents',
    label: 'one per exponent',
    measured: false,
    usesFamily: false,
    note: 'The same box five times, differing only in the corner exponent — a near-diamond at n = 1.25, the circular arc at 2, the Apple fit at 2.611, and two progressively squarer ones. The field holds all five at once, because `n` is per shape.',
    shapes: ({ radius }) => {
      const width = 208;
      const height = 148;
      const gap = 24;
      const perRow = 3;
      // Rows are centred independently so a short last row sits under the middle of the one
      // above rather than hugging the left edge.
      const rows: (typeof EXPONENT_ROW)[number][][] = [];
      for (let index = 0; index < EXPONENT_ROW.length; index += perRow) {
        rows.push(EXPONENT_ROW.slice(index, index + perRow));
      }
      const rowPitch = height + gap * 2.4;
      const startY = (VIEW - (rows.length * height + (rows.length - 1) * gap * 2.4)) / 2 + height / 2;

      return rows.flatMap((row, rowIndex) => {
        const rowWidth = row.length * width + (row.length - 1) * gap;
        const startX = (VIEW - rowWidth) / 2 + width / 2;
        return row.map((n, column) => ({
          shape: {
            x: startX + column * (width + gap),
            y: startY + rowIndex * rowPitch,
            hw: width / 2,
            hh: height / 2,
            r: Math.min(radius, width / 2, height / 2),
            n,
          },
          label: `n = ${n}`,
        }));
      });
    },
  },
  {
    id: 'assorted',
    label: 'assorted rects',
    measured: false,
    usesFamily: true,
    note: 'Eight rects of different size, aspect and radius in the selected family, including two clamped to a pill and a circle. Bridge them and corners of different sharpness have to agree on one contour — which is the thing no single rect can show.',
    shapes: ({ family, k, radius }) =>
      ASSORTED.map((item) => ({
        shape: centred(family, k, item.width, item.height, radius * item.radiusFactor, item.cx, item.cy),
      })),
  },
];

export const sceneById = (id: SceneId): Scene => {
  const found = SCENES.find((scene) => scene.id === id);
  if (found === undefined) throw new Error(`no scene "${id}"`);
  return found;
};
