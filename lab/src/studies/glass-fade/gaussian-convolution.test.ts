import { describe, expect, it } from 'vitest';

import { gaussianConvolution } from './gaussian-convolution.js';

const weightsOf = (radius: number, target: number, dpr: number) =>
  gaussianConvolution(radius, target, dpr).matrix.split(' ').map(Number);

describe('Gaussian convolution', () => {
  it('preserves constant colours and has no directional bias', () => {
    const weights = weightsOf(8.889, 20, 2);
    expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 12);
    expect(weights).toEqual(weights.toReversed());
  });

  it('matches the requested variance in bitmap pixels within truncation error', () => {
    for (const dpr of [1, 2]) {
      const weights = weightsOf(20, 20, dpr);
      const centre = (weights.length - 1) / 2;
      const variance = weights.reduce((sum, weight, index) => sum + weight * (index - centre) ** 2, 0);
      expect(variance / (20 * dpr) ** 2).toBeGreaterThan(0.97);
      expect(variance / (20 * dpr) ** 2).toBeLessThan(1);
    }
  });

  it('keeps support fixed across the ramp and uses an exact identity at zero', () => {
    const start = gaussianConvolution(0, 20, 2);
    const full = gaussianConvolution(20, 20, 2);
    expect(start.order).toBe(full.order);
    expect(start.half).toBe(full.half);
    expect(start.passes).toBe(full.passes);
    const weights = weightsOf(0, 20, 2);
    expect(weights[start.half]).toBe(1);
    expect(weights.reduce((sum, weight) => sum + weight, 0)).toBe(1);
  });

  it('splits larger targets within the renderer limit while preserving total variance', () => {
    for (const dpr of [1, 2, 3]) {
      const kernel = gaussianConvolution(48, 48, dpr);
      const weights = weightsOf(48, 48, dpr);
      const variance = weights.reduce((sum, weight, index) => sum + weight * (index - kernel.half) ** 2, 0);
      expect(kernel.order).toBeLessThanOrEqual(255);
      expect(kernel.passes).toBeGreaterThan(1);
      expect((variance * kernel.passes) / (48 * dpr) ** 2).toBeGreaterThan(0.97);
      expect(gaussianConvolution(0, 48, dpr).passes).toBe(kernel.passes);
    }
  });
});
