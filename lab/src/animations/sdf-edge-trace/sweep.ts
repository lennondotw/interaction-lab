import { Ball, ContourTracer, FieldKind, TraceConfig, Traversal } from './field.js';

export interface SweepRow {
  id: string;
  field: FieldKind;
  traversal: Traversal;
  cell: number;
  /** Median of `SAMPLES` batches, ms per trace. */
  ms: number;
  msBest: number;
  msWorst: number;
  fieldEvals: number;
  loopCount: number;
  pointCount: number;
  /**
   * Whether this row's contour matches the dense scan of the same field at the
   * same cell size. `null` for the reference rows themselves.
   */
  agreesWithDense: boolean | null;
}

export interface SweepProgress {
  rows: SweepRow[];
  done: number;
  total: number;
}

/** Batches are sized to run at least this long, to clear timer quantisation. */
const TARGET_BATCH_MS = 8;
const SAMPLES = 7;
const WARMUP = 40;

interface SweepCell {
  field: FieldKind;
  traversal: Traversal;
  cell: number;
}

function buildMatrix(cells: readonly number[]): SweepCell[] {
  const out: SweepCell[] = [];
  for (const field of ['density', 'sdf'] as const) {
    for (const traversal of ['dense', 'bounded', 'sparse'] as const) {
      // A density field has no distance metric to cull with; `sparse` would
      // silently fall back to `bounded` and report a duplicate row.
      if (field === 'density' && traversal === 'sparse') continue;
      for (const cell of cells) {
        out.push({ field, traversal, cell });
      }
    }
  }
  return out;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

const yieldToBrowser = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

export interface SweepOptions {
  tracer: ContourTracer;
  balls: readonly Ball[];
  radius: number;
  sigma: number;
  blend: number;
  cells: readonly number[];
  signal: AbortSignal;
  onProgress: (progress: SweepProgress) => void;
}

export async function runSweep(options: SweepOptions): Promise<SweepRow[]> {
  const { tracer, balls, radius, sigma, blend, cells, signal, onProgress } = options;
  const matrix = buildMatrix(cells);
  const rows: SweepRow[] = [];

  // Reference contours: dense scan per (field, cell). Everything else has to
  // reproduce these exactly, or the speedup is meaningless.
  const reference = new Map<string, string>();

  for (const entry of matrix) {
    if (signal.aborted) break;

    const config: TraceConfig = {
      field: entry.field,
      traversal: entry.traversal,
      cell: entry.cell,
      radius,
      sigma,
      blend,
      collectCells: false,
    };

    for (let i = 0; i < WARMUP; i++) tracer.trace(balls, config);

    const probeStart = performance.now();
    tracer.trace(balls, config);
    const probeMs = Math.max(performance.now() - probeStart, 0.001);
    const inner = Math.min(Math.max(Math.ceil(TARGET_BATCH_MS / probeMs), 1), 4000);

    // Abort is only polled at the top of the outer loop: one entry's batches run
    // for roughly SAMPLES * TARGET_BATCH_MS, which is short enough to finish, and
    // re-reading `signal.aborted` here would be narrowed to `false` anyway.
    const samples: number[] = [];
    for (let s = 0; s < SAMPLES; s++) {
      const t0 = performance.now();
      for (let k = 0; k < inner; k++) tracer.trace(balls, config);
      samples.push((performance.now() - t0) / inner);
    }

    const stats = tracer.trace(balls, config);
    const shape = `${stats.loopCount}/${stats.pointCount}`;
    const refKey = `${entry.field}@${entry.cell}`;
    let agrees: boolean | null = null;
    if (entry.traversal === 'dense') {
      reference.set(refKey, shape);
    } else {
      const ref = reference.get(refKey);
      agrees = ref === undefined ? null : ref === shape;
    }

    rows.push({
      id: `${entry.field}-${entry.traversal}-${entry.cell}`,
      field: entry.field,
      traversal: entry.traversal,
      cell: entry.cell,
      ms: median(samples),
      msBest: Math.min(...samples),
      msWorst: Math.max(...samples),
      fieldEvals: stats.fieldEvals,
      loopCount: stats.loopCount,
      pointCount: stats.pointCount,
      agreesWithDense: agrees,
    });

    onProgress({ rows: [...rows], done: rows.length, total: matrix.length });
    await yieldToBrowser();
  }

  return rows;
}
