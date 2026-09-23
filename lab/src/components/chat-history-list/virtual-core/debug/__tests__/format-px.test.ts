/** Lengths in the state panel and flash labels keep a fixed width as they change. */

import { describe, expect, it } from 'vitest';

import { formatPx, signedPx } from '../playground-model.js';

describe('formatPx', () => {
  it('always shows two decimals', () => {
    expect(formatPx(0)).toBe('0.00px');
    expect(formatPx(12)).toBe('12.00px');
    expect(formatPx(7090.7749)).toBe('7090.77px');
    expect(formatPx(-369.314)).toBe('-369.31px');
  });

  it('reads a value that rounds to zero as 0.00, whatever its sign', () => {
    expect(formatPx(-0.001)).toBe('0.00px');
    expect(formatPx(-0)).toBe('0.00px');
  });
});

describe('signedPx', () => {
  it('spells out the sign', () => {
    expect(signedPx(1.52)).toBe('+1.52px');
    expect(signedPx(-1.52)).toBe('−1.52px');
  });

  it('shows no sign for a change that rounds to zero', () => {
    expect(signedPx(0)).toBe('0.00px');
    expect(signedPx(-0.004)).toBe('0.00px');
    expect(signedPx(0.004)).toBe('0.00px');
  });
});
