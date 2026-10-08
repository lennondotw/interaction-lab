import { describe, expect, it } from 'vitest';

import {
  hitTabPresentation,
  hitTabStrip,
  rectContains,
  sameTabHit,
  sameTabStrip,
  tabGeometry,
  tabStripGeometry,
  type TabGeometryInput,
} from '../tab-geometry.js';

const input = (
  id: string,
  width: number,
  gap = 0,
  closeCapacity = Math.min(28, width),
  present = true
): TabGeometryInput => ({ id, width, gap, closeCapacity, present });
const strip = (...tabs: TabGeometryInput[]) => tabStripGeometry(tabs, 36, tabs.length === 0 ? 0 : 4);

describe('numeric tab geometry and input arbitration', () => {
  it.each([100, 28, 20, 8, 0])('shrinks title before close capacity at %s px', (width) => {
    const tab = tabGeometry(input('a', width), 10);
    expect(tab.title.width).toBe(Math.max(0, width - 28));
    expect(tab.close.width).toBe(Math.min(width, 28));
    expect(tab.close.left + tab.close.width).toBe(10 + width);
  });

  it('hits only the clipped intersection of a frozen presence slot', () => {
    const visual = strip(input('a', 8, 4, 28));
    const target = strip(input('a', 60, 100));
    // Painted raw slot is [-16, 12), but the tab clips it to [4, 12).
    expect(visual.tabs[0]!.close).toEqual({ left: 4, width: 8 });
    expect(hitTabStrip(target, visual, 0)).toBeNull();
    expect(hitTabStrip(target, visual, 4)).toEqual({ control: 'close', id: 'a' });
    expect(hitTabStrip(target, visual, 11.999)).toEqual({ control: 'close', id: 'a' });
    expect(hitTabStrip(target, visual, 12)).toBeNull();
  });

  it('positions tabs, leading gaps and add without measuring animated DOM rectangles', () => {
    const row = strip(input('a', 40), input('b', 20, 4), input('c', 0, 2, 28));
    expect(row.tabs.map((tab) => tab.rect)).toEqual([
      { left: 0, width: 40 },
      { left: 44, width: 20 },
      { left: 66, width: 0 },
    ]);
    expect(row.add).toEqual({ left: 70, width: 36 });
    expect(row.width).toBe(106);
    expect(strip().add).toEqual({ left: 0, width: 36 });
    expect(hitTabStrip(row, row, 42)).toBeNull();
    expect(hitTabStrip(row, row, 68)).toBeNull();
  });

  it('gives a final X priority over another ID’s visible X', () => {
    const target = strip(input('a', 60), input('b', 60, 4));
    const visual = strip(input('a', 20), input('b', 30, 4));
    expect(hitTabStrip(target, visual, 40)).toEqual({ control: 'close', id: 'a' });
  });

  it('keeps a visible X actionable over a final title', () => {
    const target = strip(input('a', 100));
    const visual = strip(input('a', 40));
    expect(hitTabStrip(target, visual, 20)).toEqual({ control: 'close', id: 'a' });
    expect(hitTabStrip(target, visual, 5)).toEqual({ control: 'select', id: 'a' });
  });

  it('rejects exits even when their visual X overlaps a live title', () => {
    const target = strip(input('b', 100));
    const visual = strip(input('a', 40, 0, 28, false), input('b', 100, 4));
    expect(hitTabStrip(target, visual, 20)).toEqual({ control: 'select', id: 'b' });
  });

  it('excludes a removed ID before its presence flag has committed', () => {
    expect(hitTabStrip(strip(input('b', 100)), strip(input('a', 40), input('b', 100, 4)), 20)).toEqual({
      control: 'select',
      id: 'b',
    });
  });

  it('accepts both add positions, after close slots and before titles', () => {
    const target = strip(input('a', 100));
    const visual = strip(input('a', 40));
    expect(hitTabStrip(target, visual, 50)).toEqual({ control: 'add' });
    expect(hitTabStrip(target, visual, 110)).toEqual({ control: 'add' });
    expect(hitTabStrip(target, visual, 75)).toEqual({ control: 'close', id: 'a' });
  });

  it('keeps feedback on the painted X when action priority resolves another ID', () => {
    const target = strip(input('a', 60), input('b', 60, 4));
    const visual = strip(input('a', 20), input('b', 30, 4));
    expect(hitTabStrip(target, visual, 40)).toEqual({ control: 'close', id: 'a' });
    expect(hitTabPresentation(target, visual, 40)).toEqual({ control: 'close', id: 'b' });
  });

  it('does not highlight invisible final controls or painted exits', () => {
    const target = strip(input('b', 100));
    const visual = strip(input('a', 40, 0, 28, false), input('b', 20, 4));
    expect(hitTabPresentation(target, visual, 20)).toBeNull();
    expect(hitTabPresentation(target, visual, 110)).toBeNull();
    expect(hitTabPresentation(target, visual, 50)).toEqual({ control: 'close', id: 'b' });
    expect(hitTabPresentation(target, visual, 70)).toEqual({ control: 'add' });
  });

  it('uses half-open rectangles and ignores zero-width controls', () => {
    expect(rectContains({ left: 5, width: 0 }, 5)).toBe(false);
    expect(rectContains({ left: 5, width: 10 }, 5)).toBe(true);
    expect(rectContains({ left: 5, width: 10 }, 15)).toBe(false);
    expect(rectContains({ left: 5, width: 10 }, 4.99)).toBe(false);
  });

  it('distinguishes changed targets from identical measurement snapshots', () => {
    const target = strip(input('a', 50), input('b', 30, 4));
    expect(sameTabStrip(null, target)).toBe(false);
    expect(sameTabStrip(target, strip(input('a', 50), input('b', 30, 4)))).toBe(true);
    expect(sameTabStrip(target, strip(input('a', 50), input('b', 31, 4)))).toBe(false);
    expect(sameTabStrip(target, strip(input('a', 50), input('b', 30, 4, 20)))).toBe(false);
    expect(sameTabStrip(target, strip(input('b', 50), input('a', 30, 4)))).toBe(false);
  });

  it('compares action and stable ID so a shifted release cannot activate a neighbor', () => {
    expect(sameTabHit({ control: 'close', id: 'a' }, { control: 'close', id: 'b' })).toBe(false);
    expect(sameTabHit({ control: 'close', id: 'a' }, { control: 'select', id: 'a' })).toBe(false);
    expect(sameTabHit({ control: 'close', id: 'a' }, { control: 'close', id: 'a' })).toBe(true);
    expect(sameTabHit({ control: 'add' }, { control: 'add' })).toBe(true);
    expect(sameTabHit(null, { control: 'add' })).toBe(false);
  });
});
