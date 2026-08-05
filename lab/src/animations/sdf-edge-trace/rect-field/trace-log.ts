/**
 * A short history of traces, and whether any are happening right now.
 *
 * Event-driven tracing makes the usual readout lie. A settled surface performs *no*
 * traces at all, so a bare "0.34 ms" sitting in a panel reads as a cost being paid
 * continuously when in fact nothing is running — the same class of mistake as showing
 * `0.000 ms` before anything has been measured, which reads as free rather than as
 * unknown. So the state is explicit: `idle` or `tracing`, with how long ago the last one
 * was.
 *
 * The x axis of the chart is deliberately *time*, not trace index. Indexing by trace
 * would pack a burst and a lone retrace into the same spacing and hide the thing that
 * matters most about this design — that the gaps are where the work is not being done.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { LiveScopeSample } from '#src/components/live-scope/live-scope.js';

/**
 * No trace for this long and the surface is considered settled.
 *
 * It cannot be zero, however tempting: a trace happens at most once per frame, so a
 * threshold under a frame interval would flicker back to `idle` in the gap between two
 * frames of a continuous animation. ~150ms is nine frames at 60Hz — long enough that the
 * pauses inside a hand-driven drag do not read as settling, short enough that stopping
 * reads as stopping. It is the whole of the lag now that `useTraceStatus` no longer waits
 * for a poll to notice.
 */
export const IDLE_AFTER_MS = 150;
/**
 * Traces retained for the chart.
 *
 * Sized against the observed rate, not picked round: a continuously animating layout drives
 * ~85 traces/s, so 120 samples covered only 1.4s of the chart's 4s window and every bar
 * piled up against the right edge. 400 covers the window with headroom.
 */
const CAPACITY = 400;

export interface TraceSample {
  /** `performance.now()` when the trace finished. */
  at: number;
  ms: number;
  fieldEvals: number;
}

export interface TraceHistory {
  /**
   * When this snapshot was taken.
   *
   * Carried on the snapshot rather than read at render time: `performance.now()` during
   * render is impure, and a chart that re-read the clock could place its bars at a
   * different instant than the `settled Xs ago` label beside them.
   */
  readAt: number;
  samples: readonly TraceSample[];
  /** Total traces since the log was created, including those aged out of the window. */
  total: number;
  /** ms since the most recent trace, or null when there has never been one. */
  sinceLast: number | null;
  /** Median of the retained window — meaningful only once a burst has filled it. */
  medianMs: number;
  peakMs: number;
  /** Traces per second over the retained window, or 0 when settled. */
  rate: number;
}

export class TraceLog {
  private readonly buffer: TraceSample[] = [];
  private count = 0;

  push(ms: number, fieldEvals: number): void {
    this.buffer.push({ at: performance.now(), ms, fieldEvals });
    if (this.buffer.length > CAPACITY) this.buffer.shift();
    this.count++;
  }

  /**
   * Samples at or after `fromAt`, for a scope that reads every frame.
   *
   * Separate from `read()` because the two have opposite requirements: `read` builds a
   * snapshot with medians and rates for text that updates five times a second, while this is
   * called at refresh rate and must not compute anything it is not asked for.
   */
  since(fromAt: number): LiveScopeSample[] {
    let start = 0;
    while (start < this.buffer.length && (this.buffer[start]?.at ?? 0) < fromAt) start++;
    return this.buffer.slice(start).map((sample) => ({ at: sample.at, value: sample.ms }));
  }

  clear(): void {
    this.buffer.length = 0;
    this.count = 0;
  }

  read(): TraceHistory {
    const readAt = performance.now();
    const samples = [...this.buffer];
    const last = samples.at(-1);
    const first = samples[0];
    const sorted = samples.map((s) => s.ms).sort((a, b) => a - b);

    let rate = 0;
    if (first !== undefined && last !== undefined && samples.length > 1) {
      const span = last.at - first.at;
      if (span > 0) rate = ((samples.length - 1) / span) * 1000;
    }

    return {
      readAt,
      samples,
      total: this.count,
      sinceLast: last === undefined ? null : readAt - last.at,
      medianMs: sorted.length > 0 ? (sorted[sorted.length >> 1] ?? 0) : 0,
      peakMs: sorted.length > 0 ? (sorted[sorted.length - 1] ?? 0) : 0,
      rate,
    };
  }
}

export type TraceStatus = 'never' | 'idle' | 'tracing';

/**
 * Whether traces are still arriving, and the callback a tracer calls to say one landed.
 *
 * `idle` is the absence of an event, so *something* has to notice the absence, and the
 * obvious something is a clock. Sampling `sinceLast` on the same 200ms poll that feeds the
 * numbers was the first version, and it made both edges late: up to a poll to notice that
 * tracing started, and up to `IDLE_AFTER_MS` *plus* a poll to notice that it stopped —
 * about half a second of a badge claiming work that had already finished.
 *
 * A timer armed by the trace itself is exact instead: `tracing` on the frame a trace lands,
 * `idle` exactly `IDLE_AFTER_MS` after the last one. `markTraced` runs every animated frame
 * and re-arms the timer each time, which is cheap; the `setTracing(true)` behind it settles
 * into React's same-value bail-out, so a burst costs one render, not one per frame.
 */
export const useTraceStatus = (): { tracing: boolean; markTraced: () => void } => {
  const [tracing, setTracing] = useState(false);
  const idleTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (idleTimer.current !== null) clearTimeout(idleTimer.current);
    },
    []
  );

  const markTraced = useCallback(() => {
    setTracing(true);
    if (idleTimer.current !== null) clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => {
      idleTimer.current = null;
      setTracing(false);
    }, IDLE_AFTER_MS);
  }, []);

  return { tracing, markTraced };
};

/**
 * `never` outranks both: a surface that has traced nothing is not settled, it is unmeasured,
 * and the two must not read the same.
 */
export const statusOf = (history: TraceHistory, tracing: boolean): TraceStatus => {
  if (history.sinceLast === null) return 'never';
  return tracing ? 'tracing' : 'idle';
};
