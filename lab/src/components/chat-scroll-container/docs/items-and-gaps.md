# Timeline items and gap ownership

The list has zero gap. Every item owns the space before its body as part of its footprint, so spacing participates in the same layout animation as the item.

## Decision and why

`items` supports message, date, status, and custom content variants. IDs are stable and unique across all types. `messages` remains a message-only shorthand; `items` takes precedence. Default leading space is zero for the first item, 3px between same-side messages, 16px at a date boundary, and 8px otherwise. `gapBefore` overrides non-first boundaries.

Natural rows express the gap as padding. Animated slots temporarily express it inside the footprint without imposing a minimum slot height. Container padding and composer clearance remain outside the item contract.

Logical order and grouping update immediately. Tail visibility follows the next logical item or typing intent; it does not wait for a visual animation to finish. A tail is presentation, not the source of the spacing rule.

An insertion may change the next item's leading gap, so that neighbor can also need a layout transition. Dates and status labels share the same body measurement and default entrance as messages. Keep external spacing of custom content in `gapBefore`; the manager does not discover arbitrary CSS dependencies or provide general deletion animation.

## Evidence

- Implementation: [item model and gap rules](../chat-items.ts).
- Related implementation: [row rendering and grouping](../chat-scroll-container.tsx).
- History: [710db97](https://github.com/lennondotw/interaction-lab/commit/710db97); later changes are reflected in the current implementation.
- Validation: [relevant checks](./verification.md#layout-and-typing).

[Architecture index](../README.md)
