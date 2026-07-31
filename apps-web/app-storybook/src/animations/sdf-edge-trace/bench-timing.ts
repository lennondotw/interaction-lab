/**
 * The timing methodology the three benchmark panels share.
 *
 * Everything measured in this folder runs in well under a millisecond, which is
 * the regime where `performance.now()` around a single call reports the clock's
 * resolution rather than the work. So each sample is a batch sized at runtime to
 * last `TARGET_BATCH_MS`, and the reported figure is the median of `SAMPLES`
 * batches — the median rather than the mean because a GC pause or a descheduled
 * frame lands in exactly one batch and would drag an average with it.
 *
 * Kept in one place deliberately. Three panels quoting numbers at each other is
 * only meaningful if they were arrived at the same way, and a batch-sizing rule
 * that drifted between them would be invisible in the output.
 */

/** Batches are sized to run at least this long, to clear timer quantisation. */
export const TARGET_BATCH_MS = 8;
export const SAMPLES = 7;
export const WARMUP = 40;

/** Upper bound on batch inner iterations, so a near-free `run` cannot hang a frame. */
const MAX_INNER = 4000;

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

export interface Timing {
  /** Median batch, ms per call. */
  ms: number;
  best: number;
  worst: number;
}

/**
 * Warms up, sizes a batch from one probe call, then medians `SAMPLES` batches.
 *
 * `run` must do the same amount of work every call — anything that grows a buffer
 * or memoises across calls will report the first iteration's cost amortised to
 * nothing.
 */
export function timeBatched(run: () => void): Timing {
  for (let i = 0; i < WARMUP; i++) run();

  const probeStart = performance.now();
  run();
  const probeMs = Math.max(performance.now() - probeStart, 0.001);
  const inner = Math.min(Math.max(Math.ceil(TARGET_BATCH_MS / probeMs), 1), MAX_INNER);

  const samples: number[] = [];
  for (let s = 0; s < SAMPLES; s++) {
    const t0 = performance.now();
    for (let k = 0; k < inner; k++) run();
    samples.push((performance.now() - t0) / inner);
  }

  return { ms: median(samples), best: Math.min(...samples), worst: Math.max(...samples) };
}

/**
 * Hands the frame back so a sweep of dozens of rows streams into the table
 * instead of locking the tab until it finishes.
 */
export const yieldToBrowser = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

export interface SweepProgress<Row> {
  rows: Row[];
  done: number;
  total: number;
}
