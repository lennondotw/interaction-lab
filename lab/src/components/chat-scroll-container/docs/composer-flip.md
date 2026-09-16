# Composer-to-bubble FLIP

Use measured geometry and a temporary visual copy to turn the composer box into the outgoing bubble. This is a manual FLIP-style transform, not Motion's declarative `layout` animation.

## Decision and why

Capture the composer's center, dimensions, and four corner radii before clearing it. Commit the real message, measure its natural body and text, and create a copy with the destination dimensions. Translation and scale invert that destination box back to the source geometry. Painting progress zero before the first animation tick prevents a destination-shaped flash.

A spring generator supplies horizontal progress and a delayed sample supplies vertical progress. Each axis interpolates position and dimensions; corner radii are divided by the corresponding scale to preserve the intended painted curvature. The tail follows committed grouping and becomes visible later in vertical progress.

The hidden original remains the layout anchor. Final-position prediction determines where the flight goes when scrolling is still catching up. The shape's clock remains independent of later destination displacement.

The reusable hook consumes a departure by message ID. Choosing `entrance: 'flight'` alone is not a complete integration: the host must connect the hook and capture the matching departure. Ordinary sends without that composition use the default fade entrance.

## Evidence

- Implementation: [flight capture and painting](../../chat-send-flight/chat-send-flight.ts).
- History: [072ee4d](https://github.com/lennondotw/interaction-lab/commit/072ee4d); later changes are reflected in the current implementation.
- Validation: [relevant checks](./verification.md#geometry-and-flight).

[Architecture index](../README.md)
