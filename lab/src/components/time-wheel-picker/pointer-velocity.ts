/**
 * Release velocity from a short history of pointer samples.
 *
 * `MotionValue.getVelocity()` exists and would save this file, but it derives
 * velocity from exactly two samples — `current - prevFrameValue` over
 * `updatedAt - prevUpdatedAt` — so one jittery final `pointermove` sets the whole
 * fling. On a wheel that reads as the picker occasionally spinning forty rows
 * from a flick meant to move three, intermittently and only on some hardware.
 *
 * Averaging over a window instead costs one array and removes that class of bug.
 * Motion's own drag gesture keeps a comparable history for the same reason; this
 * is that idea, small enough to be a pure function and therefore testable, which
 * matters in a repo with no jsdom.
 */

export interface PointerSample {
  /** `performance.now()` at the sample. */
  time: number;
  /** Pointer position along the wheel's axis, in client pixels. */
  y: number;
}

export interface TrackVelocityOptions {
  samples: readonly PointerSample[];
  /** When the release happened. Compared against the last sample to detect a pause. */
  now: number;
  /** How far back to average. Longer is smoother and less responsive to a late flick. */
  window?: number;
  /**
   * A pointer that stopped moving for longer than this is placing the wheel, not
   * throwing it. Without this, holding still for a moment and letting go inherits
   * whatever velocity the gesture had before the pause.
   */
  staleAfter?: number;
}

/** Pixels per second along the axis, signed the same way as the samples. */
export const trackVelocity = ({ samples, now, window = 80, staleAfter = 100 }: TrackVelocityOptions): number => {
  const last = samples.at(-1);
  const first = samples.at(0);
  if (last === undefined || first === undefined || samples.length < 2) return 0;
  if (now - last.time > staleAfter) return 0;

  // The oldest sample still inside the window. Falling back to `first` keeps a
  // gesture shorter than one window from reporting no velocity at all.
  let oldest = first;
  for (const sample of samples) {
    if (last.time - sample.time <= window) {
      oldest = sample;
      break;
    }
  }

  const elapsed = last.time - oldest.time;
  if (elapsed <= 0) return 0;
  return ((last.y - oldest.y) / elapsed) * 1000;
};

/** Appends a sample and drops what has aged out of the window. */
export const pushSample = (
  samples: PointerSample[],
  sample: PointerSample,
  { window = 80 }: { window?: number } = {}
): void => {
  samples.push(sample);
  // Keep one sample older than the window so a gesture that ends mid-window
  // still has something to measure against.
  while (samples.length > 2 && sample.time - (samples[1]?.time ?? sample.time) > window) {
    samples.shift();
  }
};
