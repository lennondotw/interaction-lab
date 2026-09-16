# Preserving the reading anchor

A detached reader should keep the visible conversation in place when space changes above it, without re-enabling bottom following.

## Decision and why

The insertion manager saves one visible reading anchor and its screen position. It binary-searches ordered, non-overlapping row boxes, skips newly entering rows, and anchors the existing body rather than its temporary slot. A scroll listener refreshes the snapshot; a later transaction accounts for scroll movement since it was saved.

For a supplied live anchor, detached layout compensation is:

```text
requestedScrollTop = currentScrollTop + currentAnchorTop - savedAnchorTop + roundingRemainder
```

The controller writes within the available range and carries a bounded fractional remainder to the next tick, avoiding accumulated rounding drift. An append below the anchor normally produces no displacement; insertion above it does. User input remains authoritative.

Lookup costs O(log n) plus any entering rows skipped. This relies on normal ordered row geometry and mounted DOM anchors. It does not solve virtualization, arbitrary transforms that reorder row boxes, or preserving a removed anchor. A future virtual-list adapter must supply stable identities, size information, and an anchor for its mounted range.

## Evidence

- Implementation: [captureAnchor, remember, and anchorFromSnapshot](../chat-insertions.ts).
- Related implementation: [scroll compensation and rounding remainder](../chat-scroll-controller.ts).
- History: [7539e98](https://github.com/lennondotw/interaction-lab/commit/7539e98); later changes are reflected in the current implementation.
- Validation: [relevant checks](./verification.md#layout-and-typing).

[Architecture index](../README.md)
