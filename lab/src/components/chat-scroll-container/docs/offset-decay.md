# Shared spring and offset decay

Text should depart near the composer's left inset, then settle cohesively within the bubble during arrival and overshoot. Derive its relative offset from the carrier's progress rather than starting an independent text spring.

## Decision and why

```text
q = clamp(horizontalSpringProgress, 0, 1)
weight = (1 - q) * (1 - q^4)
textOffset = targetOffset + (initialOffset - targetOffset) * weight
textCenterX = currentBubbleCenterX + textOffset
```

Offsets are measured from the bubble center in visual CSS pixels. The initial offset places the final-width text box at the normal bubble inset inside the captured composer. The target offset is measured from the real text layout; it need not be zero.

The linear factor keeps early placement close to a constant left inset. The fourth-power factor delays much of the adjustment. Weight and its first derivative reach zero at arrival, so the offset contributes no extra velocity there. During overshoot the text shares the body's motion. Only the offset progress is clamped; the body's spring can overshoot.

Painting converts this relative placement back into top-left CSS coordinates with inverse scale. “Center” is a useful coordinate reference, not an additional animated object. The exponent is a tuned choice, not a universal constant. Continuity of this decay does not make arbitrary external target changes continuous; those use [destination compensation](./destination-compensation.md).

## Evidence

- Implementation: [offsetDecay and text placement](../../chat-send-flight/chat-send-flight.ts).
- History: [14c2087](https://github.com/lennondotw/interaction-lab/commit/14c2087); later changes are reflected in the current implementation.
- Validation: [relevant checks](./verification.md#geometry-and-flight).

[Architecture index](../README.md)
