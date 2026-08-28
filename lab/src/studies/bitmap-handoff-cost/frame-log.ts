/**
 * A rolling window of frame intervals, in the shape `LiveScope` reads.
 *
 * Separate from the sweep's arrays because the two have opposite requirements: a sweep wants
 * every sample it took, for a median it computes once at the end, while the live chart wants
 * only the last few seconds and wants them without allocating during a frame. So this retains
 * a fixed window and drops from the front, and `since` returns a slice of it rather than a
 * filtered copy of everything ever recorded.
 */

export interface FrameSample {
  /** `performance.now()` when the frame was observed. */
  at: number;
  /** Interval since the previous frame, in ms. */
  value: number;
}

/** Ten seconds at 120Hz, which is more than any window the chart plots. */
const CAPACITY = 1280;

export class FrameLog {
  private samples: FrameSample[] = [];

  push(at: number, value: number): void {
    this.samples.push({ at, value });
    if (this.samples.length > CAPACITY) this.samples = this.samples.slice(-CAPACITY);
  }

  /**
   * Samples at or after `fromAt`. Runs once per frame from the chart, so it walks back from
   * the end rather than filtering the whole window — the answer is always a suffix.
   */
  since(fromAt: number): readonly FrameSample[] {
    let start = this.samples.length;
    while (start > 0 && (this.samples[start - 1]?.at ?? 0) >= fromAt) start--;
    return this.samples.slice(start);
  }

  clear(): void {
    this.samples = [];
  }

  /** Median, p95 and worst over the whole retained window. */
  stats(): { median: number; p95: number; worst: number; count: number } {
    const values = this.samples.map((sample) => sample.value).sort((a, b) => a - b);
    if (values.length === 0) return { median: 0, p95: 0, worst: 0, count: 0 };
    const at = (q: number): number => values[Math.min(values.length - 1, Math.round(q * (values.length - 1)))] ?? 0;
    return { median: at(0.5), p95: at(0.95), worst: values[values.length - 1] ?? 0, count: values.length };
  }
}
