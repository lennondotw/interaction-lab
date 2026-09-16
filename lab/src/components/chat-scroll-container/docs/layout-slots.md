# Animated layout slots

Animate the amount of space an item occupies independently of how its full-size body appears.

## Decision and why

Every new item, including the last item, receives a measured temporary slot. Its target is body height plus owned leading gap. Ordinary insertion starts at zero; a typing replacement starts at the transferred current footprint. Existing affected items start from their previous footprint or current animation value.

During animation the body remains full size and top-aligned after its leading space. Slot height does not bottom-align or scale it. Animated gap placement stays inside the slot without forcing a minimum height. Individual slots allow overflow; visual and scroll-extent clipping are handled by [separate layers](./visual-layers.md).

Each layout tick publishes remaining height and notifies the scroll controller. At a settled followed bottom, the controller tracks that height directly: the layout spring already supplies smooth motion. A historical catch-up retains its own scroll spring and projected target. Detached reading uses an anchor when supplied.

Completion removes temporary height, width, and gap overrides so normal flow owns the footprint again. Initial history skips insertion animation. Generic items do not have a general removal lifecycle; reversible collapse belongs to [typing presence](./typing-presence.md).

## Evidence

- Implementation: [slot measurement, painting, and restoration](../chat-insertions.ts).
- Related implementation: [slot styling](../chat-scroll-container.css) and [pending geometry](../chat-layout.ts).
- History: [8a1e0aa](https://github.com/lennondotw/interaction-lab/commit/8a1e0aa); later changes are reflected in the current implementation.
- Validation: [relevant checks](./verification.md#layout-and-typing).

[Architecture index](../README.md)
