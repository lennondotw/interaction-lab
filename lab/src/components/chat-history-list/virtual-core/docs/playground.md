# Playground story

**Components / Chat history list / Virtual core** is a wireframe view of the core. The list
scrolls natively with `overflow-anchor: none` and has no anchoring of its own, so it shows the
core's raw layout: a row resized above the viewport moves everything below it. Every story
ends with a note saying this jumping is expected and why: keeping the reading position still
belongs to the scroll controller that will sit on top of the core.

- The list sits in a `ResizableWindow`; dragging its edges or corner changes the viewport size
  the core receives.
- Rows report their size through a `ResizeObserver`. React renders only the rows, and commits
  only when the render range or the layout changes; that commit happens inside the scroll or
  resize event, so rows are measured and repositioned before the frame paints.
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
  minimap's view: fitted or zoomed, its scale, and the list offset at its top edge.
- When a row's measured size changes, including its first measurement, the row is covered at
  once by a cyan overlay with a small note in its bottom-right corner (`≈80px → 153px` for a
  first measurement, `97px → 111px (+14px)` for a resize). Both fade out together over 600 ms
  on CSS `ease-in`, `cubic-bezier(0.42, 0, 1, 1)`, through the Web Animations API. The minimap
  highlights the same row over the same 600 ms, evaluating that curve with Motion's
  `cubicBezier`, so the two fade identically. The duration and control points are defined once
  in `playground-model.ts`.
- Buttons prepend, append and remove rows, give every row new content, drop all measurements,
  and keep resizing a few mounted rows. Each row can gain or lose a line or be removed.
- Controls choose the overscan strategy (`none`, `pixels`, `items`, or a `directional` custom
  strategy that extends further in the scroll direction), the estimate, the row count and the
  seed.

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
