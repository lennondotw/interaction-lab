/**
 * How an elapsed duration is rendered, and how often it has to be
 * repainted to stay honest.
 *
 * @module precision
 */

export type TimerPrecision = 'minutes' | 'seconds' | 'tenths' | 'hundredths' | 'milliseconds';

export const MS_PER_SECOND = 1_000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Digits shown after the decimal point of the seconds field. */
const FRACTION_DIGITS: Record<TimerPrecision, number> = {
  minutes: 0,
  seconds: 0,
  tenths: 1,
  hundredths: 2,
  milliseconds: 3,
};

/**
 * How long the readout stays valid for, i.e. the smallest unit it shows.
 * A timer only has to wake up when its own output would change — so the
 * `minutes` readout sleeps for a whole minute rather than ticking once a
 * second and re-rendering the same string 59 times.
 *
 * `null` means "no useful interval": below roughly 100 ms a wall-clock
 * timer can no longer beat the display. It would either fire twice
 * between two paints (work nobody sees) or land just after one and show
 * a stale value for a whole frame. Those precisions ride the frame loop
 * instead, so the readout is sampled exactly when it is about to be
 * painted.
 */
export const TICK_INTERVAL_MS: Record<TimerPrecision, number | null> = {
  minutes: MS_PER_MINUTE,
  seconds: MS_PER_SECOND,
  tenths: 100,
  hundredths: null,
  milliseconds: null,
};

/**
 * Formats a duration as a compact, unit-labelled string — `2 m 5 s`,
 * `1 d 3 h`, `7.42 s`.
 *
 * Units that would read as zero are omitted, including in the middle of
 * the string: one hour and one second is `1 h 1 s`, not `1 h 0 m 1 s`.
 * The seconds field is the exception — it always appears (unless the
 * precision drops it altogether), so a running timer never loses the
 * digit that is actually moving.
 */
export function formatElapsed(elapsedMs: number, precision: TimerPrecision): string {
  // A start in the future — clock skew between client and server, or an
  // optimistic local record the server later stamps — would otherwise
  // render as a negative count.
  const elapsed = Math.max(0, elapsedMs);

  const days = Math.floor(elapsed / MS_PER_DAY);
  const hours = Math.floor((elapsed % MS_PER_DAY) / MS_PER_HOUR);
  const minutes = Math.floor((elapsed % MS_PER_HOUR) / MS_PER_MINUTE);
  const seconds = Math.floor((elapsed % MS_PER_MINUTE) / MS_PER_SECOND);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} d`);
  if (hours > 0) parts.push(`${hours} h`);
  if (minutes > 0) parts.push(`${minutes} m`);

  // The coarsest precision has no seconds field to fall back on, so it
  // needs a floor of its own: everything under a minute reads `0 m`.
  if (precision === 'minutes') return parts.length === 0 ? '0 m' : parts.join(' ');

  const digits = FRACTION_DIGITS[precision];
  parts.push(digits === 0 ? `${seconds} s` : `${seconds}.${fractionOfSecond(elapsed, digits)} s`);

  return parts.join(' ');
}

/** Sub-second remainder truncated to `digits` places, zero-padded. */
function fractionOfSecond(elapsedMs: number, digits: number): string {
  const scale = 10 ** (3 - digits);
  return Math.floor((elapsedMs % MS_PER_SECOND) / scale)
    .toString()
    .padStart(digits, '0');
}
