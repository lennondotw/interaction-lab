/**
 * The measurement guard, pinned down.
 *
 * The hook around it needs a DOM and this suite has none, but the predicate is
 * the part that decides whether a wrong number reaches the layout — and it is
 * exactly the part a later "simplification" would drop as redundant.
 */

import { describe, expect, it } from 'vitest';

import { isMeasuredHeight } from '../use-header-height.js';

describe('isMeasuredHeight', () => {
  it('accepts a real header height', () => {
    expect(isMeasuredHeight(84)).toBe(true);
    expect(isMeasuredHeight(60)).toBe(true);
    // Fractional is fine — the caller ceils it rather than rejecting it.
    expect(isMeasuredHeight(59.5)).toBe(true);
  });

  it('rejects zero, which means layout has not happened yet', () => {
    // A header with content is never zero tall. Committing this would inset
    // the content by nothing for a frame, which is the overlap the
    // measurement exists to prevent.
    expect(isMeasuredHeight(0)).toBe(false);
  });

  it('rejects a negative or non-finite reading', () => {
    // Not reachable from `offsetHeight`, but `ResizeObserver` entries are
    // indexed into, and an absent box would arrive here as `NaN` if the
    // optional chain above it were ever loosened.
    expect(isMeasuredHeight(-1)).toBe(false);
    expect(isMeasuredHeight(Number.NaN)).toBe(false);
    expect(isMeasuredHeight(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
