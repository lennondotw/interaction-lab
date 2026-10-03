import { describe, expect, it } from 'vitest';

import { closeTabWidths } from '../tab-close-layout.js';

function span(widths: readonly number[]) {
  return widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * 4;
}

describe('close target layout', () => {
  it.each([0, 3, 6])('keeps widths and puts the right neighbor at the closed tab edge (index %s)', (index) => {
    const widths = Array<number>(8).fill(80);
    const next = closeTabWidths(widths, index, 4, 176);
    expect(next).toEqual(Array<number>(7).fill(80));
    expect(span(next.slice(0, index + 1))).toBe(span(widths.slice(0, index + 1)));
  });

  it('keeps the full right edge when closing the last tab', () => {
    const widths = Array<number>(8).fill(80);
    const next = closeTabWidths(widths, 7, 4, 176);
    expect(span(next)).toBeCloseTo(span(widths), 10);
    expect(next).toEqual(Array<number>(7).fill(92));
  });

  it('keeps the same edge over repeated tail closes until the base width caps expansion', () => {
    let widths = Array<number>(8).fill(80);
    const before = span(widths);
    for (let count = 7; count >= 4; count--) {
      widths = closeTabWidths(widths, widths.length - 1, 4, 176);
      expect(widths).toHaveLength(count);
      expect(span(widths)).toBeCloseTo(before, 10);
      expect(Math.max(...widths)).toBeLessThanOrEqual(176);
    }
    widths = closeTabWidths(widths, 3, 4, 176);
    expect(widths).toEqual([176, 176, 176]);
    expect(span(widths)).toBeLessThan(before);
  });

  it('uses the held layout after a middle close as the next tail-close budget', () => {
    const middleClosed = closeTabWidths(Array<number>(8).fill(80), 3, 4, 176);
    const tailClosed = closeTabWidths(middleClosed, 6, 4, 176);
    expect(span(tailClosed)).toBeCloseTo(span(middleClosed), 10);
  });

  it('preserves individual widths when a right-hand tab remains', () => {
    expect(closeTabWidths([100.5, 100.49, 100.5], 1, 4, 176)).toEqual([100.5, 100.5]);
  });

  it('removes the final tab without inventing a remaining footprint', () => {
    expect(closeTabWidths([176], 0, 4, 176)).toEqual([]);
  });
});
