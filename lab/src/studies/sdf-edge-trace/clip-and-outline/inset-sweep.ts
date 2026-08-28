/**
 * What the inset contour costs, and where it stops being the same shape.
 *
 * Two tables, because the inset raises two separate questions and only one of
 * them is about time.
 *
 * **Cost.** Every row traces the same shape twice, once at one level and once at
 * two, and reports the ratio. The claim under test is that the second level
 * reuses the first one's samples — which is true, and yet the ratio is only 1.000
 * for the grid walks. A quadtree has to *find* its contours and its cost follows
 * the length of what it finds, so a second contour is a second perimeter. Both
 * halves of that are worth having on screen, because "the samples are shared"
 * reads like "it is free" and is not.
 *
 * **Topology.** The inset is a different curve, not a thinner version of the same
 * one. Past some width a narrow waist has nothing left in it and the inner
 * contour breaks in two, and the sweep finds that width by bisection rather than
 * asserting a number — it depends on the shape, which the caller supplies live.
 */

import { Ball, ContourTracer, TraceConfig, Traversal } from '#src/components/meta-surface/sdf/field.js';

import { SweepProgress, timeBatched, yieldToBrowser } from '../bench-timing.js';

export interface InsetCostRow {
  id: string;
  traversal: Traversal;
  cell: number;
  /** One level, the surface alone. */
  baseMs: number;
  baseEvals: number;
  /** Two levels, surface plus the contour inset by `inset`. */
  insetMs: number;
  insetEvals: number;
  surfaceLoops: number;
  insetLoops: number;
  /** Vertices across both levels against the surface alone. */
  basePoints: number;
  insetPoints: number;
}

export interface PinchRow {
  inset: number;
  surfaceLoops: number;
  insetLoops: number;
}

export interface InsetSweepResult {
  cost: InsetCostRow[];
  pinch: PinchRow[];
  /**
   * Smallest swept inset at which the inner contour has more loops than the
   * surface, or null if it never splits over the range. The width at which
   * "w px in from the edge" stops describing one connected band.
   */
  pinchAt: number | null;
}

export type InsetSweepProgress = SweepProgress<InsetCostRow>;

export interface InsetSweepOptions {
  tracer: ContourTracer;
  balls: readonly Ball[];
  radius: number;
  sigma: number;
  blend: number;
  cells: readonly number[];
  /** Inset used for every cost row, so the ratios are comparable. */
  inset: number;
  /** Insets walked for the topology table. */
  pinchInsets: readonly number[];
  signal: AbortSignal;
  onProgress: (progress: InsetSweepProgress) => void;
}

const countLoops = (tracer: ContourTracer, level: number): number =>
  tracer.loops.reduce((total, loop) => (loop.level === level ? total + 1 : total), 0);

export async function runInsetSweep(options: InsetSweepOptions): Promise<InsetSweepResult> {
  const { tracer, balls, radius, sigma, blend, cells, inset, pinchInsets, signal, onProgress } = options;

  const base = { field: 'sdf', radius, sigma, blend, collectCells: false } as const;
  const matrix: { traversal: Traversal; cell: number }[] = [];
  for (const traversal of ['dense', 'bounded', 'sparse'] as const) {
    for (const cell of cells) matrix.push({ traversal, cell });
  }

  const cost: InsetCostRow[] = [];

  for (const entry of matrix) {
    if (signal.aborted) break;

    const plain: TraceConfig = { ...base, traversal: entry.traversal, cell: entry.cell };
    const withInset: TraceConfig = { ...plain, inset };

    const baseTiming = timeBatched(() => {
      tracer.trace(balls, plain);
    });
    const baseStats = tracer.trace(balls, plain);
    const basePoints = baseStats.pointCount;
    const surfaceLoops = countLoops(tracer, 0);

    const insetTiming = timeBatched(() => {
      tracer.trace(balls, withInset);
    });
    const insetStats = tracer.trace(balls, withInset);

    cost.push({
      id: `${entry.traversal}-${entry.cell}`,
      traversal: entry.traversal,
      cell: entry.cell,
      baseMs: baseTiming.ms,
      baseEvals: baseStats.fieldEvals,
      insetMs: insetTiming.ms,
      insetEvals: insetStats.fieldEvals,
      surfaceLoops,
      insetLoops: countLoops(tracer, 1),
      basePoints,
      insetPoints: insetStats.pointCount,
    });

    onProgress({ rows: [...cost], done: cost.length, total: matrix.length });
    await yieldToBrowser();
  }

  // Topology walk at the finest cell, where a pinch is least likely to be an
  // artefact of the sampling grid rather than the shape.
  const finest = cells.reduce((min, cell) => Math.min(min, cell), Infinity);
  const pinch: PinchRow[] = [];
  let pinchAt: number | null = null;

  for (const value of pinchInsets) {
    if (signal.aborted) break;
    tracer.trace(balls, { ...base, traversal: 'sparse', cell: finest, inset: value });
    const surfaceLoops = countLoops(tracer, 0);
    const insetLoops = countLoops(tracer, 1);
    pinch.push({ inset: value, surfaceLoops, insetLoops });
    if (pinchAt === null && insetLoops > surfaceLoops) pinchAt = value;
    await yieldToBrowser();
  }

  return { cost, pinch, pinchAt };
}
