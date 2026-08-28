import { describe, expect, it } from 'vitest';

import {
  createProgressiveTextMapping,
  getProgressiveTextUnitColor,
  getProgressiveTextUnitOpacity,
  getProgressiveTextUnitProgress,
} from '../progressive-text-utils.js';

describe('createProgressiveTextMapping', () => {
  it('uses grapheme clusters and excludes whitespace from visible progress', () => {
    const mapping = createProgressiveTextMapping('A 👩‍💻 B');

    expect(mapping.units.map((unit) => unit.content)).toEqual(['A', ' ', '👩‍💻', ' ', 'B']);
    expect(mapping.units.map((unit) => unit.visibleIndex)).toEqual([0, null, 1, null, 2]);
    expect(mapping.visibleIndexToOriginalIndex).toEqual([0, 2, 8]);
    expect(mapping.visibleLength).toBe(3);
  });
});

describe('getProgressiveTextUnitProgress', () => {
  it('lets color use a shorter buffer while staying aligned to the opacity reveal front', () => {
    const sharedParameters = {
      progress: 0.5,
      visibleIndex: 11,
      visibleLength: 20,
    };

    const opacityProgress = getProgressiveTextUnitProgress({
      ...sharedParameters,
      gradientWidth: 6,
    });
    const colorProgress = getProgressiveTextUnitProgress({
      ...sharedParameters,
      gradientWidth: 1,
      sequenceGradientWidth: 6,
    });

    expect(opacityProgress).toBeGreaterThan(0);
    expect(opacityProgress).toBeLessThan(1);
    expect(colorProgress).toBe(1);
  });

  it('mixes progressive colors in OKLCH', () => {
    expect(
      getProgressiveTextUnitColor({
        activeColor: '#0ea5e9',
        gradientWidth: 1,
        inactiveColor: '#171717',
        progress: 0.5,
        sequenceGradientWidth: 6,
        visibleIndex: 12.5,
        visibleLength: 20,
      })
    ).toBe('color-mix(in oklch, #171717 50%, #0ea5e9 50%)');
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
