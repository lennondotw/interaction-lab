/**
 * Headless size model for a virtualised list.
 *
 * It owns the ordered keys of the current window, the measured size of every key it has seen
 * (kept across window changes), the layout those produce, and the viewport the caller last
 * reported. From these it derives the visible and render ranges.
 *
 * By design it never writes a scroll position, never observes anything and never notifies:
 * callers report measurements and viewport changes, then read the derived ranges. Keeping it
 * pure is what lets the whole layout be tested without a browser.
 */

export interface VirtualCoreOptions {
  /** Size of a key that has never been measured. Must be finite and non-negative. */
  estimateSize: (key: string) => number;
  /** Space before the first item, such as a header. Defaults to 0. */
  paddingStart?: number;
  /** Space after the last item, such as bottom clearance. Defaults to 0. */
  paddingEnd?: number;
  /** How far the render range extends beyond the viewport. Defaults to no overscan. */
  overscan?: VirtualOverscan;
}

/** The scroll container's visible area, in content coordinates. */
export interface VirtualViewport {
  /** Scroll offset. May be negative or past the end during elastic overscroll. */
  offset: number;
  size: number;
}

/** Read-only layout queries available to a custom overscan strategy. */
export interface VirtualLayoutReader {
  readonly count: number;
  item: (index: number) => VirtualItem;
  rangeFor: (start: number, end: number) => VirtualRange | null;
  totalSize: () => number;
}

export interface VirtualOverscanContext {
  viewport: VirtualViewport;
  /** Items intersecting the viewport. A custom range must contain it. */
  visible: VirtualRange | null;
  layout: VirtualLayoutReader;
}

/**
 * - `items`: extend the visible range by a number of items on each side.
 * - `pixels`: extend the viewport by a distance on each side, then take the items it intersects.
 * - `custom`: return any range that contains the visible one, e.g. from a velocity prediction.
 *
 * `before` is the side of smaller offsets (up), `after` the side of larger offsets (down).
 */
export type VirtualOverscan =
  | { kind: 'items'; before: number; after: number }
  | { kind: 'pixels'; before: number; after: number }
  | { kind: 'custom'; range: (context: VirtualOverscanContext) => VirtualRange | null };

export interface VirtualItem {
  key: string;
  index: number;
  /** Offset of the item's top edge from the top of the scrollable content. */
  start: number;
  size: number;
  end: number;
  /** False while the size is still an estimate. */
  measured: boolean;
}

/** Inclusive index range. */
export interface VirtualRange {
  startIndex: number;
  endIndex: number;
}

export interface VirtualCoreStats {
  count: number;
  /** Items in the current window whose size is measured. */
  measured: number;
  /** Items in the current window still using an estimate. */
  estimated: number;
  /** Measured sizes held in the cache, including keys outside the current window. */
  cachedSizes: number;
}

export type VirtualCore = ReturnType<typeof createVirtualCore>;

function assertSize(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative, received ${value}.`);
  }
}

function assertOverscan(overscan: VirtualOverscan) {
  if (overscan.kind === 'custom') return;
  for (const [side, value] of [
    ['before', overscan.before],
    ['after', overscan.after],
  ] as const) {
    assertSize(`${overscan.kind} overscan ${side}`, value);
    if (overscan.kind === 'items' && !Number.isInteger(value)) {
      throw new RangeError(`items overscan ${side} must be an integer, received ${value}.`);
    }
  }
}

const noOverscan: VirtualOverscan = { kind: 'pixels', before: 0, after: 0 };

export function createVirtualCore(options: VirtualCoreOptions) {
  const { estimateSize } = options;
  let paddingStart = options.paddingStart ?? 0;
  let paddingEnd = options.paddingEnd ?? 0;
  assertSize('paddingStart', paddingStart);
  assertSize('paddingEnd', paddingEnd);
  let overscan = options.overscan ?? noOverscan;
  assertOverscan(overscan);
  /** Null until the caller reports one, e.g. before the scroll container mounts. */
  let viewport: VirtualViewport | null = null;

  /** Measured sizes by key. Survives window changes, so revisited content lays out exactly. */
  const measuredSizes = new Map<string, number>();
  let keys: readonly string[] = [];
  let indexByKey = new Map<string, number>();
  /** Resolved size per index: the measurement when there is one, otherwise the estimate. */
  let sizes: number[] = [];
  /** starts[i] is the offset of item i relative to paddingStart; starts[count] is the sum. */
  let starts: number[] = [0];
  /** First index whose start may be stale. Equal to count when the layout is clean. */
  let dirtyFrom = 0;

  function resolveSize(key: string) {
    const measured = measuredSizes.get(key);
    if (measured !== undefined) return measured;
    const estimate = estimateSize(key);
    assertSize(`estimateSize("${key}")`, estimate);
    return estimate;
  }

  function invalidateFrom(index: number) {
    if (index < dirtyFrom) dirtyFrom = index;
  }

  /** Recompute prefix sums from the first stale index. Linear, but only over the dirty tail. */
  function ensureLayout() {
    for (let index = dirtyFrom; index < keys.length; index++) {
      starts[index + 1] = starts[index]! + sizes[index]!;
    }
    dirtyFrom = keys.length;
  }

  function itemAt(index: number): VirtualItem {
    if (!Number.isInteger(index) || index < 0 || index >= keys.length) {
      throw new RangeError(`Index ${index} is outside 0..${keys.length - 1}.`);
    }
    ensureLayout();
    const key = keys[index]!;
    const start = paddingStart + starts[index]!;
    const size = sizes[index]!;
    return { key, index, start, size, end: start + size, measured: measuredSizes.has(key) };
  }

  /** First index whose end is strictly after `offset`, or count when there is none. */
  function firstEndingAfter(offset: number) {
    let low = 0;
    let high = keys.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (paddingStart + starts[mid + 1]! > offset) high = mid;
      else low = mid + 1;
    }
    return low;
  }

  /** Last index whose start is strictly before `offset`, or -1 when there is none. */
  function lastStartingBefore(offset: number) {
    let low = 0;
    let high = keys.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (paddingStart + starts[mid]! < offset) low = mid + 1;
      else high = mid;
    }
    return low - 1;
  }

  /**
   * Items that intersect the half-open pixel interval [start, end). An item touching the
   * interval only at an edge does not intersect it; a zero-size item strictly inside does.
   */
  function rangeFor(start: number, end: number): VirtualRange | null {
    if (!(start <= end)) throw new RangeError(`Invalid pixel interval [${start}, ${end}).`);
    ensureLayout();
    const startIndex = firstEndingAfter(start);
    const endIndex = lastStartingBefore(end);
    return startIndex <= endIndex ? { startIndex, endIndex } : null;
  }

  function totalSize() {
    ensureLayout();
    return paddingStart + starts[keys.length]! + paddingEnd;
  }

  /** Items intersecting the reported viewport, or null before one is reported. */
  function visibleRange() {
    return viewport && rangeFor(viewport.offset, viewport.offset + viewport.size);
  }

  const layout: VirtualLayoutReader = {
    get count() {
      return keys.length;
    },
    item: itemAt,
    rangeFor,
    totalSize,
  };

  /** A custom strategy may widen the range freely but must stay in bounds and cover the viewport. */
  function assertCustomRange(range: VirtualRange | null, visible: VirtualRange | null) {
    if (range === null) {
      if (visible) throw new RangeError('Custom overscan returned null while items are visible.');
      return;
    }
    const { startIndex, endIndex } = range;
    if (
      !Number.isInteger(startIndex) ||
      !Number.isInteger(endIndex) ||
      startIndex < 0 ||
      endIndex >= keys.length ||
      startIndex > endIndex
    ) {
      throw new RangeError(`Custom overscan returned ${startIndex}..${endIndex}, outside 0..${keys.length - 1}.`);
    }
    if (visible && (startIndex > visible.startIndex || endIndex < visible.endIndex)) {
      throw new RangeError(
        `Custom overscan returned ${startIndex}..${endIndex}, which does not contain the visible ${visible.startIndex}..${visible.endIndex}.`
      );
    }
  }

  return {
    get count() {
      return keys.length;
    },

    get keys() {
      return keys;
    },

    /**
     * Replace the window. Measured sizes are kept by key, so a prepend only shifts existing
     * items by the size of what was inserted, and a disjoint window can later return intact.
     */
    setKeys(next: readonly string[]) {
      const nextIndex = new Map<string, number>();
      for (const [index, key] of next.entries()) {
        if (nextIndex.has(key)) throw new Error(`Duplicate key "${key}" in virtual list window.`);
        nextIndex.set(key, index);
      }
      keys = [...next];
      indexByKey = nextIndex;
      sizes = keys.map(resolveSize);
      starts = Array.from({ length: keys.length + 1 }, () => 0);
      dirtyFrom = 0;
    },

    /**
     * Record a measured size. Keys outside the current window are cached for later. Returns
     * true when the current layout changed.
     */
    measure(key: string, size: number) {
      assertSize(`size of "${key}"`, size);
      measuredSizes.set(key, size);
      const index = indexByKey.get(key);
      if (index === undefined || sizes[index] === size) return false;
      sizes[index] = size;
      invalidateFrom(index);
      return true;
    },

    /**
     * Drop a key's cached measurement, the inverse of `measure`. A key in the current window
     * falls back to its estimate. Returns true when the current layout changed: false for a key
     * with no measurement, a key outside the window, or an estimate equal to the dropped size.
     * Forgetting many keys still costs one layout recompute, on the next read.
     */
    forget(key: string) {
      if (!measuredSizes.delete(key)) return false;
      const index = indexByKey.get(key);
      if (index === undefined) return false;
      const size = resolveSize(key);
      if (sizes[index] === size) return false;
      sizes[index] = size;
      invalidateFrom(index);
      return true;
    },

    /**
     * Every key with a cached measurement, in or out of the current window, as a fresh array the
     * caller owns. Order is unspecified. Safe to `measure` or `forget` while iterating it.
     */
    measuredKeys() {
      return [...measuredSizes.keys()];
    },

    setPadding({ start = paddingStart, end = paddingEnd }: { start?: number; end?: number }) {
      assertSize('paddingStart', start);
      assertSize('paddingEnd', end);
      paddingStart = start;
      paddingEnd = end;
    },

    totalSize,

    item: itemAt,

    indexOf(key: string) {
      return indexByKey.get(key);
    },

    /** Top offset of a key in the current window, or undefined when it is not in the window. */
    offsetOf(key: string) {
      const index = indexByKey.get(key);
      return index === undefined ? undefined : itemAt(index).start;
    },

    /** Measured size of a key, whether or not it is in the current window. */
    measuredSize(key: string) {
      return measuredSizes.get(key);
    },

    rangeFor,

    /** Report the scroll container's visible area. Call on every scroll and resize. */
    setViewport(next: VirtualViewport) {
      if (!Number.isFinite(next.offset))
        throw new RangeError(`Viewport offset must be finite, received ${next.offset}.`);
      assertSize('viewport size', next.size);
      viewport = { offset: next.offset, size: next.size };
    },

    get viewport() {
      return viewport;
    },

    setOverscan(next: VirtualOverscan) {
      assertOverscan(next);
      overscan = next;
    },

    get overscan() {
      return overscan;
    },

    visibleRange,

    /**
     * Items to mount: the visible range extended by the overscan strategy. Null before a
     * viewport is reported, and when nothing intersects the viewport under `items` overscan.
     */
    renderRange(): VirtualRange | null {
      if (!viewport) return null;
      const visible = visibleRange();
      switch (overscan.kind) {
        case 'pixels':
          return rangeFor(viewport.offset - overscan.before, viewport.offset + viewport.size + overscan.after);
        case 'items':
          return (
            visible && {
              startIndex: Math.max(0, visible.startIndex - overscan.before),
              endIndex: Math.min(keys.length - 1, visible.endIndex + overscan.after),
            }
          );
        case 'custom': {
          const range = overscan.range({ viewport, visible, layout });
          assertCustomRange(range, visible);
          return range;
        }
      }
    },

    items(range: VirtualRange) {
      const items: VirtualItem[] = [];
      for (let index = range.startIndex; index <= range.endIndex; index++) items.push(itemAt(index));
      return items;
    },

    stats(): VirtualCoreStats {
      let measured = 0;
      for (const key of keys) if (measuredSizes.has(key)) measured++;
      return { count: keys.length, measured, estimated: keys.length - measured, cachedSizes: measuredSizes.size };
    },
  };
}
