import { describe, expect, it } from 'vitest';

import {
  assertOddRows,
  drumOverscan,
  drumRadius,
  drumRow,
  indexFromOffset,
  nearestDetentOffset,
  nearestOffsetForIndex,
  rebaseOffset,
  rowIndex,
  rowSlots,
  rowTop,
  splitOffset,
  viewportHeight,
  wrapIndex,
} from '../wheel-geometry.js';

const ITEM_HEIGHT = 40;
const ROWS = 5;
const COUNT = 12;

/** What is on screen at an offset: which item each visible row shows, and where its top edge is. */
const snapshot = (offset: number, { count = COUNT, rows = ROWS } = {}): Map<number, number> => {
  const shown = new Map<number, number>();
  for (const slot of rowSlots({ rows })) {
    shown.set(
      rowIndex({ slot, offset, itemHeight: ITEM_HEIGHT, count }),
      rowTop({ slot, offset, itemHeight: ITEM_HEIGHT, rows })
    );
  }
  return shown;
};

describe('wrapIndex', () => {
  it('stays in range for negative indices, which a wheel scrolled up produces', () => {
    expect(wrapIndex(-1, 12)).toBe(11);
    expect(wrapIndex(-13, 12)).toBe(11);
    expect(wrapIndex(0, 12)).toBe(0);
    expect(wrapIndex(12, 12)).toBe(0);
    expect(wrapIndex(25, 12)).toBe(1);
  });
});

describe('assertOddRows', () => {
  it('refuses an even row count, which would leave no centred row', () => {
    expect(() => assertOddRows(4)).toThrow(/odd/u);
    expect(() => assertOddRows(0)).toThrow(/odd/u);
    expect(() => assertOddRows(3.5)).toThrow(/odd/u);
  });

  it('accepts odd counts', () => {
    expect(() => assertOddRows(1)).not.toThrow();
    expect(() => assertOddRows(7)).not.toThrow();
  });
});

describe('rowSlots', () => {
  it('renders one row more than the viewport holds, the extra one below', () => {
    expect(rowSlots({ rows: 5 })).toEqual([-2, -1, 0, 1, 2, 3]);
    expect(rowSlots({ rows: 1 })).toEqual([0, 1]);
  });

  it('covers the viewport at every fraction of a row', () => {
    const viewport = viewportHeight({ itemHeight: ITEM_HEIGHT, rows: ROWS });
    for (let step = 0; step < 20; step++) {
      const offset = (step / 20) * ITEM_HEIGHT;
      const tops = rowSlots({ rows: ROWS }).map((slot) =>
        rowTop({ slot, offset, itemHeight: ITEM_HEIGHT, rows: ROWS })
      );
      const highest = Math.min(...tops);
      const lowest = Math.max(...tops) + ITEM_HEIGHT;
      expect(highest, `top edge covered at offset ${offset}`).toBeLessThanOrEqual(0);
      expect(lowest, `bottom edge covered at offset ${offset}`).toBeGreaterThanOrEqual(viewport);
    }
  });
});

describe('splitOffset', () => {
  it('floors rather than truncates, so a wheel scrolled above zero still has a positive fraction', () => {
    expect(splitOffset(-ITEM_HEIGHT / 2, ITEM_HEIGHT)).toEqual({ base: -1, frac: 0.5 });
    expect(splitOffset(0, ITEM_HEIGHT)).toEqual({ base: 0, frac: 0 });
    expect(splitOffset(ITEM_HEIGHT * 2.25, ITEM_HEIGHT)).toEqual({ base: 2, frac: 0.25 });
  });
});

describe('indexFromOffset and nearestDetentOffset', () => {
  it('selects the row nearest the centre line', () => {
    expect(indexFromOffset(ITEM_HEIGHT * 2.4, ITEM_HEIGHT, COUNT)).toBe(2);
    expect(indexFromOffset(ITEM_HEIGHT * 2.6, ITEM_HEIGHT, COUNT)).toBe(3);
    expect(indexFromOffset(-ITEM_HEIGHT * 0.4, ITEM_HEIGHT, COUNT)).toBe(0);
    expect(indexFromOffset(-ITEM_HEIGHT * 0.6, ITEM_HEIGHT, COUNT)).toBe(COUNT - 1);
  });

  it('snaps to an exact multiple of the row pitch', () => {
    expect(nearestDetentOffset(ITEM_HEIGHT * 2.4, ITEM_HEIGHT)).toBe(ITEM_HEIGHT * 2);
    expect(nearestDetentOffset(ITEM_HEIGHT * -2.6, ITEM_HEIGHT)).toBe(ITEM_HEIGHT * -3);
  });
});

describe('the loop', () => {
  it('has no seam: crossing a detent moves every row by the distance scrolled and nothing else', () => {
    const nudge = 0.02 * ITEM_HEIGHT;
    const boundary = ITEM_HEIGHT * 3;
    const before = snapshot(boundary - nudge);
    const after = snapshot(boundary + nudge);

    const shared = [...before.keys()].filter((index) => after.has(index));
    expect(shared.length).toBeGreaterThan(ROWS - 1);
    for (const index of shared) {
      const movement = Math.abs((before.get(index) ?? 0) - (after.get(index) ?? 0));
      expect(movement, `item ${index} moved by more than the offset changed`).toBeLessThanOrEqual(2 * nudge + 1e-9);
    }
  });

  it('wraps a two-item column, so the meridiem wheel repeats rather than ending', () => {
    const shown = rowSlots({ rows: ROWS }).map((slot) =>
      rowIndex({ slot, offset: 0, itemHeight: ITEM_HEIGHT, count: 2 })
    );
    expect(shown).toEqual([0, 1, 0, 1, 0, 1]);
  });
});

describe('rebaseOffset', () => {
  it('brings the offset into the first lap', () => {
    const lap = ITEM_HEIGHT * COUNT;
    expect(rebaseOffset({ offset: lap * 3 + 17, itemHeight: ITEM_HEIGHT, count: COUNT })).toBeCloseTo(17, 9);
    expect(rebaseOffset({ offset: -17, itemHeight: ITEM_HEIGHT, count: COUNT })).toBeCloseTo(lap - 17, 9);
  });

  it('changes nothing on screen, which is what makes it safe to do at rest', () => {
    for (const laps of [1, 4, -3]) {
      for (const within of [0, 0.5, 7.25, ITEM_HEIGHT * 2.5]) {
        const offset = ITEM_HEIGHT * COUNT * laps + within;
        const rebased = rebaseOffset({ offset, itemHeight: ITEM_HEIGHT, count: COUNT });
        const before = snapshot(offset);
        const after = snapshot(rebased);
        const where = `laps ${laps}, within ${within}`;
        expect(
          [...after.keys()].sort((a, b) => a - b),
          `${where}: same items on screen`
        ).toEqual([...before.keys()].sort((a, b) => a - b));
        for (const [index, top] of before) {
          // Compared with a tolerance rather than exactly: subtracting laps is
          // exact arithmetic on the offset, but the division by `itemHeight` that
          // recovers `frac` is not, so the two agree to floating point and not to
          // the bit. A sub-micron difference is not a moved row.
          expect(after.get(index), `${where}: item ${index} held its place`).toBeCloseTo(top, 6);
        }
      }
    }
  });
});

describe('nearestOffsetForIndex', () => {
  it('takes the short way round', () => {
    const count = 24;
    const from = ITEM_HEIGHT * 23;
    expect(nearestOffsetForIndex({ fromOffset: from, index: 0, itemHeight: ITEM_HEIGHT, count })).toBe(
      ITEM_HEIGHT * 24
    );
    expect(nearestOffsetForIndex({ fromOffset: ITEM_HEIGHT * 0, index: 23, itemHeight: ITEM_HEIGHT, count })).toBe(
      -ITEM_HEIGHT
    );
  });

  it('resolves to the requested index whichever lap it lands on', () => {
    const count = 60;
    for (const from of [0, ITEM_HEIGHT * 59, ITEM_HEIGHT * -130, ITEM_HEIGHT * 421.5]) {
      for (const index of [0, 1, 30, 59]) {
        const target = nearestOffsetForIndex({ fromOffset: from, index, itemHeight: ITEM_HEIGHT, count });
        expect(indexFromOffset(target, ITEM_HEIGHT, count), `from ${from} to ${index}`).toBe(index);
        expect(Math.abs(target - from), `from ${from} to ${index} took the long way`).toBeLessThanOrEqual(
          (ITEM_HEIGHT * count) / 2 + ITEM_HEIGHT
        );
      }
    }
  });
});

describe('the drum', () => {
  it('puts one row of arc at one row of height, so the drag mapping matches the flat wheel', () => {
    const anglePerItem = 20;
    const radius = drumRadius({ itemHeight: ITEM_HEIGHT, anglePerItem });
    const arc = radius * ((anglePerItem * Math.PI) / 180);
    expect(arc).toBeCloseTo(ITEM_HEIGHT, 9);
  });

  it('turns a row edge-on, and no further', () => {
    const centre = drumRow({ distance: 0, anglePerItem: 20 });
    expect(centre.rotateX).toBeCloseTo(0, 9);
    expect(centre.opacity).toBeCloseTo(1, 9);
    expect(drumRow({ distance: 2, anglePerItem: 20 }).rotateX).toBeCloseTo(-40, 9);
    expect(drumRow({ distance: 4.5, anglePerItem: 20 }).opacity).toBeCloseTo(0, 9);
    expect(drumRow({ distance: 6, anglePerItem: 20 }).opacity).toBe(0);
  });

  it('asks for enough rows to reach the edge of the arc', () => {
    expect(drumOverscan({ rows: 5, anglePerItem: 20 })).toBe(2);
    // A 90-degree pitch turns the next row edge-on, so the flat set already covers it.
    expect(drumOverscan({ rows: 5, anglePerItem: 90 })).toBe(0);
  });
});
