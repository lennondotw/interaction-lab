import { describe, expect, it } from 'vitest';

import { getTabLayoutChange, type TabLayoutSnapshot } from '../tab-layout-change.js';

const initial: TabLayoutSnapshot = { width: 606, ids: ['1', '2'], heldWidths: null };

describe('tab layout change intent', () => {
  it('initializes once and ignores repeated observations or equivalent tab arrays', () => {
    expect(getTabLayoutChange(null, initial)).toBe('mount');
    expect(getTabLayoutChange(initial, { ...initial, ids: ['1', '2'] })).toBe('unchanged');
  });

  it.each([['1'], ['1', '2', '3'], ['2', '1']])('treats tab changes as animation intent: %j', (...ids) => {
    expect(getTabLayoutChange(initial, { ...initial, ids })).toBe('tabs');
  });

  it('classifies changed container geometry even if the tabs also change', () => {
    expect(getTabLayoutChange(initial, { ...initial, width: 526 })).toBe('resize');
    expect(getTabLayoutChange(initial, { ...initial, width: 526, ids: ['1', '2', '3'] })).toBe('resize');
  });

  it('animates holding release without turning an observer notification into resize', () => {
    const held = {
      ...initial,
      heldWidths: new Map([
        ['1', 67.25],
        ['2', 67.25],
      ]),
    };
    expect(getTabLayoutChange(held, { ...held })).toBe('unchanged');
    expect(getTabLayoutChange(held, initial)).toBe('hold');
  });
});
