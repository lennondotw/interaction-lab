/**
 * Instrumentation for probing whether something that *follows* a layout actually
 * keeps up with it.
 *
 * Extracted from the beacon's layout-observation harness, where it was written to
 * answer "which of five observation sources catches which kind of layout change"
 * (archive/2026-07-beacon-layout-observation). Nothing in it is about beacons: the
 * whole apparatus is parameterised on `read: () => number`, one scalar meaning "how
 * far off is the follower right now", so any subject that can express its own error
 * as a number can use it unchanged.
 *
 * The second such subject is a contour traced from measured DOM rects, whose error
 * is not a box delta but `max |sdf(v)|` over the traced vertices with the field
 * rebuilt from fresh measurements. Different reading, identical harness.
 *
 * Three things here are the hard-won part, and are worth understanding before
 * reaching for something simpler:
 *
 * 1. **`startSampling` runs a bare rAF loop with no React in it.** Every logged
 *    line re-renders a trace panel, and a render landing inside the sampling window
 *    competes for the frames it is trying to measure. Callers log before they start
 *    and after they stop, never during.
 * 2. **`verdictOf` recovers from the *last* bad frame, not the first good one.** A
 *    multi-frame change can be tracked, fall behind, and be tracked again — an
 *    inner scroll leaving a clip does exactly that. Taking the first recovery
 *    reports "recovered in 1 frame" beside a settled error of 80px, which is two
 *    true numbers making one false claim.
 * 3. **The instrument must not share an implementation with its subject.** The
 *    beacon reads its target through `getBoundingClientRect` differencing while the
 *    hook under test walks the `offsetParent` chain, deliberately. An independent
 *    instrument can disagree with the subject, which is the only way a measurement
 *    bug shows up as a number instead of as two copies of the same mistake nodding
 *    at each other.
 */

import { useMemo } from 'react';

/**
 * Phases of one probe case. Generic to the shape of these probes rather than to any
 * one subject: set the stage, read a baseline, mutate, sample, settle, judge.
 */
export type TraceKind = 'case' | 'setup' | 'baseline' | 'mutate' | 'frames' | 'settle' | 'verdict';

export interface TraceEntry {
  /** ms since the current run started. */
  t: number;
  kind: TraceKind;
  text: string;
}

/** One decimal: sub-pixel disagreement is signal, ten decimals of it is not. */
export const fmt = (n: number): string => (Math.round(n * 10) / 10).toString();

export const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export interface DeltaSample {
  /** ms since sampling started. */
  t: number;
  d: number;
}

/**
 * Per-frame error series across a mutation.
 *
 * Sampling has to be a plain rAF loop over a numeric reader with no React in it:
 * every logged line re-renders the trace panel, and a render landing inside the
 * sampling window would compete for the same frames it is trying to measure.
 * Callers log before they start and after they stop, never during.
 */
export const startSampling = (read: () => number): (() => DeltaSample[]) => {
  const samples: DeltaSample[] = [];
  const t0 = performance.now();
  let running = true;

  const loop = (): void => {
    if (!running) return;
    samples.push({ t: performance.now() - t0, d: read() });
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  return () => {
    running = false;
    return samples;
  };
};

/**
 * The error series as one readable line, runs of equal values collapsed to
 * `value×count`. A tail long enough to catch a late recovery is also long enough to
 * bury the interesting first ten frames in a hundred repetitions of the same
 * number, which is how a trace stops being read.
 */
export const framesText = (samples: readonly DeltaSample[]): string => {
  const runs: { value: string; count: number }[] = [];
  for (const sample of samples) {
    const value = fmt(sample.d);
    const last = runs.at(-1);
    if (last?.value === value) last.count += 1;
    else runs.push({ value, count: 1 });
  }
  return runs.map((run) => (run.count > 1 ? `${run.value}×${String(run.count)}` : run.value)).join(' ');
};

export interface Verdict {
  /** Largest error seen at any sampled frame — the worst visible disagreement. */
  maxDelta: number;
  /** Error at the last sampled frame. Non-zero means the change was missed. */
  settledDelta: number;
  /**
   * Whether any sampled frame ever disagreed. False means the follower closed the
   * gap faster than a frame — a real outcome, not a missing measurement, and worth
   * telling apart from "never recovered".
   */
  sawGap: boolean;
  /** Frames from the first frame that saw the change to the frame that fixed it. */
  frames: number | null;
  /** Same span in ms. */
  lagMs: number | null;
}

/**
 * Reduce an error series to the numbers that decide a case.
 *
 * `frames` / `lagMs` are measured from the first frame that *saw* the change rather
 * than from the mutation call, because a mutation applied between frames is not
 * observable until the next one — counting from the call would bill the follower for
 * the browser's frame boundary.
 *
 * `epsilon` is the floor below which the instrument cannot tell agreement from
 * noise, and it is a property of the subject, not a constant: for a box compared
 * through `offsetLeft` against `getBoundingClientRect` it is one pixel of integer
 * rounding, while for a marching-squares contour it is the interpolation error over
 * one cell.
 */
export const verdictOf = (samples: readonly DeltaSample[], epsilon: number): Verdict => {
  const deltas = samples.map((s) => s.d);
  const maxDelta = deltas.length ? Math.max(...deltas) : 0;
  const settledDelta = deltas.length ? (deltas.at(-1) ?? 0) : 0;

  const firstBad = samples.findIndex((s) => s.d > epsilon);
  if (firstBad === -1) return { maxDelta, settledDelta, sawGap: false, frames: null, lagMs: null };

  // The *last* bad frame, not the first good one after `firstBad`. A multi-frame
  // mutation can be tracked, fall behind, and be tracked again — an inner scroll
  // that leaves the clip does exactly that. Taking the first recovery reports
  // "recovered in 1 frame" next to a settled Δ of 80px, which is two true numbers
  // making one false claim.
  const lastBad = samples.reduce((acc, s, i) => (s.d > epsilon ? i : acc), -1);
  const recovered = lastBad === samples.length - 1 ? -1 : lastBad + 1;
  if (recovered === -1) return { maxDelta, settledDelta, sawGap: true, frames: null, lagMs: null };

  const from = samples[firstBad];
  const to = samples[recovered];
  return {
    maxDelta,
    settledDelta,
    sawGap: true,
    frames: recovered - firstBad,
    lagMs: from && to ? Math.round(to.t - from.t) : null,
  };
};

export const createTracer = () => {
  let t0 = 0;
  let entries: TraceEntry[] = [];
  let subscriptions: (() => void)[] = [];

  return {
    log: (kind: TraceKind, text: string): void => {
      entries = [...entries, { t: Math.round(performance.now() - t0), kind, text }];
      subscriptions.forEach((sub) => sub());
    },

    reset: (): void => {
      t0 = performance.now();
      entries = [];
      subscriptions.forEach((sub) => sub());
    },

    getEntries: (): readonly TraceEntry[] => entries,

    subscribe: (callback: () => void): (() => void) => {
      subscriptions.push(callback);
      return () => {
        subscriptions = subscriptions.filter((sub) => sub !== callback);
      };
    },
  };
};

export type Tracer = ReturnType<typeof createTracer>;

export const useTracer = (): Tracer => useMemo(() => createTracer(), []);
