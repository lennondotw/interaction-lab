/**
 * Unit tests for the elastic scale algorithm — the mathematical
 * properties the effect depends on, plus the edge cases that would
 * otherwise only show up as a visual glitch.
 */

import { describe, expect, it } from 'vitest';

import {
  calculateElasticScale,
  calculateItemsElasticScale,
  calculateScale,
  DEFAULT_MAX_SCALE,
  generateItemPositions,
  getItemCenter,
  integrateScale,
  isWithinInteractiveRange,
} from '../elastic-scale.js';

/** Indexed read that fails the test loudly instead of asserting non-null. */
function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new Error(`expected an element at index ${index}`);
  return value;
}

describe('calculateScale', () => {
  it('peaks at exactly maxScale under the cursor', () => {
    expect(calculateScale(100, 100, 2.5)).toBe(2.5);
  });

  it('decays to ~1 far from the cursor', () => {
    const cursor = 100;
    const sigma = 50;
    const far = 4 * sigma;

    // At 4 sigma the Gaussian is ≈ 0.0003, so scale ≈ 1.0005.
    expect(calculateScale(cursor - far, cursor, 2.5, sigma)).toBeCloseTo(1, 2);
    expect(calculateScale(cursor + far, cursor, 2.5, sigma)).toBeCloseTo(1, 2);
  });

  it('is symmetric around the cursor', () => {
    expect(calculateScale(70, 100)).toBe(calculateScale(130, 100));
  });

  it('never returns a scale below 1 — items only ever grow', () => {
    for (const position of [0, 50, 100, 150, 200, 500, 1000]) {
      expect(calculateScale(position, 100)).toBeGreaterThanOrEqual(1);
    }
  });

  it('decays more slowly with a larger sigma', () => {
    const tight = calculateScale(150, 100, 2.5, 30);
    const wide = calculateScale(150, 100, 2.5, 100);
    expect(wide).toBeGreaterThan(tight);
  });

  it('falls back to the default maxScale and sigma', () => {
    expect(calculateScale(100, 100)).toBe(DEFAULT_MAX_SCALE);
  });
});

describe('integrateScale', () => {
  it('is 0 over a zero-width interval', () => {
    expect(integrateScale(100, 100, 100)).toBe(0);
  });

  it('reduces to b - a when the band is unstretched', () => {
    // Cursor far away, so scale ≈ 1 across the whole interval.
    expect(integrateScale(0, 100, 1000)).toBeCloseTo(100, 1);
  });

  it('flips sign with the direction of integration', () => {
    const forward = integrateScale(50, 150, 100);
    const backward = integrateScale(150, 50, 100);

    expect(forward).toBeCloseTo(-backward, 10);
    expect(forward).toBeGreaterThan(0);
    expect(backward).toBeLessThan(0);
  });

  it('exceeds b - a when the interval crosses the stretched region', () => {
    // 50 → 150 passes straight through the cursor at 100.
    expect(integrateScale(50, 150, 100, 2.5, 50)).toBeGreaterThan(100);
  });
});

describe('calculateElasticScale', () => {
  it('pins the anchor — zero translation exactly under the cursor', () => {
    const result = calculateElasticScale(100, { cursor: 100 });
    expect(result.translate).toBe(0);
    expect(result.scale).toBe(DEFAULT_MAX_SCALE);
  });

  it('pushes points before the cursor backwards', () => {
    expect(calculateElasticScale(50, { cursor: 100, maxScale: 2.5, sigma: 50 }).translate).toBeLessThan(0);
  });

  it('pushes points after the cursor forwards', () => {
    expect(calculateElasticScale(150, { cursor: 100, maxScale: 2.5, sigma: 50 }).translate).toBeGreaterThan(0);
  });

  it('displaces symmetric positions by equal and opposite amounts', () => {
    const before = calculateElasticScale(50, { cursor: 100 });
    const after = calculateElasticScale(150, { cursor: 100 });

    expect(Math.abs(before.translate)).toBeCloseTo(Math.abs(after.translate), 10);
    expect(before.translate).toBeLessThan(0);
    expect(after.translate).toBeGreaterThan(0);
    expect(before.scale).toBe(after.scale);
  });

  it('barely affects points far from the cursor', () => {
    const result = calculateElasticScale(500, { cursor: 100, maxScale: 2.5, sigma: 50 });
    expect(result.scale).toBeCloseTo(1, 2);
    // Only the cumulative area under the bell curve remains.
    expect(Math.abs(result.translate)).toBeLessThan(100);
  });

  it('keeps base + translate equal to the integrated position', () => {
    for (const base of [0, 50, 100, 150, 200]) {
      const result = calculateElasticScale(base, { cursor: 100 });
      const expected = 100 + integrateScale(100, base, 100);
      expect(base + result.translate).toBeCloseTo(expected, 10);
    }
  });
});

describe('calculateItemsElasticScale', () => {
  it('agrees with the single-point calculation', () => {
    const items = [
      { id: 'item-0', base: 0 },
      { id: 'item-1', base: 50 },
      { id: 'item-2', base: 100 },
    ];
    const params = { cursor: 50, maxScale: 2.0, sigma: 30 };

    const batch = calculateItemsElasticScale(items, params);

    for (const [i, item] of items.entries()) {
      const single = calculateElasticScale(item.base, params);
      expect(at(batch, i).scale).toBeCloseTo(single.scale, 10);
      expect(at(batch, i).translate).toBeCloseTo(single.translate, 10);
    }
  });

  it('preserves input order', () => {
    const results = calculateItemsElasticScale(
      [
        { id: 'first', base: 100 },
        { id: 'second', base: 50 },
        { id: 'third', base: 200 },
      ],
      { cursor: 100 }
    );

    expect(results.map((r) => r.id)).toEqual(['first', 'second', 'third']);
  });

  it('populates every output field consistently', () => {
    const result = at(calculateItemsElasticScale([{ id: 'test', base: 50 }], { cursor: 100 }), 0);

    expect(result.id).toBe('test');
    expect(result.base).toBe(50);
    expect(result.next).toBe(result.base + result.translate);
    expect(result.scale).toBeGreaterThan(1);
  });

  it('handles an empty list', () => {
    expect(calculateItemsElasticScale([], { cursor: 100 })).toEqual([]);
  });
});

describe('getItemCenter', () => {
  it('centres the first slot', () => {
    expect(getItemCenter(0, 16)).toBe(8);
  });

  it('advances by one item size per index', () => {
    expect(getItemCenter(1, 16)).toBe(24);
    expect(getItemCenter(2, 16)).toBe(40);
    expect(getItemCenter(5, 16)).toBe(88);
  });
});

describe('generateItemPositions', () => {
  const itemSize = 16;

  it('generates the requested count', () => {
    expect(generateItemPositions(5, itemSize)).toHaveLength(5);
  });

  it('generates sequential ids', () => {
    expect(generateItemPositions(3, itemSize).map((p) => p.id)).toEqual(['item-0', 'item-1', 'item-2']);
  });

  it('places every item at its slot centre', () => {
    const positions = generateItemPositions(3, itemSize);
    for (const [i, position] of positions.entries()) {
      expect(position.base).toBe(getItemCenter(i, itemSize));
    }
  });

  it('handles a zero count', () => {
    expect(generateItemPositions(0, itemSize)).toEqual([]);
  });
});

describe('isWithinInteractiveRange', () => {
  const totalSize = 80;

  it('accepts a cursor inside the range', () => {
    expect(isWithinInteractiveRange(30, totalSize)).toBe(true);
  });

  it('accepts both boundaries', () => {
    expect(isWithinInteractiveRange(0, totalSize)).toBe(true);
    expect(isWithinInteractiveRange(80, totalSize)).toBe(true);
  });

  it('rejects a cursor past either end', () => {
    expect(isWithinInteractiveRange(-100, totalSize)).toBe(false);
    expect(isWithinInteractiveRange(500, totalSize)).toBe(false);
  });

  it('rejects everything when there is nothing laid out', () => {
    expect(isWithinInteractiveRange(50, 0)).toBe(false);
  });

  it('widens the range by the padding on both sides', () => {
    expect(isWithinInteractiveRange(-5, totalSize, 10)).toBe(true);
    expect(isWithinInteractiveRange(85, totalSize, 10)).toBe(true);
    expect(isWithinInteractiveRange(-15, totalSize, 10)).toBe(false);
  });
});
