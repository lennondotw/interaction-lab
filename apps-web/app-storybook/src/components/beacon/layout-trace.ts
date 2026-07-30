/**
 * Instrumentation for the beacon layout-observation probes.
 *
 * The subject is `useBeaconAnchor`'s observation cascade: five sources wired to
 * one `measure()` (self `ResizeObserver`, an ancestor RO cascade, a capture-phase
 * window `scroll` listener, a window `resize` listener, and the
 * `IntersectionObserver` layout-shift trick). The question each probe asks is
 * which of them actually catches which kind of layout change.
 *
 * Two measurement choices are load-bearing:
 *
 * - The beacon box is read from the **store entry's raw MotionValues**, not from
 *   the follower's painted rect. The follower runs springs; sampling it would
 *   turn spring easing into apparent observation lag and make every row of every
 *   table meaningless.
 * - The target box is read from `getBoundingClientRect`, differenced against the
 *   container — deliberately *not* the `offsetParent` walk the hook itself uses.
 *   An independent instrument can disagree with the subject, which is the only
 *   way a measurement bug can show up as a number rather than as agreement
 *   between two copies of the same mistake.
 */

import { useMemo } from 'react';

export type LayoutTraceKind = 'case' | 'setup' | 'baseline' | 'mutate' | 'frames' | 'settle' | 'verdict';

export interface LayoutTraceEntry {
  /** ms since the current run started. */
  t: number;
  kind: LayoutTraceKind;
  text: string;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * `offsetLeft` / `offsetTop` are integers while `getBoundingClientRect` is not,
 * so a target sitting on a half pixel reports a permanent sub-pixel delta. One
 * pixel is the floor of what this instrument can resolve; anything at or below
 * it counts as agreement.
 */
export const MATCH_EPSILON = 1;

export const boxDelta = (a: Box, b: Box): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w), Math.abs(a.h - b.h));

/** One decimal: sub-pixel disagreement is signal, ten decimals of it is not. */
export const fmt = (n: number): string => (Math.round(n * 10) / 10).toString();

export const boxText = (b: Box): string => `${fmt(b.x)},${fmt(b.y)} ${fmt(b.w)}×${fmt(b.h)}`;

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
 * Per-frame delta series across a mutation.
 *
 * Sampling has to be a plain rAF loop over a numeric reader with no React in
 * it: every logged line re-renders the trace panel, and a render landing inside
 * the sampling window would compete for the same frames it is trying to
 * measure. Callers log before they start and after they stop, never during.
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
 * The delta series as one readable line, runs of equal values collapsed to
 * `value×count`. A tail long enough to catch a late recovery is also long enough
 * to bury the interesting first ten frames in a hundred repetitions of the same
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
  /** Largest delta seen at any sampled frame — the worst visible error. */
  maxDelta: number;
  /** Delta at the last sampled frame. Non-zero means the change was missed. */
  settledDelta: number;
  /**
   * Whether any sampled frame ever disagreed. False means the cascade closed
   * the gap faster than a frame — a real outcome, not a missing measurement,
   * and worth telling apart from "never recovered".
   */
  sawGap: boolean;
  /** Frames from the first frame that saw the change to the frame that fixed it. */
  frames: number | null;
  /** Same span in ms. */
  lagMs: number | null;
}

/**
 * Reduce a delta series to the numbers that decide a case.
 *
 * `frames` / `lagMs` are measured from the first frame that *saw* the change
 * rather than from the mutation call, because a mutation applied between frames
 * is not observable until the next one — counting from the call would bill the
 * cascade for the browser's frame boundary.
 */
export const verdictOf = (samples: readonly DeltaSample[]): Verdict => {
  const deltas = samples.map((s) => s.d);
  const maxDelta = deltas.length ? Math.max(...deltas) : 0;
  const settledDelta = deltas.length ? (deltas.at(-1) ?? 0) : 0;

  const firstBad = samples.findIndex((s) => s.d > MATCH_EPSILON);
  if (firstBad === -1) return { maxDelta, settledDelta, sawGap: false, frames: null, lagMs: null };

  // The *last* bad frame, not the first good one after `firstBad`. A multi-frame
  // mutation can be tracked, fall behind, and be tracked again — an inner scroll
  // that leaves the clip does exactly that. Taking the first recovery reports
  // "recovered in 1 frame" next to a settled Δ of 80px, which is two true
  // numbers making one false claim.
  const lastBad = samples.reduce((acc, s, i) => (s.d > MATCH_EPSILON ? i : acc), -1);
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

export const createLayoutTracer = () => {
  let t0 = 0;
  let entries: LayoutTraceEntry[] = [];
  let subscriptions: (() => void)[] = [];

  return {
    log: (kind: LayoutTraceKind, text: string): void => {
      entries = [...entries, { t: Math.round(performance.now() - t0), kind, text }];
      subscriptions.forEach((sub) => sub());
    },

    reset: (): void => {
      t0 = performance.now();
      entries = [];
      subscriptions.forEach((sub) => sub());
    },

    getEntries: (): readonly LayoutTraceEntry[] => entries,

    subscribe: (callback: () => void): (() => void) => {
      subscriptions.push(callback);
      return () => {
        subscriptions = subscriptions.filter((sub) => sub !== callback);
      };
    },
  };
};

export type LayoutTracer = ReturnType<typeof createLayoutTracer>;

export const useLayoutTracer = (): LayoutTracer => useMemo(() => createLayoutTracer(), []);
