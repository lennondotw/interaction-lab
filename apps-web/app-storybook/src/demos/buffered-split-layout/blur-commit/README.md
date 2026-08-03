# Buffered Split Layout — Blur Commit

The same buffered split layout as
[buffered-split-layout-view-transition](../view-transition-commit/README.md),
with View Transition removed and nothing put in its place.

The size model is unchanged: a `locked` width the real content lays out at, a
`visual` width the user sees, and `scaleX(...)` covering the difference so no
content reflows during a gesture. What changes is only the commit. There is no
old/new cross-dissolve, no snapshot, and no second copy of the content — the
layout is swapped while the 6px blur is at full strength, and the blur is the
only thing hiding it.

## What that removes

- No `view-transition-name` anywhere, so the debug overlays' DOM `z-index` just
  works. In the snapshot version they had to join the transition purely to keep
  their stacking order.
- No `<style>` block. The snapshot version needed one for the
  `::view-transition-*` pseudo-element rules, which cannot be scoped to a
  component.
- No `flushSync`. `trailingOpen` no longer participates in geometry — the right
  pane's offset is a custom property — so it is just an interaction flag.
- Motion is a value animator here (`animate`), not a layout engine. Both panes
  are driven by one progress value, so the spring-versus-bezier timing mismatch
  between the two panes is gone.

## What that costs

**The toggle leads with a blur-in.** A View Transition can ease blur _in_ during
the transition, because the old bitmap covers the reflow while it does. Here the
reflow is instantaneous, so the blur has to already be up when it happens.
Dragging and window resize get that for free — blur has been at 6px since the
gesture started. Toggling starts from zero, so it spends `BLUR_ENTER_MS` (140ms)
raising the blur before committing. That is 140ms of added latency on toggle, and
it is the only thing this approach adds.

**No cross-dissolve.** The reflow is hidden by blur alone rather than by fading
between two renderings of it. Whether 6px is enough to hide the line-breaks
changing is the question this demo exists to answer by eye — open both stories
side by side with `?motionDebug=slow`.

## Measured

An overlay appended to `body` at `z-index: 2147483647`, sampled at the same
moment in a commit — see
[archive/2026-08-view-transition-overlay-stacking](../../../../../../archive/2026-08-view-transition-overlay-stacking/README.md)
for how the snapshot version was measured:

|                  | overlay covered | overlay clickable | `startViewTransition` calls |
| ---------------- | --------------- | ----------------- | --------------------------- |
| snapshot version | **43.9%**       | **no**            | 1 per commit                |
| this version     | **0%**          | **yes**           | **0**                       |

Both commit exactly once per gesture, and in both, `locked` is unchanged for the
whole of a drag or a window resize — the buffering itself is not what View
Transition was providing.
