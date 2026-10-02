import { describe, expect, it } from 'vitest';

import { collectScopeColumns } from '../scope-columns.js';

describe('scope device-pixel columns', () => {
  it.each([1, 1.25, 2, 3])('scrolls the entire raster rigidly at %sx DPR', (dpr) => {
    const samples = Array.from({ length: 120 }, (_, index) => ({ at: 1000 + index * 16, value: index + 1 }));
    const width = Math.round(534 * dpr);
    const barWidth = Math.round(2 * dpr);
    const reference = new Float64Array(width);
    const pixelsPerMs = 0.12 * dpr;
    collectScopeColumns(reference, samples, 4000, pixelsPerMs, barWidth);
    for (const now of [4004, 4016.7, 4033.4, 4100, 4137.9]) {
      const columns = new Float64Array(width);
      collectScopeColumns(columns, samples, now, pixelsPerMs, barWidth);
      const shift = columns.indexOf(1) - reference.indexOf(1);
      expect(shift).toBeLessThanOrEqual(0);
      expect([...columns.slice(0, width + shift)]).toEqual([...reference.slice(-shift)]);
      expect(
        new Set(samples.map((sample) => columns.indexOf(sample.value) - reference.indexOf(sample.value))).size
      ).toBe(1);
    }
  });

  it('retains the peak where samples overlap, independent of arrival order', () => {
    const samples = [
      { at: 50, value: 2 },
      { at: 50.2, value: 8 },
      { at: 50.1, value: 4 },
    ];
    const columns = new Float64Array(100);
    expect(collectScopeColumns(columns, samples, 100, 1, 4)).toBe(8);
    const forward = [...columns];
    expect(Math.max(...columns)).toBe(8);
    collectScopeColumns(columns, samples.toReversed(), 100, 1, 4);
    expect([...columns]).toEqual(forward);
  });

  it('keeps an idle interval empty and a zero sample occupied', () => {
    const columns = new Float64Array(100);
    collectScopeColumns(
      columns,
      [
        { at: 20, value: 0 },
        { at: 80, value: 4 },
      ],
      100,
      1,
      2
    );
    expect(columns[20]).toBe(0);
    expect(columns[50]).toBe(-Infinity);
    expect(columns[80]).toBe(4);
  });

  it('clips boundary bars and discards expired and future samples', () => {
    const columns = new Float64Array(10);
    const peak = collectScopeColumns(
      columns,
      [
        { at: -1, value: 100 },
        { at: 0, value: 2 },
        { at: 100, value: 3 },
        { at: 101, value: 100 },
      ],
      100,
      0.1,
      4
    );
    expect(peak).toBe(3);
    expect(columns[0]).toBe(2);
    expect(columns[9]).toBe(3);
    expect(columns[5]).toBe(-Infinity);
  });

  it('clears an old frame when reusing the buffer', () => {
    const columns = new Float64Array(10);
    collectScopeColumns(columns, [{ at: 50, value: 4 }], 100, 0.1, 2);
    expect(collectScopeColumns(columns, [], 200, 0.1, 2)).toBe(0);
    expect([...columns].every((value) => value === -Infinity)).toBe(true);
  });

  it.each([1, 1.25, 2, 3])(
    'reveals older history on resize without changing raster density or speed at %sx DPR',
    (dpr) => {
      const samples = Array.from({ length: 600 }, (_, i) => ({ at: i * 16, value: i + 1 }));
      const narrow = new Float64Array(Math.round(400 * dpr));
      const wide = new Float64Array(Math.round(800 * dpr));
      const pixelsPerMs = 0.12 * dpr;
      const barWidth = Math.round((120 * dpr) / 62.5);
      collectScopeColumns(narrow, samples, 10000, pixelsPerMs, barWidth);
      collectScopeColumns(wide, samples, 10000, pixelsPerMs, barWidth);
      expect([...wide.slice(-narrow.length)]).toEqual([...narrow]);
      expect(wide.find((v) => v !== -Infinity)).toBeLessThan(narrow.find((v) => v !== -Infinity)!);
      const nextNarrow = new Float64Array(narrow.length);
      const nextWide = new Float64Array(wide.length);
      collectScopeColumns(nextNarrow, samples, 10100, pixelsPerMs, barWidth);
      collectScopeColumns(nextWide, samples, 10100, pixelsPerMs, barWidth);
      const sampleValue = 550;
      const narrowShift = nextNarrow.indexOf(sampleValue) - narrow.indexOf(sampleValue);
      const wideShift = nextWide.indexOf(sampleValue) - wide.indexOf(sampleValue);
      expect(narrowShift).toBe(wideShift);
      expect(narrowShift).toBe(-Math.round(12 * dpr));
    }
  );
});
