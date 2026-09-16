# Final layout projection

A flight sent from earlier history should aim at its eventual visible position, not the real row's temporarily offscreen position.

## Decision and why

Layout entries publish the difference between their current and target footprints. Scrolling and flights consume the same projection:

```text
finalBottom = max(0, currentContentHeight + pendingHeight - viewportHeight)
projectedY = currentBodyY + pendingHeightBeforeRow + ownGapRemaining
             - max(0, finalBottom - scrollTop)
```

As scrolling advances, the real body's screen position and remaining scroll change together. As slots expand, their current geometry grows while pending height decreases. Those changes cancel in the projection when the final layout is unchanged. The target row's own changing leading gap is included separately.

This shared geometry avoids one subsystem aiming at the current bottom while another aims at the expanded bottom. It includes registered message layout entries and typing entry transitions; it is not a prediction of arbitrary future content or every possible removal. Unregistered geometry changes update the measured destination when they occur.

New messages or genuinely changed dimensions can move the final destination. Projection reports that new geometry; [destination compensation](./destination-compensation.md) makes its visual adoption smooth.

## Evidence

- Implementation: [pending height and projectedChatY](../chat-layout.ts).
- History: [8a1e0aa](https://github.com/lennondotw/interaction-lab/commit/8a1e0aa); later changes are reflected in the current implementation.
- Validation: [relevant checks](./verification.md#geometry-and-flight).

[Architecture index](../README.md)
