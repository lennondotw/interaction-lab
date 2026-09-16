# Flight-to-message handoff

An animation finishing is not sufficient evidence that its real layout anchor has arrived. Keep the visual copy until normal handoff can occur without a jump.

## Decision and why

After the flight's original shape clock ends, an arrival loop keeps painting its final shape. Normal handoff requires all of the following:

- Remaining native scroll distance is at most 1px.
- No registered chat layout animation remains in the viewport.
- Destination compensation has stopped animating.
- The copy's top and the real bubble's top differ by at most 1px.

Then stop the flight, remove its layer, and restore the original visibility. The 1px tolerance accommodates geometry rounding; it is not the bottom-follow threshold. Checking all layout entries is conservative: an unrelated active slot can delay handoff.

## User interruption is an intentional immediate handoff

Explicit interaction with the scrolling viewport stops all active flights and reveals their real rows immediately:

- Upward `wheel` input (`deltaY < 0`, excluding `ctrlKey` zoom gestures).
- `pointerdown` in the viewport when `interruptOnPointerDown` is enabled. It defaults to `false`.
- Actual unowned upward scrolling, including a drag after a non-blocking pointer press.
- `ArrowUp`, `ArrowDown`, `PageUp`, `PageDown`, `Home`, `End`, or Space received by the viewport.

The scroll controller owns these decisions and emits a shared interruption event consumed by flight. This is not a generic `scroll` listener. Programmatic catch-up, browser clamping after layout changes,
and downward wheel input alone do not cancel flight. Cancellation removes the visual copies, restores
real-bubble visibility, and clears pending departures; it does not delete messages or prevent native input.

The flight predicts a destination at the final bottom, and normal handoff assumes the real row will
reach it. Once the user interrupts catch-up, that assumption is no longer reliable. Immediate handoff
keeps interaction attached to the real list instead of leaving an overlay on an obsolete route or waiting
indefinitely for bottom alignment. This is the intended interaction policy, not an animation failure:
user control takes priority over completing the morph or achieving an aligned animated arrival.

Reduced motion, target removal, and disposal also release the copy as separate cleanup paths.

A stuck flight may therefore indicate a scroll-ownership or layout-projection problem rather than a slow spring. Verify the handoff predicates instead of adding a timeout that conceals misalignment.

## Evidence

- Implementation: [arrive, stop, and cancellation](../../chat-send-flight/chat-send-flight.ts).
- History: [072ee4d](https://github.com/lennondotw/interaction-lab/commit/072ee4d); later changes are reflected in the current implementation.
- Validation: [relevant checks](./verification.md#geometry-and-flight).

[Architecture index](../README.md)
