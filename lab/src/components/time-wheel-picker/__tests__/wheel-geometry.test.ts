import { describe, expect, it } from 'vitest';

import {
  assertDrumAngle,
  assertOddRows,
  DEFAULT_DRUM_ANGLE_PER_ITEM,
  DRUM_PERSPECTIVE,
  drumAngleForHeight,
  drumHeight,
  drumSlots,
  drumRadius,
  drumRow,
  indexFromOffset,
  nearestDetentOffset,
  nearestOffsetForIndex,
  pastDragThreshold,
  rebaseOffset,
  resolveColumnHeight,
  rowIndex,
  rowSlots,
  rowTop,
  splitOffset,
  tapTargetOffset,
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

describe('pastDragThreshold', () => {
  it('takes three pixels of 2D distance, as Motion does', () => {
    const from = { x: 100, y: 100 };
    expect(pastDragThreshold({ from, to: { x: 100, y: 102 } })).toBe(false);
    expect(pastDragThreshold({ from, to: { x: 100, y: 103 } })).toBe(true);
    expect(pastDragThreshold({ from, to: { x: 102, y: 102 } })).toBe(false);
    expect(pastDragThreshold({ from, to: { x: 100, y: 97 } })).toBe(true);
    // Diagonal counts, so a sloppy tap that wanders sideways is a drag rather than
    // an unexpected jump to whichever row it ended over.
    expect(pastDragThreshold({ from, to: { x: 103, y: 100 } })).toBe(true);
  });
});

describe('tapTargetOffset', () => {
  it('brings the tapped row to the centre, whatever the wheel was mid-way through', () => {
    // The whole claim, as an assertion: the item that ends up selected is the item
    // the tapped row was displaying when it was tapped.
    for (const offsetAtTap of [0, 17.5, ITEM_HEIGHT * 3, ITEM_HEIGHT * 3.5, -ITEM_HEIGHT * 2.25, 1234.7]) {
      for (const slot of rowSlots({ rows: ROWS })) {
        const target = tapTargetOffset({ offsetAtTap, slot, itemHeight: ITEM_HEIGHT });
        expect(indexFromOffset(target, ITEM_HEIGHT, COUNT), `offset ${offsetAtTap}, slot ${slot}`).toBe(
          rowIndex({ slot, offset: offsetAtTap, itemHeight: ITEM_HEIGHT, count: COUNT })
        );
      }
    }
  });

  it('lands on an exact detent', () => {
    for (const offsetAtTap of [0, 17.5, ITEM_HEIGHT * 3.5, -91.25]) {
      for (const slot of rowSlots({ rows: ROWS })) {
        const target = tapTargetOffset({ offsetAtTap, slot, itemHeight: ITEM_HEIGHT });
        // A whole number of rows, asserted as a division rather than a remainder:
        // `-80 % 40` is `-0`, which is a signed-zero quirk of `%` and not a wheel
        // sitting off its detent.
        expect(Number.isInteger(target / ITEM_HEIGHT), `offset ${offsetAtTap}, slot ${slot}`).toBe(true);
      }
    }
  });

  it('does nothing when the centre row is tapped while the wheel is at rest', () => {
    const settled = ITEM_HEIGHT * 7;
    expect(tapTargetOffset({ offsetAtTap: settled, slot: 0, itemHeight: ITEM_HEIGHT })).toBe(settled);
  });

  it('moves by whole rows, so a tap never travels further than the row it aimed at', () => {
    const settled = ITEM_HEIGHT * 7;
    for (const slot of rowSlots({ rows: ROWS })) {
      const target = tapTargetOffset({ offsetAtTap: settled, slot, itemHeight: ITEM_HEIGHT });
      expect(target - settled, `slot ${slot}`).toBe(slot * ITEM_HEIGHT);
    }
  });
});

describe('assertDrumAngle', () => {
  it('refuses zero, which would otherwise hang the tab', () => {
    // `ceil(90 / 0)` is Infinity, so `drumSlots` starts its loop at `1 - Infinity` and
    // `slot++` never advances it — an unbounded push, not a wrong answer.
    expect(() => assertDrumAngle(0)).toThrow(/greater than 0/u);
    expect(() => drumSlots({ anglePerItem: 0 })).toThrow(/greater than 0/u);
  });

  it('refuses a negative angle, which would render a silently blank column', () => {
    // `ceil(90 / -20)` is -4, so the range runs 5..-4 and the loop body never executes.
    expect(() => assertDrumAngle(-20)).toThrow(/greater than 0/u);
    expect(() => drumSlots({ anglePerItem: -20 })).toThrow(/greater than 0/u);
  });

  it('refuses non-finite angles and anything past edge-on', () => {
    expect(() => assertDrumAngle(Number.NaN)).toThrow(/greater than 0/u);
    expect(() => assertDrumAngle(Number.POSITIVE_INFINITY)).toThrow(/greater than 0/u);
    expect(() => assertDrumAngle(91)).toThrow(/at most 90/u);
  });

  it('accepts the usable range, including the default', () => {
    for (const angle of [0.5, 8, DEFAULT_DRUM_ANGLE_PER_ITEM, 45, 90]) {
      expect(() => assertDrumAngle(angle), `${angle}°`).not.toThrow();
    }
  });
});

describe('resolveColumnHeight', () => {
  it('lets `height` win, whichever variant and whatever the drum would have measured', () => {
    // The rule that used to be an inline `??` at two call sites. `height` is the source of
    // truth for the box; the angle remains the drum's shape.
    expect(resolveColumnHeight({ variant: 'drum', itemHeight: 40, anglePerItem: 20, height: 166 })).toBe(166);
    expect(resolveColumnHeight({ variant: 'flat', itemHeight: 40, rows: 5, anglePerItem: 20, height: 166 })).toBe(166);
    // Both directions of disagreement are legal, so neither is clamped away.
    expect(resolveColumnHeight({ variant: 'drum', itemHeight: 40, anglePerItem: 20, height: 600 })).toBe(600);
    expect(resolveColumnHeight({ variant: 'drum', itemHeight: 40, anglePerItem: 20, height: 40 })).toBe(40);
  });

  it('measures a drum from its own cylinder when no height is given', () => {
    expect(resolveColumnHeight({ variant: 'drum', itemHeight: 40, anglePerItem: 20 })).toBeCloseTo(
      drumHeight({ itemHeight: 40, anglePerItem: 20 }),
      9
    );
  });

  it('makes a flat wheel exactly `rows` items tall, which for it is not negotiable', () => {
    expect(resolveColumnHeight({ variant: 'flat', itemHeight: 40, rows: 5, anglePerItem: 20 })).toBe(200);
    expect(resolveColumnHeight({ variant: 'flat', itemHeight: 40, rows: 7, anglePerItem: 20 })).toBe(280);
  });

  it('ignores `rows` on a drum, which is why a drum no longer accepts one', () => {
    const withRows = resolveColumnHeight({ variant: 'drum', itemHeight: 40, anglePerItem: 20, rows: 9 });
    const without = resolveColumnHeight({ variant: 'drum', itemHeight: 40, anglePerItem: 20 });
    expect(withRows).toBe(without);
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

  describe('sizing the drum by its height instead of its angle', () => {
    it('round-trips against drumHeight for every angle worth using', () => {
      // The one test that matters: the inverse has to agree with the forward function it
      // inverts, or the two spellings of a drum's shape are not spellings of one thing.
      for (const anglePerItem of [4, 8, 10, 14, 20, 28, 34, 40, 60, 89]) {
        const height = drumHeight({ itemHeight: 40, anglePerItem });
        expect(drumAngleForHeight({ itemHeight: 40, drumHeight: height }), `${anglePerItem}°`).toBeCloseTo(
          anglePerItem,
          6
        );
      }
    });

    it('round-trips at other item heights too', () => {
      for (const itemHeight of [24, 40, 72]) {
        for (const anglePerItem of [10, 20, 34]) {
          const height = drumHeight({ itemHeight, anglePerItem });
          expect(
            drumAngleForHeight({ itemHeight, drumHeight: height }),
            `${itemHeight}px at ${anglePerItem}°`
          ).toBeCloseTo(anglePerItem, 6);
        }
      }
    });

    it('gives the angle the default height was already using', () => {
      // 206.4 is what a 20° drum measures, so asking for 206.4 must ask for 20°.
      expect(drumAngleForHeight({ itemHeight: 40, drumHeight: 206.4 })).toBeCloseTo(20, 2);
    });

    it('refuses a height no drum can have, rather than inventing an angle', () => {
      // Shorter than one row is the limit as the angle grows without bound.
      expect(() => drumAngleForHeight({ itemHeight: 40, drumHeight: 40 })).toThrow(/between/u);
      expect(() => drumAngleForHeight({ itemHeight: 40, drumHeight: 12 })).toThrow(/between/u);
      // Twice the perspective is the limit as the angle shrinks to nothing.
      expect(() => drumAngleForHeight({ itemHeight: 40, drumHeight: 1800 })).toThrow(/between/u);
      expect(() => drumAngleForHeight({ itemHeight: 40, drumHeight: 5000 })).toThrow(/between/u);
    });

    it('accepts anything strictly inside those limits', () => {
      expect(() => drumAngleForHeight({ itemHeight: 40, drumHeight: 41 })).not.toThrow();
      expect(() => drumAngleForHeight({ itemHeight: 40, drumHeight: 1799 })).not.toThrow();
    });

    it('asks for a tighter arc when asked for a shorter drum', () => {
      const short = drumAngleForHeight({ itemHeight: 40, drumHeight: 130 });
      const tall = drumAngleForHeight({ itemHeight: 40, drumHeight: 360 });
      expect(short).toBeGreaterThan(tall);
    });
  });

  describe('height', () => {
    it('matches what the rendered drum measures', () => {
      // 206.4 was measured off the real Drum story at the defaults, with
      // `getBoundingClientRect` over every rendered row. The closed form has to agree
      // with the thing on screen or it is not the drum's height.
      expect(drumHeight({ itemHeight: 40, anglePerItem: 20 })).toBeCloseTo(206.4, 1);
    });

    it('brackets the prism between its two cylinders', () => {
      const outer = drumHeight({ itemHeight: 40, anglePerItem: 20 });
      // The inscribed cylinder, computed here rather than offered as an option: a `fit`
      // parameter existed briefly and was worse than useless, because `drumAngleForHeight`
      // has no such option and would silently invert an inscribed height to the wrong angle.
      const apothem = drumRadius({ itemHeight: 40, anglePerItem: 20 });
      const inner = 2 * apothem * (DRUM_PERSPECTIVE / (DRUM_PERSPECTIVE + apothem));
      // The inscribed cylinder runs through the rows' own centres, the circumscribed
      // one through their corners, so the prism is between them and `outer` is the one
      // that cannot clip.
      expect(inner).toBeLessThan(outer);
      expect(inner).toBeCloseTo(203.3, 1);
      // 1.5% apart at the defaults, which is why the choice is not a design decision.
      expect((outer - inner) / outer).toBeLessThan(0.02);
    });

    it('shrinks as the arc tightens, which a rows-based box could not follow', () => {
      const wide = drumHeight({ itemHeight: 40, anglePerItem: 10 });
      const mid = drumHeight({ itemHeight: 40, anglePerItem: 20 });
      const tight = drumHeight({ itemHeight: 40, anglePerItem: 34 });
      expect(wide).toBeGreaterThan(mid);
      expect(mid).toBeGreaterThan(tight);
      // Over the three angles the story shows, the drum's own height moves by 2.8x
      // while `itemHeight * rows` would have stayed at 200 throughout.
      expect(wide / tight).toBeCloseTo(2.8, 1);
      // Across 8°-40° the closed form spans 3.82x. The browser measured 4.03x over the
      // same pair; the gap is that the measurement filtered to rows still visible and
      // read `getBoundingClientRect`, which overestimates a 3D-transformed quad.
      expect(
        drumHeight({ itemHeight: 40, anglePerItem: 8 }) / drumHeight({ itemHeight: 40, anglePerItem: 40 })
      ).toBeCloseTo(3.82, 2);
    });

    it('is independent of rows, because a drum is not rows tall', () => {
      // Nothing in the signature takes `rows`. Stated as a test because it is the
      // whole point: the box follows the cylinder, not the row budget.
      expect(drumHeight({ itemHeight: 40, anglePerItem: 20 })).toBe(
        drumHeight({ itemHeight: 40, anglePerItem: 20, perspective: DRUM_PERSPECTIVE })
      );
    });

    it('grows with the item height at a fixed arc', () => {
      expect(drumHeight({ itemHeight: 60, anglePerItem: 20 })).toBeGreaterThan(
        drumHeight({ itemHeight: 40, anglePerItem: 20 })
      );
    });
  });

  it('renders the slots that fit inside the arc, and takes no row count to do it', () => {
    // 20° per item reaches 90° at the fifth row, so the slots run -4..5.
    expect(drumSlots({ anglePerItem: 20 })).toEqual([-4, -3, -2, -1, 0, 1, 2, 3, 4, 5]);
    // A tighter arc needs fewer.
    expect(drumSlots({ anglePerItem: 34 })).toEqual([-2, -1, 0, 1, 2, 3]);
    // And a 90° pitch turns the very next row edge-on.
    expect(drumSlots({ anglePerItem: 90 })).toEqual([0, 1]);
  });

  it('is unaffected by anything a flat wheel would be sized by', () => {
    // Not a tautology about the signature but the finding that removed `rows` from the
    // drum: measured in the browser, a drum at 20° rendered the identical ten slots at
    // every row count from 1 to 9, because the overscan that used to derive them cancelled
    // `rows` out of its own arithmetic.
    const slots = drumSlots({ anglePerItem: 20 });
    expect(slots).toHaveLength(10);
    expect(Math.min(...slots)).toBe(1 - Math.ceil(90 / 20));
    expect(Math.max(...slots)).toBe(Math.ceil(90 / 20));
  });
});
