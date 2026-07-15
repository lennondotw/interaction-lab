import { describe, expect, it } from 'vitest';

import { createProgressiveTextMapping, getProgressiveTextUnitOpacity } from '../progressive-text-utils.js';

describe('createProgressiveTextMapping', () => {
  it('uses grapheme clusters and excludes whitespace from visible progress', () => {
    const mapping = createProgressiveTextMapping('A 👩‍💻 B');

    expect(mapping.units.map((unit) => unit.content)).toEqual(['A', ' ', '👩‍💻', ' ', 'B']);
    expect(mapping.units.map((unit) => unit.visibleIndex)).toEqual([0, null, 1, null, 2]);
    expect(mapping.visibleIndexToOriginalIndex).toEqual([0, 2, 8]);
    expect(mapping.visibleLength).toBe(3);
  });
});

describe('getProgressiveTextUnitOpacity', () => {
  it('is fully inactive at zero and fully active at one', () => {
    const parameters = {
      gradientWidth: 6,
      inactiveOpacity: 0.24,
      visibleLength: 20,
    };

    expect(getProgressiveTextUnitOpacity({ ...parameters, progress: 0, visibleIndex: 0 })).toBe(0.24);
    expect(getProgressiveTextUnitOpacity({ ...parameters, progress: 1, visibleIndex: 19 })).toBe(1);
  });

  it('keeps whitespace outside the opacity progression', () => {
    expect(
      getProgressiveTextUnitOpacity({
        gradientWidth: 6,
        inactiveOpacity: 0.24,
        progress: 0,
        visibleIndex: null,
        visibleLength: 20,
      })
    ).toBe(1);
  });
});
