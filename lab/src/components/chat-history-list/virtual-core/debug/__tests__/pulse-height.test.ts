/** The pulsing row's height curve: at rest at the base, peaking half a period later. */

import { describe, expect, it } from 'vitest';

import { pulseAmplitude, pulseBaseHeight, pulseHeight, pulsePeriod } from '../playground-model.js';

describe('pulseHeight', () => {
  it('starts at the base height and returns to it every period', () => {
    expect(pulseHeight(0)).toBe(pulseBaseHeight);
    expect(pulseHeight(pulsePeriod * 3)).toBeCloseTo(pulseBaseHeight, 9);
  });

  it('peaks at the base plus the amplitude half a period in', () => {
    expect(pulseHeight(pulsePeriod / 2)).toBeCloseTo(pulseBaseHeight + pulseAmplitude, 9);
  });

  it('never falls below the base height', () => {
    const samples = Array.from({ length: 400 }, (_, step) => pulseHeight((step * pulsePeriod) / 97));
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(pulseBaseHeight - 1e-9);
  });
});
