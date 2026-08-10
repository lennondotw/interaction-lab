/**
 * The disclosure spring's two claims, pinned down.
 *
 * Both are the kind of thing that survives a careless edit and shows up later as a
 * list of rows that bounces, or as motion nobody asked for — neither of which a
 * DOM-less test suite could catch any other way.
 */

import { describe, expect, it } from 'vitest';

import { DISCLOSURE_SPRING, disclosureTransition, NO_TRANSITION } from '../file-tree-motion.js';

describe('DISCLOSURE_SPRING', () => {
  it('is critically damped', () => {
    const { damping, mass, stiffness } = DISCLOSURE_SPRING as { damping: number; mass: number; stiffness: number };

    // `damping = 2√(stiffness · mass)` is a damping ratio of exactly 1: the fastest
    // approach to the target that does not pass it. Retune `stiffness` without
    // re-deriving `damping` and the height overshoots — every row below the folder
    // travels past where it belongs and comes back.
    expect(damping).toBeCloseTo(2 * Math.sqrt(stiffness * mass), 6);
  });

  it('settles in around a tenth of a second', () => {
    const { mass, stiffness } = DISCLOSURE_SPRING as { mass: number; stiffness: number };

    // At critical damping the envelope decays as e^(−ωt) with ω = √(k/m), so four
    // time constants is within 2% of the target. A guard on the order of magnitude,
    // not the exact figure: this is a disclosure, not a page transition.
    const settleMs = (4 / Math.sqrt(stiffness / mass)) * 1000;

    expect(settleMs).toBeGreaterThan(60);
    expect(settleMs).toBeLessThan(200);
  });
});

describe('disclosureTransition', () => {
  it('takes the end state instantly when reduced motion is asked for', () => {
    expect(disclosureTransition(true)).toBe(NO_TRANSITION);
    expect(NO_TRANSITION.duration).toBe(0);
  });

  it('springs otherwise, including before the media query has resolved', () => {
    // `useReducedMotion` hands back `null` until it has an answer, and an unresolved
    // query is not a request for no motion.
    expect(disclosureTransition(false)).toBe(DISCLOSURE_SPRING);
    expect(disclosureTransition(null)).toBe(DISCLOSURE_SPRING);
  });
});
