/**
 * What content is told to inset itself by.
 *
 * Three claims, each of which fails silently if broken — as content flush
 * against a floating bar, as a seam under an inset one, or as the whole
 * content area nudging down a few pixels on first paint.
 */

import { describe, expect, it } from 'vitest';

import { OVERLAY_CONTENT_GAP, resolveSafeTop } from '../container-context.js';

describe('resolveSafeTop', () => {
  it('clears a floating header and then some', () => {
    // Clearing the bar is not the same as sitting flush against its edge:
    // an overlay header ends in a visible material edge with no rule under
    // it, and content starting exactly there reads as clipped by it.
    expect(resolveSafeTop('overlay', 84)).toBe(84 + OVERLAY_CONTENT_GAP);
    expect(resolveSafeTop('overlay', 60)).toBe(60 + OVERLAY_CONTENT_GAP);
    expect(OVERLAY_CONTENT_GAP).toBeGreaterThan(0);
  });

  it('insets by nothing in inset mode, however tall the header is', () => {
    // The column has already placed the content area. A gap here would show
    // a strip of the view's own background between the chrome and the first
    // row — a seam, not air.
    expect(resolveSafeTop('inset', 84)).toBe(0);
    expect(resolveSafeTop('inset', 60)).toBe(0);
    expect(resolveSafeTop('inset', null)).toBe(0);
  });

  it('insets by nothing until the height is actually measured', () => {
    // Not the bare gap: an 8px inset that becomes 92px once the real number
    // lands is a visible nudge of the entire content area on first paint.
    expect(resolveSafeTop('overlay', null)).toBe(0);
  });
});
