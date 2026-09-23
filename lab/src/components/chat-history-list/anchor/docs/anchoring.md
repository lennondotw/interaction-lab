# Anchoring

Anchoring keeps the reading position still while the layout changes: rows measured for the
first time, rows whose content changes, rows prepended or removed, and a viewport that is
resized. [`anchor.ts`](../anchor.ts) is two pure functions over the virtual core's layout. It
never touches the DOM or the scroll position; the caller captures, changes the layout, resolves,
and writes the offset it gets back.

## Reference line and anchor point

The reference line sits at `ratio` of the viewport height: 0 is the top edge, 0.5 the middle,
1 the bottom edge. The point held still on a row sits at the same ratio of that row, so:

| Ratio | Holds still           | A row that grows at the line…   |
| ----- | --------------------- | ------------------------------- |
| 0     | the row's top edge    | grows downward                  |
| 0.5   | the row's middle      | grows equally up and down       |
| 1     | the row's bottom edge | grows upward, as in a chat list |

A candidate records the distance of its anchor point from the line (`fromLine`). Resolving
puts the row back at that distance from the line of the viewport as it is now. When the
viewport is resized, that distance is kept, so at ratio 1 the bottom of the viewport stays
where it was and at ratio 0 the top does.

## Candidates

`captureAnchor(layout, viewport, ratio, margin?)` records every row within `margin` pixels of
the viewport (the viewport's height by default), best first:

1. by distance from the line, 0 for a row the line crosses;
2. on a tie, by how close the row's anchor point is to the line, so a line on a boundary picks
   the row starting there at ratio 0 and the row ending there at ratio 1;
3. then by order.

`resolveAnchor(snapshot, layout, viewportSize)` returns the offset for the first candidate still
in the window, or null when none is. Positions come from the core, not the DOM, so a candidate
that is not mounted resolves as long as its key is in the window; only removal, trimming or
replacing the window invalidates it. A null result means the window was replaced, and nothing
should be compensated.

## Rules for callers

- **Capture immediately before each layout change,** while the core still holds the old layout.
  A viewport move is not a layout change: report the new offset first, then capture.
- **Batch a frame's changes.** Capture once, apply every change (viewport size, forgotten sizes,
  all measurements), resolve once, and write before the frame paints. Resolving after each
  measurement instead would compound rounding.
- **Keep the reading offset as the source of truth.** Scroll positions snap to a grid the
  browser chooses: the screen's device pixels in Chromium, whole pixels truncated toward zero
  in Safari (measured in
  [`archive/2026-09-scroll-offset-quantization`](../../../../../../archive/2026-09-scroll-offset-quantization/README.md)). Keep the fractional offset the anchor asked for as the reading offset, write the
  scroller only when that lands on a different device pixel, and keep the reading offset while
  the scroller still reads what was last written. Never read the snapped `scrollTop` back into
  it, and never accumulate compensations: resolve each change afresh from its snapshot, so the
  error stays within one quantization step instead of growing.
- The result may need clamping to the scrollable range; a clamped result cannot hold the anchor.

## Decision: positions from the core, not the DOM

Anchoring reads positions from the core rather than measuring elements. It then works the same
for rows in normal flow and for absolutely positioned rows, for rows that are not mounted, and
in tests without a DOM. The cost is an invariant: at every paint, the DOM layout must equal the
core's. The playground checks it by comparing the anchor row's element with the core's position
for it after each change (the DOM residual). It does not correct a residual: that would hide a
bug in the scroll position. A residual of a layout unit (1/64px) or more is logged to the
console and shown in the state panel.

## Tests

- [`anchor.test.ts`](../__tests__/anchor.test.ts): ranking, boundary ties at each ratio, the
  margin, prepends, changes below the anchor, the anchor row growing at each ratio, viewport
  resizes, falling back when the anchor row is removed, unmounted anchors, and empty snapshots.
- [`anchor-simulation.test.ts`](../__tests__/anchor-simulation.test.ts): the simulated viewport
  at ratios 0, 0.5 and 1 through upward steps over unmeasured rows, random jumps, prepends,
  forgotten measurements, removal of the anchor row and viewport resizes, each with zero drift;
  plus window replacement, which must not compensate.

[Index](../../README.md)
