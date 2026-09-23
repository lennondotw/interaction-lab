# Visual layers and clipping boundaries

Keep layout measurement and visible motion in separate layers, with explicit clipping boundaries.

## Decision and why

The scroll viewport contains the real list. During ordinary entrance or flight, the original body stays in layout but is hidden, and a non-interactive, accessibility-hidden copy supplies the visual. Ordinary entrance layers are children of the container; flight layers are attached to the composition host outside the scroller. The floating composer is above the flight, so glass can cover a departing bubble.

Individual slots allow overflow and never squash or clip their bodies. The list surface clips overflow to prevent a full-size hidden body in a small slot from enlarging the native scroll range. External entrance layers let the visible copy remain complete despite that constraint. The outer rounded container and visual layers still clip at their own bounds; “slots never clip” does not mean the whole UI is unclipped.

Flight text has an additional body-shaped clip: final-width wrapping can produce more lines than fit in the departure box. That clip reveals lines as the body grows while leaving the separate tail intact. Typing uses its own in-row visual lifecycle rather than the ordinary entrance-copy helper.

## Evidence

- Implementation: [slot and entrance-layer styles](../chat-scroll-container.module.css).
- Related implementation: [flight-layer styles](../../chat-send-flight/chat-send-flight.css) and [entrance-copy lifecycle](../chat-presence.ts).
- History: [8a1e0aa](https://github.com/lennondotw/interaction-lab/commit/8a1e0aa); later changes are reflected in the current implementation.
- Validation: [relevant checks](./verification.md#geometry-and-flight).

[Architecture index](../README.md)
