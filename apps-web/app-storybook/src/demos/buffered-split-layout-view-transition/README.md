# Buffered Split Layout View Transition

This demo explores a buffered split layout strategy. The core idea is to separate immediate interaction feedback from expensive committed content layout.

During live interaction, the panes respond visually without recomputing the real content layout. The expensive layout work is deferred to a commit phase.

## Size Model

The component tracks two kinds of width:

- `visual width`: the pane width the user sees right now.
- `locked/layout width`: the width used by the real content layout.

During live interaction, only the `visual width` changes. The content layer keeps its existing `locked/layout width` and is compressed or stretched with `scaleX(...)` to match the current visual width.

Blur is applied after the content layer has been scaled, not before. This keeps the blur radius independent from the pane scale, so the blur strength does not get diluted by horizontal compression.

## Manual Resize

When the user drags the divider:

1. `pointerdown` immediately enters live resize.
2. The left and right pane shells update their visual width in real time.
3. The content layers keep their locked layout width and use `scaleX(...)` to match the live visual width.
4. Both content layers enter a 6px blur.
5. No real content layout commit happens while dragging.
6. `pointerup` commits the final target layout.
7. The expensive real content reflow happens once, and only once, after the drag ends.
8. The commit uses View Transition old/new snapshots for cross-dissolve.
9. Blur exit is synchronized with the cross-dissolve and stays slightly slower, so the reflow is not exposed without blur.

The point of this path is not to make per-frame layout cheaper. It is to reduce real content layout work during the drag to zero and concentrate it into one commit at the end.

## Window Resize

Browser window resize does not expose a reliable release signal, so this path uses a debounce fallback.

The first resize event acts as the leading edge. The component immediately enters the same live resize feedback used by manual resize: it updates `visual width`, `scaleX(...)`, and blur.

Continuous resize events keep updating only the live visual state. They do not commit the real content layout every frame.

When the trailing debounce fires, the component performs one committed layout update. The commit animation strategy matches manual resize: View Transition cross-dissolve plus blur exit.

In short, the leading edge provides immediate feedback, and the trailing edge persists the real layout.

## Expand And Collapse

Right pane expand and collapse uses Motion FLIP. The right pane does not need blur in this path because its width is not being visually compressed by the resize strategy.

Left pane expand and collapse uses a handwritten FLIP-like sequence:

1. View Transition captures the target layout snapshot.
2. The left pane quickly enters blur.
3. A short cross-dissolve switches to the target snapshot scaled back to the current width.
4. That target snapshot transforms to the final width.
5. After it reaches the final layout, blur exits slowly.

This path uses a fast-in, slow-out rhythm: blur enter and cross-dissolve are short, while blur exit is longer.

## View Transition Role

This demo does not rely on View Transition's default geometry animation. The default animation is disabled because it can introduce uncontrolled scale and position changes.

View Transition is used mainly for two things:

- Capturing old/new snapshots around a DOM update.
- Letting named regions participate as independent snapshots via `view-transition-name`.

The actual fade, transform, and blur timing is controlled by this component's CSS and JS.

## Debug Overlay

The left and right debug overlays explain the internal state:

- `visual`: the current visual width.
- `locked`: the current locked layout width.
- `content locked`: the width used by the real content layout.
- `scale`: the ratio between visual width and locked width.
- `preferred`: the stored split ratio.
- `mode`: the current interaction mode, either `idle`, `dragging`, or `window resize`.

The debug overlays do not participate in blur and do not animate. They enter View Transition only to avoid being temporarily covered by the View Transition top layer during transitions.
