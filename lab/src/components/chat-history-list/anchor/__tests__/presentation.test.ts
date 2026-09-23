/** Splitting a reading offset into a scrollTop the browser keeps and a spacer. */

import { describe, expect, it } from 'vitest';

import { alignedScrollStep, presentReadingOffset } from '../presentation.js';

describe('alignedScrollStep', () => {
  it.each([
    // Headed Chromium at the screen's own ratio: the step is already one device pixel.
    [0.5, 2, 0.5],
    [1 / 3, 3, 1 / 3],
    [1, 1, 1],
    // Safari: whole CSS pixels, a whole number of device pixels at any integer ratio.
    [1, 2, 1],
    [1, 3, 1],
    // A step that is not a whole number of device pixels widens until it is.
    [0.5, 1, 1],
    [0.5, 3, 1],
    [0.5, 1.5, 2],
    [0.5, 1.25, 4],
  ])('step %s at %sx is %s', (step, ratio, aligned) => {
    expect(alignedScrollStep(step, ratio)).toBeCloseTo(aligned, 12);
  });

  it('absorbs the error of a measured step', () => {
    expect(alignedScrollStep(0.333333, 3)).toBe(1 / 3);
  });

  it('rejects steps and ratios that are not positive', () => {
    expect(() => alignedScrollStep(0, 2)).toThrow(RangeError);
    expect(() => alignedScrollStep(0.5, Number.NaN)).toThrow(RangeError);
  });
});

describe('presentReadingOffset', () => {
  it('rounds scrollTop up to the step and puts the remainder in the spacer', () => {
    expect(presentReadingOffset(100.3, 1)).toEqual({ scrollTop: 101, spacer: expect.closeTo(0.7, 12) });
    expect(presentReadingOffset(100.3, 0.5)).toEqual({ scrollTop: 100.5, spacer: expect.closeTo(0.2, 12) });
    expect(presentReadingOffset(7, 4)).toEqual({ scrollTop: 8, spacer: 1 });
  });

  it('needs no spacer on the step', () => {
    expect(presentReadingOffset(100, 1)).toEqual({ scrollTop: 100, spacer: 0 });
    expect(presentReadingOffset(0, 0.5)).toEqual({ scrollTop: 0, spacer: 0 });
  });

  it('keeps content exactly at the reading offset', () => {
    const offsets = Array.from({ length: 500 }, (_, index) => index * 0.7371 + 0.0123);
    const errors = offsets.map((offset) => {
      const { scrollTop, spacer } = presentReadingOffset(offset, 1 / 3);
      return Math.abs(scrollTop - spacer - offset);
    });
    expect(Math.max(...errors)).toBeLessThan(1e-9);
  });

  it('keeps the spacer within one step and never negative', () => {
    const spacers = Array.from({ length: 500 }, (_, index) => presentReadingOffset(index * 1.37 + 0.2, 0.5).spacer);
    expect(Math.min(...spacers)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...spacers)).toBeLessThan(0.5);
  });

  it('snaps a rounding error above a step boundary instead of adding a whole step', () => {
    const offset = 3 * 0.1 * 10; // 3.0000000000000004
    expect(presentReadingOffset(offset, 1)).toEqual({ scrollTop: 3, spacer: 0 });
  });

  it('presents a reading offset just below zero, at the top of the list, with scrollTop 0', () => {
    expect(presentReadingOffset(-0.25, 1)).toEqual({ scrollTop: -0, spacer: 0.25 });
  });
});
