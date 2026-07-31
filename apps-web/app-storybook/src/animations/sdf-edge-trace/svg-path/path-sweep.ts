/**
 * What the SVG route costs over the canvas route, per configuration.
 *
 * The trace is identical either way, so it is measured once per cell size and
 * then held still while the two path builders run against the *same* traced
 * geometry. That is the only way the comparison is clean: `Path2D` and the `d`
 * string are being asked to express one set of vertices, and the difference
 * between them is the whole question.
 *
 * `dataMs` is not the full price of the SVG route. Handing the string to the
 * browser costs a reparse that lands in the frame's paint work, which no
 * in-page timer can see — so read these rows as the floor, and the
 * `RectField` story's live scope for whether the rest of it fits.
 */

import { SweepProgress, timeBatched, yieldToBrowser } from '../bench-timing.js';
import { buildPath2D, buildPathData } from '../contour-path.js';
import { Ball, ContourTracer, TraceConfig } from '../field.js';

export interface PathSweepRow {
  id: string;
  cell: number;
  precision: number;
  smooth: boolean;
  /** Extracting the contour. Shared by both renderers, so identical per (cell, smooth). */
  traceMs: number;
  /** Building a `Path2D` from the traced vertices — what the canvas pays. */
  path2dMs: number;
  /** Building the `d` string from the same vertices — what SVG pays instead. */
  dataMs: number;
  chars: number;
  vertices: number;
  loops: number;
  /** Largest coordinate rounding error, in domain units. */
  maxError: number;
}

export type PathSweepProgress = SweepProgress<PathSweepRow>;

export interface PathSweepOptions {
  tracer: ContourTracer;
  balls: readonly Ball[];
  radius: number;
  sigma: number;
  blend: number;
  cells: readonly number[];
  precisions: readonly number[];
  signal: AbortSignal;
  onProgress: (progress: PathSweepProgress) => void;
}

export async function runPathSweep(options: PathSweepOptions): Promise<PathSweepRow[]> {
  const { tracer, balls, radius, sigma, blend, cells, precisions, signal, onProgress } = options;

  const matrix: { cell: number; smooth: boolean; precision: number }[] = [];
  for (const cell of cells) {
    for (const smooth of [true, false]) {
      for (const precision of precisions) matrix.push({ cell, smooth, precision });
    }
  }

  const rows: PathSweepRow[] = [];

  for (const entry of matrix) {
    if (signal.aborted) break;

    const config: TraceConfig = {
      field: 'sdf',
      traversal: 'sparse',
      cell: entry.cell,
      radius,
      sigma,
      blend,
      collectCells: false,
    };

    const traceTiming = timeBatched(() => {
      tracer.trace(balls, config);
    });

    // Leave the tracer holding this configuration's geometry. Both builders below
    // read it without re-tracing, so neither is charged for the trace.
    const stats = tracer.trace(balls, config);
    const emit = { smooth: entry.smooth };

    const path2dTiming = timeBatched(() => {
      buildPath2D(tracer, emit);
    });

    const dataOptions = { ...emit, precision: entry.precision };
    const dataTiming = timeBatched(() => {
      buildPathData(tracer, dataOptions);
    });

    const data = buildPathData(tracer, dataOptions);

    rows.push({
      id: `${entry.cell}-${entry.smooth ? 'q' : 'l'}-${entry.precision}`,
      cell: entry.cell,
      precision: entry.precision,
      smooth: entry.smooth,
      traceMs: traceTiming.ms,
      path2dMs: path2dTiming.ms,
      dataMs: dataTiming.ms,
      chars: data.d.length,
      vertices: stats.pointCount,
      loops: data.loops,
      maxError: data.maxError,
    });

    onProgress({ rows: [...rows], done: rows.length, total: matrix.length });
    await yieldToBrowser();
  }

  return rows;
}
