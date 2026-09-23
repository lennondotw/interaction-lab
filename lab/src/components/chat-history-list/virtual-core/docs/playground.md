# Playground story

**Components / Chat history list / Virtual core** is a wireframe view of the core and of
[anchoring](../../anchor/docs/anchoring.md) on top of it. The list scrolls natively with the
browser's `overflow-anchor` turned off. With `anchoring` on, every layout change holds the row
at the reference line still; with it off (the **Unanchored** story), the list shows the core's
raw layout, where a row resized above the viewport moves everything below it. A note under each
story explains whichever of the two is showing.

- `layout` switches in place between `flow`, where mounted rows sit in normal flow between
  top and bottom padding sized from the core, and `absolute`, where each row is positioned at
  the core's offset for it. `anchorRatio` moves the reference line (**CenterAnchor** and
  **BottomAnchor** preset it to 0.5 and 1).

- The list sits in a `ResizableWindow`; dragging its edges or corner changes the viewport size
  the core receives.
- One `ResizeObserver` watches the scroller and every row, so all size changes in a frame
  arrive together and are handled as one change. React renders only the rows. Every layout
  change runs through one transaction, described [below](#layout-transactions), before the
  frame paints.
- The minimap and the state panel are painters: they read the core directly and are redrawn
  imperatively at most once per animation frame, so they follow every frame of a scroll
  (120 fps on a 120 Hz display) without a React render.
- The minimap is a Canvas 2D drawing of every row the core knows, measured or estimated, with
  the render range, the visible range, a thin red frame around the viewport, and faint lines
  across its full width at the first and last pixel of the list. Cmd + wheel zooms around the
  pointer and the plain wheel scrolls the minimap's own view; see
  [Minimap view](./minimap.md#view) for how fitting, zooming and following behave. Dragging on the
  minimap scrolls the list to that point.
- Painters are flushed synchronously when a ResizeObserver reports new row sizes. That
  callback runs after the frame's animation callbacks but before its paint, so the minimap
  never shows a layout one frame older than the rows.
- The state panel below lists counts, total size, both ranges, the viewport, and the
  minimap's view: fitted or zoomed, its scale, and the list offset at its top edge. It also
  shows the row anchoring would hold now and its distance from the line, the last change
  (what ran, which row it held, how far the reading offset moved), the DOM residual, and the
  presentation: the scroller's `scrollTop` and its quantization error against the reading
  offset. Both show the largest value seen since mount.
- With anchoring on, the minimap fills the anchor row in purple and draws the reference line
  across the rows.
- When a row's measured size changes, including its first measurement, the row is covered at
  once by a cyan overlay with a small note in its bottom-right corner (`≈80px → 153px` for a
  first measurement, `97px → 111px (+14px)` for a resize). Both fade out together over 600 ms
  on CSS `ease-in`, `cubic-bezier(0.42, 0, 1, 1)`, through the Web Animations API. The minimap
  highlights the same row over the same 600 ms, evaluating that curve with Motion's
  `cubicBezier`, so the two fade identically. The duration and control points are defined once
  in `playground-model.ts`.
- Buttons prepend, append and remove rows, give every row new content, drop all measurements,
  and keep resizing a few mounted rows. Each row can gain or lose a line or be removed.
- **Insert pulsing row above** inserts a row just above the first visible one with a striped
  block whose height follows a raised cosine, from 16px up to 176px and back every 1.6 s. It
  changes size on every frame, like a height animation above the anchor. It is inserted next to
  the viewport rather than at the start of the list, where it would only be mounted with the
  list scrolled to the top. The height is a function of the clock, so a pulsing row that
  unmounts and mounts again resumes where it would be. **Stop pulsing** removes the blocks.
- Controls choose the overscan strategy (`none`, `pixels`, `items`, or a `directional` custom
  strategy that extends further in the scroll direction), the estimate, the row count and the
  seed.

## Layout transactions

[`playground-driver.ts`](../debug/playground-driver.ts) runs every layout change, whether a
button, a story control, a ResizeObserver callback or a scroll that changes the render range:

1. capture the anchor from the core while it still holds the old layout;
2. apply the change;
3. render synchronously, measure every mounted row, and set the reading offset that holds the
   anchor, repeating while that mounts rows the core has not measured (more than 8 passes
   throws);
4. measure the DOM residual: the anchor row's element minus the core's position for it. It is
   not corrected; one of a layout unit or more is logged as an error;
5. flash the rows whose size changed and repaint the painters.

A scroll reports its new offset first and runs a transaction only when the render range
changes, so newly mounted rows are measured before they paint. Changes that arrive as story
controls run in a microtask after React's commit, since a synchronous render cannot run inside
one. The echo of our own `scrollTop` write is recognised and not treated as a user scroll, and
the scroll direction's reference point moves with each compensation.

### State and its sources

| Layer          | State                      | Set by                                                   |
| -------------- | -------------------------- | -------------------------------------------------------- |
| Content layout | the core's offsets         | measurements and window changes, never a compensation    |
| Reading offset | the core's viewport offset | an anchor resolution, or a user scroll read back         |
| Presentation   | the scroller's `scrollTop` | derived from the reading offset; never read back into it |

The presentation is written only when the reading offset lands on a different device pixel.
While the scroller still reads the value last written, the reading offset stands; any other
value means the user scrolled or the browser clamped, and the reading offset follows it. The
difference between the two is the quantization error. Each change's compensation is logged as
a delta and never accumulated.

Measured in Chromium at a device pixel ratio of 2, with two pulsing rows above the viewport for
240 frames, the anchor point moved at most 0.25px, half a device pixel, in both layouts at
ratios 0, 0.5 and 1, with no accumulation. That drift is the quantization error; the DOM
residual stayed at zero. Chromium keeps `scrollTop` on a 0.5px grid and Safari on whole pixels,
so the same error is up to a whole pixel in Safari, and in either browser it moves painted
content between neighbouring device pixels from frame to frame.

## Scroll direction hysteresis

The `directional` strategy extends `after` pixels in the scroll direction and `before` pixels
behind it, so a flip of direction moves the render range to the other side. A direction taken
from the last scroll delta alone flips on every 1px of jitter.

The direction therefore has hysteresis. While the list moves forward, the furthest offset
reached is remembered. Moving back flips the direction only once the list is more than
`directionHysteresis` (24px) behind that furthest point; smaller movements, however many, keep
the current direction. The distance is measured from the furthest point, not from the last
step, so many small steps back still add up to a flip.

[Index](../../README.md)
