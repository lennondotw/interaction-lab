# Flight-to-message handoff

An animation finishing is not sufficient evidence that its real layout anchor has arrived. Keep the visual copy until normal handoff can occur without a jump.

## Decision and why

After the flight's original shape clock ends, an arrival loop keeps painting its final shape. Normal handoff requires all of the following:

- Remaining native scroll distance is at most 1px.
- No registered chat layout animation remains in the viewport.
- Destination compensation has stopped animating.
- The copy's top and the real bubble's top differ by at most 1px.

Then stop the flight, remove its layer, and restore the original visibility. The 1px tolerance accommodates geometry rounding; it is not the bottom-follow threshold. Checking all layout entries is conservative: an unrelated active slot can delay handoff.

User interruption is a separate path. Upward wheel input, a pointer press in the scrolling viewport, or a scroll key stops the flight and reveals the real row immediately. Reduced motion, target removal, and disposal also release the copy. These paths prioritize control and cleanup over a seamless arrival.

A stuck flight may therefore indicate a scroll-ownership or layout-projection problem rather than a slow spring. Verify the handoff predicates instead of adding a timeout that conceals misalignment.

## Evidence

- Implementation: [arrive, stop, and cancellation](../../chat-send-flight/chat-send-flight.ts).
- History: [072ee4d](https://github.com/lennondotw/interaction-lab/commit/072ee4d); later changes are reflected in the current implementation.
- Validation: [relevant checks](./verification.md#geometry-and-flight).

[Architecture index](../README.md)
