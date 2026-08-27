import { describe, expect, it } from 'vitest';

import {
  CHORD_MENU_ANCHOR,
  CHORD_MENU_BOTTOM_GAP,
  CHORD_MENU_COLLAPSED_OFFSET,
  resolveChordMenuBottomOffset,
} from '../chord-menu-layout.js';

describe('resolveChordMenuBottomOffset', () => {
  it('centres a menu small enough to fit on the anchor', () => {
    // A 24px one-liner centres on the anchor, putting its bottom edge 12px above it.
    expect(resolveChordMenuBottomOffset(24)).toBe(CHORD_MENU_ANCHOR - 12);
  });

  it('pins the bottom edge once centring would push it past the gap', () => {
    // The two rules meet at 40px tall: 60 − 20 = 40.
    expect(resolveChordMenuBottomOffset(40)).toBe(CHORD_MENU_BOTTOM_GAP);
    expect(resolveChordMenuBottomOffset(260)).toBe(CHORD_MENU_BOTTOM_GAP);
    expect(resolveChordMenuBottomOffset(4000)).toBe(CHORD_MENU_BOTTOM_GAP);
  });

  it('shares one bottom edge across every level a real menu can be', () => {
    // Which is the point of pinning: levels line up along the bottom and differ only in how far
    // up they reach, rather than each floating at its own centre.
    expect(resolveChordMenuBottomOffset(260)).toBe(resolveChordMenuBottomOffset(60));
  });

  it('leaves the anchor inside a tall card rather than at its centre', () => {
    expect(CHORD_MENU_ANCHOR - resolveChordMenuBottomOffset(260)).toBe(20);
  });
});

describe('CHORD_MENU_COLLAPSED_OFFSET', () => {
  it('is the anchor, so opening and closing pass through one point', () => {
    expect(CHORD_MENU_COLLAPSED_OFFSET).toBe(CHORD_MENU_ANCHOR);
    expect(CHORD_MENU_COLLAPSED_OFFSET).not.toBe(resolveChordMenuBottomOffset(260));
  });
});
