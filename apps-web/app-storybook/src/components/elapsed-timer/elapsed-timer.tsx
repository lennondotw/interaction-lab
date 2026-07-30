import { cn } from '@monorepo/utils';
import { motion, useAnimationFrame, useMotionValue, useTransform, type MotionValue } from 'motion/react';
import { useEffect, useState, type FC } from 'react';
import { formatElapsed, TICK_INTERVAL_MS, type TimerPrecision } from './precision.js';

export interface ElapsedTimerProps {
  /**
   * When the thing being timed began. Omit to anchor at mount, i.e.
   * "counting from now".
   */
  startTime?: Date | number;
  /** @default 'seconds' */
  precision?: TimerPrecision;
  /**
   * Renders this string instead and stops all scheduling. For showing a
   * settled duration once the underlying task has finished, without
   * having to swap the element out for a plain span.
   */
  frozenValue?: string;
  className?: string;
}

/**
 * Live "time since" readout.
 *
 * Updates without re-rendering: the elapsed milliseconds live in a
 * MotionValue, and Motion writes the formatted string straight to the
 * text node. A timer ticking at millisecond precision therefore costs one
 * `textContent` assignment per frame rather than a React render.
 *
 * @example
 * ```tsx
 * <ElapsedTimer startTime={task.createdAt} precision="seconds" />
 * ```
 */
export const ElapsedTimer: FC<ElapsedTimerProps> = ({ startTime, precision = 'seconds', frozenValue, className }) => {
  // Anchoring in a lazy initialiser rather than the render body keeps
  // render pure, and — because the value survives re-renders — stops an
  // unanchored timer restarting from zero every time its parent happens
  // to re-render.
  const [mountedAt] = useState(() => Date.now());
  const startMs = startTime === undefined ? mountedAt : toMilliseconds(startTime);

  if (frozenValue !== undefined) return <span className={className}>{frozenValue}</span>;

  const intervalMs = TICK_INTERVAL_MS[precision];

  // The two drivers are separate components rather than one hook with a
  // branch, because `useAnimationFrame` registers a keep-alive frame
  // callback: subscribing unconditionally would hold Motion's frame loop
  // open for a timer that only needs to wake once a minute.
  return intervalMs === null ? (
    <FrameDrivenTimer startMs={startMs} precision={precision} className={className} />
  ) : (
    <TimeoutDrivenTimer startMs={startMs} precision={precision} intervalMs={intervalMs} className={className} />
  );
};

function toMilliseconds(startTime: Date | number): number {
  return typeof startTime === 'number' ? startTime : startTime.getTime();
}

/**
 * Elapsed-since-`startMs`, seeded at the driver's own mount so the first
 * paint is already correct: a timer anchored an hour ago must not flash
 * `0 s` before its first tick lands, and switching precision — which
 * swaps one driver for the other — must not rewind the readout for a
 * frame.
 */
function useElapsedValue(startMs: number): MotionValue<number> {
  const [seed] = useState(() => Date.now() - startMs);
  return useMotionValue(seed);
}

interface DriverProps {
  startMs: number;
  precision: TimerPrecision;
  className?: string;
}

/** Wakes once per unit, on the boundary. For `minutes` / `seconds` / `tenths`. */
const TimeoutDrivenTimer: FC<DriverProps & { intervalMs: number }> = ({
  startMs,
  precision,
  intervalMs,
  className,
}) => {
  const elapsed = useElapsedValue(startMs);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const tick = (): void => {
      const now = Date.now();
      elapsed.set(now - startMs);

      // Aim at the next boundary of the *start time* rather than
      // `now + interval`. A fixed interval accumulates however late each
      // callback happened to run, so the readout drifts and eventually
      // skips a unit outright. Re-deriving the target from `startMs`
      // every tick means lateness is absorbed instead of compounded.
      //
      // `floor + 1` rather than `ceil`: landing exactly on a boundary has
      // to schedule the *next* one, where `ceil` would hand back the
      // boundary just reached and burn a zero-delay wakeup.
      const nextBoundary = (Math.floor((now - startMs) / intervalMs) + 1) * intervalMs;
      timeoutId = setTimeout(tick, Math.max(0, startMs + nextBoundary - now));
    };

    tick();

    return () => clearTimeout(timeoutId);
  }, [startMs, intervalMs, elapsed]);

  return <TimerText elapsed={elapsed} precision={precision} className={className} />;
};

/**
 * Samples on every frame. For `hundredths` / `milliseconds`.
 *
 * Each sample is read from the wall clock rather than accumulated from
 * frame deltas, so a backgrounded tab — where the browser stops serving
 * frames entirely — resumes at the correct value instead of resuming
 * where it left off.
 */
const FrameDrivenTimer: FC<DriverProps> = ({ startMs, precision, className }) => {
  const elapsed = useElapsedValue(startMs);

  useAnimationFrame(() => {
    elapsed.set(Date.now() - startMs);
  });

  return <TimerText elapsed={elapsed} precision={precision} className={className} />;
};

const TimerText: FC<{ elapsed: MotionValue<number>; precision: TimerPrecision; className?: string }> = ({
  elapsed,
  precision,
  className,
}) => {
  const text = useTransform(elapsed, (ms) => formatElapsed(ms, precision));

  // `tabular-nums` by default, overridable: without it every digit change
  // reflows the string and the timer visibly twitches.
  //
  // Passing a MotionValue as the only child makes Motion subscribe and
  // write to the text node directly — no React render per tick.
  return <motion.span className={cn('tabular-nums', className)}>{text}</motion.span>;
};
