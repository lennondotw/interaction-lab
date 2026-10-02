/**
 * A rolling window of frame intervals, in the shape `LiveScope` reads.
 *
 * Separate from the sweep's arrays because the two have opposite requirements: a sweep wants
 * every sample it took, for a median it computes once at the end, while the live chart wants
 * the visible time range plus overscan. Retention follows the scope's width rather than a
 * fixed sample count, so high-refresh displays do not lose the left side of the chart.
 */

import { SampleHistory } from '#src/instruments/live-scope/sample-history.js';

export interface FrameSample {
  /** `performance.now()` when the frame was observed. */
  at: number;
  /** Interval since the previous frame, in ms. */
  value: number;
}

export class FrameLog {
  private readonly history = new SampleHistory<FrameSample>();

  push(at: number, value: number): void {
    this.history.push({ at, value });
  }

  /**
   * Samples at or after `fromAt`. Runs once per frame from the chart, so it walks back from
   * the end rather than filtering the whole window — the answer is always a suffix.
   */
  since(fromAt: number): readonly FrameSample[] {
    return this.history.since(fromAt);
  }

  clear(): void {
    this.history.clear();
  }

  /** Median, p95 and worst over the visible window, excluding overscan. */
  stats(): { median: number; p95: number; worst: number; count: number } {
    const values = this.history
      .visible()
      .map((sample) => sample.value)
      .sort((a, b) => a - b);
    if (values.length === 0) return { median: 0, p95: 0, worst: 0, count: 0 };
    const at = (q: number): number => values[Math.min(values.length - 1, Math.round(q * (values.length - 1)))] ?? 0;
    return { median: at(0.5), p95: at(0.95), worst: values[values.length - 1] ?? 0, count: values.length };
  }
}
