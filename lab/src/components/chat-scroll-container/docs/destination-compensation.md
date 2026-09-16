# Destination compensation during consecutive sends

Later messages can move an earlier flight's destination. Preserve the original shape animation and add a separate spring for that displacement.

## Decision and why

Each message has a unique ID and its own captured departure, including repeated identical text. A flight records its initial projected destination. Subsequent paints calculate the new destination's displacement from that initial value and retarget an additive vertical MotionValue when the displacement changes materially.

```text
visualCenterY = originalFlightY(elapsed) + destinationOffset
```

Retargeting preserves the compensation's current position and velocity. It does not restart the original elapsed-time clock or shape transition. For example, another 33px outgoing message with a 3px same-side gap can move the earlier target upward by 36px.

After the shape settles, the fully formed copy may continue moving with compensation. A continuous stream can keep it alive longer, but cannot keep restarting its shape morph. Normal handoff waits for compensation and actual layout alignment.

The current compensation is vertical. It is not a general independent spring for every changing dimension. Stable IDs, correct [projection](./final-layout-projection.md), and [handoff conditions](./flight-handoff.md) are part of its contract.

## Evidence

- Implementation: [destinationOffset](../../chat-send-flight/chat-send-flight.ts).
- History: [8a1e0aa](https://github.com/lennondotw/interaction-lab/commit/8a1e0aa); later changes are reflected in the current implementation.
- Validation: [relevant checks](./verification.md#geometry-and-flight).

[Architecture index](../README.md)
