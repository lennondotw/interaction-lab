# Inverse scale compensation

Scale the bubble body without scaling its text. Compensation is a coordinate conversion, not a second animation.

## Decision and why

The carrier scales around its center. Text uses a top-left transform origin and inverse scale:

```text
textScaleX = 1 / carrierScaleX
textScaleY = 1 / carrierScaleY
```

The text retains the real bubble's wrapping width and natural dimensions. Its desired visual position is converted into carrier-local coordinates; visual inset values must also account for the carrier's scale. Inverse scaling glyphs alone would not preserve those insets.

Vertical placement preserves the first line's visual top inset. Additional final-width lines are revealed through the body clip as height grows. Horizontal placement comes from [shared spring and offset decay](./offset-decay.md).

This preserves text dimensions, not the exact composer line breaks: a wider composer and narrower destination can wrap differently. Source and destination geometry are measured separately. Counter-scaling applies to this transient text representation and is not a general solution for arbitrary nested content.

## Evidence

- Implementation: [content transform and coordinate conversion](../../chat-send-flight/chat-send-flight.ts).
- Related implementation: [text transform origin and clip](../../chat-send-flight/chat-send-flight.module.css).
- History: [072ee4d](https://github.com/lennondotw/interaction-lab/commit/072ee4d); later changes are reflected in the current implementation.
- Validation: [relevant checks](./verification.md#geometry-and-flight).

[Architecture index](../README.md)
