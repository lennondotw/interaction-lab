# Virtual core size model

[`virtual-core.ts`](../virtual-core.ts) is a headless size model. It owns these facts:

| Fact                       | Detail                                                                 |
| -------------------------- | ---------------------------------------------------------------------- |
| Ordered keys of the window | Set with `setKeys`; duplicate keys throw.                              |
| Measured size of every key | Kept by key across window changes; unmeasured keys use `estimateSize`. |
| Layout                     | Prefix sums, recomputed lazily from the first index that changed.      |
| Viewport                   | The offset and size the caller last reported with `setViewport`.       |
| Overscan strategy          | Set at creation or with `setOverscan`.                                 |

From these it derives the visible range and the render range. It has no DOM and no
scheduling, which keeps the whole layout testable without a browser.

## Scope

These are deliberate boundaries, not missing features:

- **It never scrolls.** It reads the viewport it is given but never writes a scroll position,
  animates, or compensates for layout changes. A scroll controller owns all of that.
- **It never observes.** Size changes are reported by the caller: row sizes with `measure`,
  the container with `setViewport`. Nothing is detected automatically.
- **It never notifies.** There are no subscriptions or callbacks. After reporting a change, the
  caller reads the ranges again; `measure` returns whether the layout changed.
- **One vertical column only.** Multiple lanes and horizontal lists are not supported and are
  not planned.

## Viewport and overscan

`setViewport({ offset, size })` should be called on every scroll and resize. The offset may be
negative or past the end during elastic overscroll. Before the first report, both ranges are
`null`. `visibleRange()` returns the items intersecting the viewport; `renderRange()` returns
the items to mount, extended by one of three strategies:

| Strategy | Configuration                                   | Behaviour                                                                    |
| -------- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| Items    | `{ kind: 'items', before, after }`              | Extend the visible range by whole items, clamped to the window.              |
| Pixels   | `{ kind: 'pixels', before, after }`             | Extend the viewport by a distance, then take the items it intersects.        |
| Custom   | `{ kind: 'custom', range: (context) => range }` | Any range that contains the visible one; for example, a velocity prediction. |

`before` is the side of smaller offsets and `after` the side of larger ones, so each side can
differ; the default is no overscan. Item overscan has nothing to extend when no item intersects
the viewport and returns `null`; pixel overscan can still reach items from padding. A custom
strategy receives the viewport, the visible range and read-only layout queries. Its result
must stay inside the window and contain the visible range, or the call throws.

## Decisions

- **Measurements are keyed by identity, not index.** A prepend shifts existing items by exactly
  the size of what was inserted, and a window that leaves and later returns lays out exactly as
  before. Nothing is re-measured.
- **Queries are pixel intervals.** `rangeFor(start, end)` returns the items intersecting the
  half-open interval `[start, end)`. An item that only touches an edge is excluded; a zero-size
  item strictly inside is included. The visible and render ranges are built on it.
- **Invariants fail loudly.** Negative or non-finite sizes, estimates, padding, viewports and
  overscan distances throw, as do fractional item counts, duplicate keys, out-of-range indexes,
  inverted intervals and custom ranges that miss the viewport.
- **Recalculation is linear over the dirty tail.** Windows hold hundreds to low thousands of
  items, so a prefix-sum array is enough. A Fenwick tree would make measurement O(log n) if a
  window ever grows far larger.

## A complete API without needless sugar

Completeness is a hard requirement: every policy a caller needs must be expressible. Needless
redundancy is avoided, but zero redundancy is not the goal. A convenience method is worth
keeping when it meets any of these:

- **It is the natural query of the domain**, such as the offset of a key (`offsetOf`) or the
  items in a range (`items`).
- **It is in a better cost class** than its composition, such as `indexOf` at O(1) against
  scanning `keys` at O(n).
- **It prevents a common mistake** a caller would make composing it by hand.

A method that meets none of these and only shortens a composition is not added; the
composition is documented here instead.

The cache is managed with two per-key primitives: `forget(key)` drops one measurement and is the
inverse of `measure`, and `measuredKeys()` returns a snapshot of every measured key. They replaced
an earlier `retainSizes(keep)`, which combined enumerating, deciding and deleting in one call,
made the most common case (one message edited while unmounted) an inverted predicate over the
whole cache, and left no honest way to read the cache.

Common policies and how they compose:

- **Forget one message** (edited, reacted to, or its image loaded while unmounted):
  `forget(key)`.
- **Keep only some measurements** (bounding memory when data segments are released, or keeping
  only mounted rows after a width change, which their observers measure again):

  ```ts
  for (const key of core.measuredKeys()) if (!keep(key)) core.forget(key);
  ```

  Each `forget` only moves the start of the stale layout, so many of them cost one recompute.

- **Keep an old size as an estimate** (a better guess than the default until the row mounts
  again): record the old size in a map the caller owns and have `estimateSize` read it, then
  `forget(key)`. The row is re-estimated from that map and is correctly reported as unmeasured.
- **Change how rows are estimated**: `estimateSize` reads the caller's state; after changing
  that state, call `setKeys(core.keys)` and every unmeasured row is estimated again.

## Why not TanStack Virtual

The list this design comes from used `@tanstack/virtual-core`, but disabled its scroll
compensation, scroll execution, overscan and append following, and wrapped its offset reading.
What remained in use was the keyed size cache, prefix offsets and range lookup. Owning that
small piece gives two things the rest of the design depends on: measuring synchronously inside
one layout transaction (for single-instance jumps), and exposing estimate-versus-measured state
directly to debugging tools.

[Index](../../README.md)
