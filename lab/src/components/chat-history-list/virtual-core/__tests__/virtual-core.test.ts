/**
 * Unit tests for the headless size model. Every query is checked against hand-computed
 * layouts, and a seeded property test compares it with a naive reference on random edits.
 */

import { describe, expect, it } from 'vitest';

import {
  createVirtualCore,
  type VirtualOverscan,
  type VirtualOverscanContext,
  type VirtualRange,
} from '../virtual-core.js';
import { messageKeys, seededRandom } from './simulation.js';

const fixedEstimate = (size: number) => () => size;

function coreWith(keys: readonly string[], estimate = 100, padding: { start?: number; end?: number } = {}) {
  const core = createVirtualCore({
    estimateSize: fixedEstimate(estimate),
    paddingStart: padding.start,
    paddingEnd: padding.end,
  });
  core.setKeys(keys);
  return core;
}

describe('layout', () => {
  it('lays out an empty window as padding only', () => {
    const core = coreWith([], 100, { start: 12, end: 30 });
    expect(core.totalSize()).toBe(42);
    expect(core.rangeFor(0, 1000)).toBeNull();
    expect(core.stats()).toEqual({ count: 0, measured: 0, estimated: 0, cachedSizes: 0 });
  });

  it('places estimated items contiguously after the start padding', () => {
    const core = coreWith(['a', 'b', 'c'], 50, { start: 10, end: 5 });
    expect(core.items({ startIndex: 0, endIndex: 2 })).toEqual([
      { key: 'a', index: 0, start: 10, size: 50, end: 60, measured: false },
      { key: 'b', index: 1, start: 60, size: 50, end: 110, measured: false },
      { key: 'c', index: 2, start: 110, size: 50, end: 160, measured: false },
    ]);
    expect(core.totalSize()).toBe(165);
  });

  it('shifts only the items after a measured one', () => {
    const core = coreWith(['a', 'b', 'c', 'd']);
    expect(core.measure('b', 130.25)).toBe(true);
    expect(core.offsetOf('a')).toBe(0);
    expect(core.offsetOf('b')).toBe(100);
    expect(core.offsetOf('c')).toBe(230.25);
    expect(core.offsetOf('d')).toBe(330.25);
    expect(core.item(1).measured).toBe(true);
  });

  it('reports whether a measurement changed the layout', () => {
    const core = coreWith(['a']);
    expect(core.measure('a', 100)).toBe(false);
    expect(core.item(0).measured).toBe(true);
    expect(core.measure('a', 100)).toBe(false);
    expect(core.measure('a', 64)).toBe(true);
  });

  it('applies padding changes to every offset', () => {
    const core = coreWith(['a', 'b'], 40);
    core.setPadding({ start: 25 });
    expect(core.offsetOf('b')).toBe(65);
    core.setPadding({ end: 15 });
    expect(core.totalSize()).toBe(120);
  });
});

describe('measurement cache', () => {
  it('keeps measurements for keys outside the window until they return', () => {
    const core = coreWith(['a', 'b']);
    expect(core.measure('z', 55)).toBe(false);
    expect(core.measuredSize('z')).toBe(55);
    core.setKeys(['z', 'a', 'b']);
    expect(core.offsetOf('a')).toBe(55);
    expect(core.item(0).measured).toBe(true);
  });

  it('shifts existing items by exactly the inserted size on prepend', () => {
    const core = coreWith(messageKeys(10, 20), 100);
    for (const key of core.keys) core.measure(key, 37.5);
    const before = core.offsetOf('m15')!;
    core.setKeys(messageKeys(5, 20));
    expect(core.offsetOf('m15')! - before).toBe(5 * 100);
    expect(core.item(core.indexOf('m15')!).measured).toBe(true);
  });

  it('restores a disjoint window to exactly its previous layout', () => {
    const core = coreWith(messageKeys(0, 50), 100);
    for (const [index, key] of core.keys.entries()) core.measure(key, 20 + index);
    const layout = core.items({ startIndex: 0, endIndex: 49 });
    core.setKeys(messageKeys(1000, 1050));
    expect(core.stats().measured).toBe(0);
    core.setKeys(messageKeys(0, 50));
    expect(core.items({ startIndex: 0, endIndex: 49 })).toEqual(layout);
  });
});

describe('forget', () => {
  it('falls back to the estimate for a key in the window and reports the layout change', () => {
    const core = coreWith(['a', 'b', 'c'], 100);
    core.measure('a', 10);
    core.measure('b', 20);
    expect(core.forget('a')).toBe(true);
    expect(core.item(0)).toMatchObject({ size: 100, measured: false });
    expect(core.offsetOf('b')).toBe(100);
    expect(core.offsetOf('c')).toBe(120);
    expect(core.measuredSize('a')).toBeUndefined();
  });

  it('drops a key outside the window without changing the layout', () => {
    const core = coreWith(['a', 'b'], 100);
    core.measure('x', 30);
    const before = core.totalSize();
    expect(core.forget('x')).toBe(false);
    expect(core.measuredSize('x')).toBeUndefined();
    expect(core.totalSize()).toBe(before);
    core.setKeys(['x', 'a', 'b']);
    expect(core.item(0)).toMatchObject({ size: 100, measured: false });
  });

  it('is a no-op for a key with no measurement', () => {
    const core = coreWith(['a'], 100);
    expect(core.forget('a')).toBe(false);
    expect(core.forget('nowhere')).toBe(false);
  });

  it('reports no layout change when the estimate equals the dropped size', () => {
    const core = coreWith(['a', 'b'], 100);
    core.measure('a', 100);
    expect(core.forget('a')).toBe(false);
    expect(core.item(0).measured).toBe(false);
  });

  it('re-estimates through the estimate function, so a caller can supply the old size', () => {
    const stale = new Map<string, number>();
    const core = createVirtualCore({ estimateSize: (key) => stale.get(key) ?? 100 });
    core.setKeys(['a', 'b']);
    core.measure('a', 42);
    stale.set('a', core.measuredSize('a')!);
    expect(core.forget('a')).toBe(false);
    expect(core.item(0)).toMatchObject({ size: 42, measured: false });
  });
});

describe('measuredKeys', () => {
  it('lists every measured key, in or out of the window', () => {
    const core = coreWith(['a', 'b', 'c'], 100);
    core.measure('a', 10);
    core.measure('x', 30);
    expect(core.measuredKeys().toSorted()).toEqual(['a', 'x']);
  });

  it('returns a snapshot that is safe to forget from while iterating', () => {
    const core = coreWith(['a', 'b', 'c'], 100);
    for (const key of ['a', 'b', 'c', 'x', 'y']) core.measure(key, 10);
    const keep = new Set(['b', 'y']);
    for (const key of core.measuredKeys()) if (!keep.has(key)) core.forget(key);
    expect(core.measuredKeys().toSorted()).toEqual(['b', 'y']);
    expect(core.stats()).toEqual({ count: 3, measured: 1, estimated: 2, cachedSizes: 2 });
    expect(core.offsetOf('c')).toBe(110);
  });
});

describe('rangeFor', () => {
  const core = coreWith(['a', 'b', 'c', 'd'], 100);

  it('returns items intersecting a half-open interval', () => {
    expect(core.rangeFor(150, 250)).toEqual({ startIndex: 1, endIndex: 2 });
    expect(core.rangeFor(0, 400)).toEqual({ startIndex: 0, endIndex: 3 });
  });

  it('excludes items that only touch an edge', () => {
    expect(core.rangeFor(100, 200)).toEqual({ startIndex: 1, endIndex: 1 });
    expect(core.rangeFor(100, 100)).toBeNull();
  });

  it('clamps intervals beyond the content', () => {
    expect(core.rangeFor(-500, 50)).toEqual({ startIndex: 0, endIndex: 0 });
    expect(core.rangeFor(350, 10_000)).toEqual({ startIndex: 3, endIndex: 3 });
    expect(core.rangeFor(400, 10_000)).toBeNull();
    expect(core.rangeFor(-500, 0)).toBeNull();
  });

  it('includes zero-size items strictly inside the interval', () => {
    const zero = coreWith(['a', 'b', 'c'], 100);
    zero.measure('b', 0);
    expect(zero.rangeFor(50, 150)).toEqual({ startIndex: 0, endIndex: 2 });
    expect(zero.rangeFor(100, 150)).toEqual({ startIndex: 2, endIndex: 2 });
  });

  it('accounts for padding before the first item', () => {
    const padded = coreWith(['a', 'b'], 100, { start: 50 });
    expect(padded.rangeFor(0, 50)).toBeNull();
    expect(padded.rangeFor(0, 51)).toEqual({ startIndex: 0, endIndex: 0 });
  });
});

describe('viewport and overscan', () => {
  /** Ten items of 100px each, a 250px viewport at 420: items 4..6 are visible. */
  function viewportCore(overscan?: VirtualOverscan) {
    const core = createVirtualCore({ estimateSize: () => 100, overscan });
    core.setKeys(messageKeys(0, 10));
    core.setViewport({ offset: 420, size: 250 });
    return core;
  }

  it('has no ranges before a viewport is reported', () => {
    const core = coreWith(['a', 'b']);
    expect(core.viewport).toBeNull();
    expect(core.visibleRange()).toBeNull();
    expect(core.renderRange()).toBeNull();
  });

  it('derives the visible range from the reported viewport', () => {
    const core = viewportCore();
    expect(core.viewport).toEqual({ offset: 420, size: 250 });
    expect(core.visibleRange()).toEqual({ startIndex: 4, endIndex: 6 });
    expect(core.renderRange()).toEqual({ startIndex: 4, endIndex: 6 });
  });

  it('re-derives ranges after measurements without a new viewport report', () => {
    const core = viewportCore();
    core.measure('m0', 400);
    expect(core.visibleRange()).toEqual({ startIndex: 1, endIndex: 3 });
  });

  it('extends by pixels on each side independently', () => {
    const core = viewportCore({ kind: 'pixels', before: 150, after: 0 });
    expect(core.renderRange()).toEqual({ startIndex: 2, endIndex: 6 });
    core.setOverscan({ kind: 'pixels', before: 0, after: 1000 });
    expect(core.renderRange()).toEqual({ startIndex: 4, endIndex: 9 });
  });

  it('extends by item counts on each side and clamps to the window', () => {
    const core = viewportCore({ kind: 'items', before: 2, after: 1 });
    expect(core.renderRange()).toEqual({ startIndex: 2, endIndex: 7 });
    core.setOverscan({ kind: 'items', before: 50, after: 50 });
    expect(core.renderRange()).toEqual({ startIndex: 0, endIndex: 9 });
  });

  it('counts items, not pixels, regardless of their sizes', () => {
    const core = viewportCore({ kind: 'items', before: 1, after: 1 });
    core.measure('m3', 5);
    core.measure('m7', 900);
    expect(core.visibleRange()).toEqual({ startIndex: 5, endIndex: 7 });
    expect(core.renderRange()).toEqual({ startIndex: 4, endIndex: 8 });
  });

  it('has no item overscan when nothing is visible', () => {
    const core = createVirtualCore({
      estimateSize: () => 100,
      paddingEnd: 500,
      overscan: { kind: 'items', before: 3, after: 3 },
    });
    core.setKeys(messageKeys(0, 5));
    core.setViewport({ offset: 600, size: 200 });
    expect(core.visibleRange()).toBeNull();
    expect(core.renderRange()).toBeNull();
  });

  it('reaches items from the padding with pixel overscan', () => {
    const core = createVirtualCore({
      estimateSize: () => 100,
      paddingEnd: 500,
      overscan: { kind: 'pixels', before: 150, after: 0 },
    });
    core.setKeys(messageKeys(0, 5));
    core.setViewport({ offset: 600, size: 200 });
    expect(core.renderRange()).toEqual({ startIndex: 4, endIndex: 4 });
  });

  it('handles elastic overscroll above the content', () => {
    const core = viewportCore({ kind: 'pixels', before: 100, after: 0 });
    core.setViewport({ offset: -80, size: 250 });
    expect(core.visibleRange()).toEqual({ startIndex: 0, endIndex: 1 });
    expect(core.renderRange()).toEqual({ startIndex: 0, endIndex: 1 });
  });

  it('passes viewport, visible range and layout to a custom strategy', () => {
    const contexts: VirtualOverscanContext[] = [];
    const core = viewportCore({
      kind: 'custom',
      range: (context) => {
        contexts.push(context);
        return { startIndex: 0, endIndex: context.layout.count - 1 };
      },
    });
    expect(core.renderRange()).toEqual({ startIndex: 0, endIndex: 9 });
    expect(contexts).toHaveLength(1);
    const [context] = contexts;
    expect(context?.viewport).toEqual({ offset: 420, size: 250 });
    expect(context?.visible).toEqual({ startIndex: 4, endIndex: 6 });
    expect(context?.layout.item(4).start).toBe(400);
    expect(context?.layout.totalSize()).toBe(1000);
  });

  it('rejects custom ranges that miss the viewport or leave the window', () => {
    const custom = (range: VirtualRange | null): VirtualOverscan => ({ kind: 'custom', range: () => range });
    expect(() => viewportCore(custom({ startIndex: 5, endIndex: 9 })).renderRange()).toThrow(
      'does not contain the visible'
    );
    expect(() => viewportCore(custom({ startIndex: 0, endIndex: 5 })).renderRange()).toThrow(
      'does not contain the visible'
    );
    expect(() => viewportCore(custom({ startIndex: 0, endIndex: 10 })).renderRange()).toThrow('outside 0..9');
    expect(() => viewportCore(custom({ startIndex: 4.5, endIndex: 6 })).renderRange()).toThrow('outside 0..9');
    expect(() => viewportCore(custom(null)).renderRange()).toThrow('returned null while items are visible');
  });

  it('rejects invalid viewports and overscan settings', () => {
    const core = viewportCore();
    expect(() => core.setViewport({ offset: Number.NaN, size: 100 })).toThrow(RangeError);
    expect(() => core.setViewport({ offset: 0, size: -1 })).toThrow(RangeError);
    expect(() => core.setOverscan({ kind: 'items', before: 1.5, after: 0 })).toThrow('must be an integer');
    expect(() => core.setOverscan({ kind: 'pixels', before: 0, after: -10 })).toThrow(RangeError);
    expect(() =>
      createVirtualCore({ estimateSize: () => 1, overscan: { kind: 'items', before: -1, after: 0 } })
    ).toThrow(RangeError);
  });
});

describe('invariants', () => {
  it('rejects duplicate keys', () => {
    expect(() => coreWith(['a', 'b', 'a'])).toThrow('Duplicate key "a"');
  });

  it('rejects invalid sizes, estimates and padding', () => {
    const core = coreWith(['a']);
    expect(() => core.measure('a', -1)).toThrow(RangeError);
    expect(() => core.measure('a', Number.NaN)).toThrow(RangeError);
    expect(() => core.setPadding({ start: Number.POSITIVE_INFINITY })).toThrow(RangeError);
    const broken = createVirtualCore({ estimateSize: () => Number.NaN });
    expect(() => broken.setKeys(['a'])).toThrow(RangeError);
  });

  it('rejects out-of-range indexes and inverted intervals', () => {
    const core = coreWith(['a']);
    expect(() => core.item(1)).toThrow(RangeError);
    expect(() => core.item(-1)).toThrow(RangeError);
    expect(() => core.rangeFor(10, 0)).toThrow(RangeError);
  });
});

describe('property: matches a naive reference layout', () => {
  /** Recomputes everything from scratch; slow and obviously correct. */
  function reference(keys: readonly string[], sizes: ReadonlyMap<string, number>, estimate: number, start: number) {
    let offset = start;
    return keys.map((key) => {
      const size = sizes.get(key) ?? estimate;
      const item = { key, start: offset, end: offset + size };
      offset += size;
      return item;
    });
  }

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('seed %i: random measures, windows and queries', (seed) => {
    const random = seededRandom(seed);
    const estimate = 60;
    const paddingStart = Math.round(random() * 40);
    const core = createVirtualCore({ estimateSize: () => estimate, paddingStart });
    const sizes = new Map<string, number>();
    let keys = messageKeys(0, 200);
    core.setKeys(keys);
    const offsets: [actual: number | undefined, expected: number][] = [];
    const ranges: [actual: number[] | null, expected: (number | undefined)[] | null][] = [];

    for (let step = 0; step < 400; step++) {
      const action = random();
      if (action < 0.6) {
        const key = `m${Math.floor(random() * 260)}`;
        const size = Math.round(random() * 300 * 4) / 4;
        core.measure(key, size);
        sizes.set(key, size);
      } else if (action < 0.7) {
        const key = `m${Math.floor(random() * 260)}`;
        core.forget(key);
        sizes.delete(key);
      } else if (action < 0.8) {
        const from = Math.floor(random() * 120);
        keys = messageKeys(from, from + 20 + Math.floor(random() * 120));
        core.setKeys(keys);
      } else {
        const expected = reference(keys, sizes, estimate, paddingStart);
        const at = Math.floor(random() * keys.length);
        const probe = expected[at]!;
        offsets.push([core.offsetOf(probe.key), probe.start]);
        const low = random() * (expected.at(-1)?.end ?? 0);
        const high = low + random() * 1500;
        const hits = expected.flatMap((item, index) => (item.start < high && item.end > low ? [index] : []));
        const range = core.rangeFor(low, high);
        ranges.push([range ? [range.startIndex, range.endIndex] : null, hits.length ? [hits[0], hits.at(-1)] : null]);
      }
    }
    expect(offsets.length).toBeGreaterThan(50);
    expect(offsets.map(([actual]) => actual)).toEqual(offsets.map(([, expected]) => expected));
    expect(ranges.map(([actual]) => actual)).toEqual(ranges.map(([, expected]) => expected));
    const expected = reference(keys, sizes, estimate, paddingStart);
    expect(core.totalSize()).toBe(expected.at(-1)?.end ?? paddingStart);
  });
});
