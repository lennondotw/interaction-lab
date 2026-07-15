import { describe, expect, it } from 'vitest';

import {
  getRemappedStickyDisplacement,
  getStickyScrollCompensation,
  type StickyScrollGeometry,
} from '../sticky-scroll-remapping.js';

const geometry = {
  sectionHeight: 1800,
  stickyHeight: 900,
  viewportHeight: 900,
} satisfies StickyScrollGeometry;

const getVelocity = (progress: number, step = 0.000_001) => {
  const before = getRemappedStickyDisplacement(progress - step, geometry);
  const after = getRemappedStickyDisplacement(progress + step, geometry);
  const inputDistance = step * 2 * (geometry.viewportHeight + geometry.sectionHeight);

  return (after - before) / inputDistance;
};

describe('getRemappedStickyDisplacement', () => {
  it('preserves the native sticky endpoints and midpoint', () => {
    expect(getRemappedStickyDisplacement(0, geometry)).toBe(0);
    expect(getRemappedStickyDisplacement(0.5, geometry)).toBeCloseTo(900);
    expect(getRemappedStickyDisplacement(1, geometry)).toBeCloseTo(1800);
    expect(getStickyScrollCompensation(0, geometry)).toBeCloseTo(0);
    expect(getStickyScrollCompensation(0.5, geometry)).toBeCloseTo(0);
    expect(getStickyScrollCompensation(1, geometry)).toBeCloseTo(0);
  });

  it('keeps a slow drift through the sticky plateau', () => {
    expect(getVelocity(0.1)).toBeCloseTo(1, 4);
    expect(getVelocity(0.5)).toBeCloseTo(0.08, 4);
    expect(getVelocity(0.9)).toBeCloseTo(1, 4);
  });

  it('keeps the velocity profile continuous', () => {
    const sampleStep = 0.000_1;
    const velocities = Array.from({ length: 9998 }, (_, index) => getVelocity((index + 1) * sampleStep));
    const maximumVelocityJump = Math.max(
      ...velocities.slice(1).map((velocity, index) => Math.abs(velocity - (velocities[index] ?? velocity)))
    );

    expect(maximumVelocityJump).toBeLessThan(0.002);
  });
});
