import { describe, expect, it } from 'vitest';

import { toSpringDynamics, toSpringPhysics } from '#src/spring-parameters.js';

describe('spring parameter conversion', () => {
  it('matches the reference tuner and defaults mass to one', () => {
    expect(toSpringDynamics({ stiffness: 484, damping: 35.2 })).toEqual({
      angularFrequency: 22,
      dampingRatio: 0.8,
      mass: 1,
    });
    expect(toSpringPhysics({ angularFrequency: 22, dampingRatio: 0.8 })).toEqual({
      stiffness: 484,
      damping: 35.2,
      mass: 1,
    });
  });

  it('expresses the chat flight and critical scroll spring', () => {
    expect(toSpringPhysics({ angularFrequency: 20, dampingRatio: 0.8 })).toEqual({
      stiffness: 400,
      damping: 32,
      mass: 1,
    });
    expect(toSpringPhysics({ angularFrequency: 30, dampingRatio: 1 })).toEqual({
      stiffness: 900,
      damping: 60,
      mass: 1,
    });
  });

  it.each([
    { stiffness: 700, damping: 40, mass: 1 },
    { stiffness: 123.4, damping: 17.8, mass: 2.5 },
    { stiffness: 80, damping: 0, mass: 0.25 },
    { stiffness: 40, damping: 100, mass: 3 },
  ])('round-trips physical coefficients including mass: %o', (physics) => {
    const result = toSpringPhysics(toSpringDynamics(physics));
    expect(result.stiffness).toBeCloseTo(physics.stiffness, 10);
    expect(result.damping).toBeCloseTo(physics.damping, 10);
    expect(result.mass).toBe(physics.mass);
  });

  it('preserves dynamics when normalizing mass', () => {
    const dynamics = toSpringDynamics({ stiffness: 1200, damping: 96, mass: 3 });
    expect(toSpringPhysics({ ...dynamics, mass: 1 })).toEqual({ stiffness: 400, damping: 32, mass: 1 });
  });

  it('slows the spring without changing its damping ratio', () => {
    const dynamics = toSpringDynamics({ stiffness: 625, damping: 40 });
    const slower = toSpringPhysics({ ...dynamics, angularFrequency: dynamics.angularFrequency / 1.25 });
    expect(slower).toEqual({ stiffness: 400, damping: 32, mass: 1 });
    expect(toSpringDynamics(slower).dampingRatio).toBe(dynamics.dampingRatio);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid positive parameters: %s', (value) => {
    expect(() => toSpringDynamics({ stiffness: value, damping: 32 })).toThrow(RangeError);
    expect(() => toSpringDynamics({ stiffness: 400, damping: 32, mass: value })).toThrow(RangeError);
    expect(() => toSpringPhysics({ angularFrequency: value, dampingRatio: 0.8 })).toThrow(RangeError);
    expect(() => toSpringPhysics({ angularFrequency: 20, dampingRatio: 0.8, mass: value })).toThrow(RangeError);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid damping: %s', (value) => {
    expect(() => toSpringDynamics({ stiffness: 400, damping: value })).toThrow(RangeError);
    expect(() => toSpringPhysics({ angularFrequency: 20, dampingRatio: value })).toThrow(RangeError);
  });
});
