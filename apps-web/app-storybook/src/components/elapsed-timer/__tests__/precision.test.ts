/**
 * Unit tests for the elapsed-duration formatter — the unit-carry and
 * truncation rules, plus the edge cases that would otherwise only ever be
 * noticed as a wrong-looking timer.
 */

import { describe, expect, it } from 'vitest';
import {
  formatElapsed,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  TICK_INTERVAL_MS,
  type TimerPrecision,
} from '../precision.js';

const ALL_PRECISIONS: TimerPrecision[] = ['minutes', 'seconds', 'tenths', 'hundredths', 'milliseconds'];

describe('formatElapsed', () => {
  describe('seconds precision', () => {
    it('shows a bare seconds count under a minute', () => {
      expect(formatElapsed(0, 'seconds')).toBe('0 s');
      expect(formatElapsed(7 * MS_PER_SECOND, 'seconds')).toBe('7 s');
    });

    it('truncates rather than rounds, so the displayed unit has elapsed', () => {
      expect(formatElapsed(1999, 'seconds')).toBe('1 s');
    });

    it('carries into minutes, hours and days', () => {
      expect(formatElapsed(2 * MS_PER_MINUTE + 5 * MS_PER_SECOND, 'seconds')).toBe('2 m 5 s');
      expect(formatElapsed(3 * MS_PER_HOUR + 4 * MS_PER_MINUTE + 5 * MS_PER_SECOND, 'seconds')).toBe('3 h 4 m 5 s');
      expect(formatElapsed(MS_PER_DAY + MS_PER_HOUR + MS_PER_MINUTE + MS_PER_SECOND, 'seconds')).toBe(
        '1 d 1 h 1 m 1 s'
      );
    });

    it('omits zero units, including in the middle of the string', () => {
      // The compact style trades `1 h 0 m 1 s` for `1 h 1 s`.
      expect(formatElapsed(MS_PER_HOUR + MS_PER_SECOND, 'seconds')).toBe('1 h 1 s');
      expect(formatElapsed(MS_PER_DAY, 'seconds')).toBe('1 d 0 s');
    });
  });

  describe('minutes precision', () => {
    it('floors to `0 m` below a minute, having no seconds field to fall back on', () => {
      expect(formatElapsed(0, 'minutes')).toBe('0 m');
      expect(formatElapsed(59 * MS_PER_SECOND, 'minutes')).toBe('0 m');
    });

    it('drops the seconds field once there is a coarser unit to show', () => {
      expect(formatElapsed(2 * MS_PER_MINUTE + 5 * MS_PER_SECOND, 'minutes')).toBe('2 m');
      expect(formatElapsed(MS_PER_HOUR + 30 * MS_PER_SECOND, 'minutes')).toBe('1 h');
    });
  });

  describe('sub-second precision', () => {
    it('truncates the fraction to the requested number of digits', () => {
      expect(formatElapsed(1234, 'tenths')).toBe('1.2 s');
      expect(formatElapsed(1234, 'hundredths')).toBe('1.23 s');
      expect(formatElapsed(1234, 'milliseconds')).toBe('1.234 s');
    });

    it('zero-pads so the readout never changes width', () => {
      expect(formatElapsed(1005, 'tenths')).toBe('1.0 s');
      expect(formatElapsed(1005, 'hundredths')).toBe('1.00 s');
      expect(formatElapsed(1005, 'milliseconds')).toBe('1.005 s');
      expect(formatElapsed(1050, 'milliseconds')).toBe('1.050 s');
    });

    it('keeps the fraction attached to the seconds field when larger units appear', () => {
      expect(formatElapsed(MS_PER_MINUTE + 2500, 'tenths')).toBe('1 m 2.5 s');
    });
  });

  describe('out-of-range input', () => {
    // Clock skew, or an optimistic local record the server later stamps.
    it.each([
      ['minutes', '0 m'],
      ['seconds', '0 s'],
      ['tenths', '0.0 s'],
      ['hundredths', '0.00 s'],
      ['milliseconds', '0.000 s'],
    ] satisfies [TimerPrecision, string][])(
      'clamps a start time in the future to zero at %s precision',
      (precision, expected) => {
        expect(formatElapsed(-5 * MS_PER_SECOND, precision)).toBe(expected);
      }
    );
  });
});

describe('TICK_INTERVAL_MS', () => {
  it('wakes exactly as often as the smallest displayed unit', () => {
    // The point of the table: a `minutes` readout must not tick once a
    // second and re-render the same string 59 times over.
    expect(TICK_INTERVAL_MS.minutes).toBe(MS_PER_MINUTE);
    expect(TICK_INTERVAL_MS.seconds).toBe(MS_PER_SECOND);
    expect(TICK_INTERVAL_MS.tenths).toBe(100);
  });

  it('defers to the frame loop below the point a timer can beat the display', () => {
    expect(TICK_INTERVAL_MS.hundredths).toBeNull();
    expect(TICK_INTERVAL_MS.milliseconds).toBeNull();
  });

  it('advancing by one interval always changes the readout', () => {
    // What makes boundary-aligned scheduling correct: if a full interval
    // could pass without the string changing, the timer would be waking
    // up for nothing.
    for (const precision of ALL_PRECISIONS) {
      const interval = TICK_INTERVAL_MS[precision];
      if (interval === null) continue;

      for (const base of [0, 999, 59_000, MS_PER_HOUR - 1]) {
        expect(formatElapsed(base + interval, precision)).not.toBe(formatElapsed(base, precision));
      }
    }
  });
});
