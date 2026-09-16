# Atomic layout transactions

All affected rows must regain their intended starting footprints before a geometry read can expose a shortened intermediate list to the browser.

## Decision and why

The insertion manager performs three phases before notifying scrolling or starting springs:

1. Read affected bodies' intrinsic targets and logical gaps in a batch.
2. Write all initial animated footprints in a batch, including existing neighbors.
3. Read remaining heights, publish the complete projected target, and start or retarget affected animations.

Suppose a new outgoing row is inserted before another outgoing row whose gap changes from 8px to 3px. If the new slot is written at zero height and geometry is read before the neighbor restores its old gap, the browser sees a temporary 5px shrink. It can clamp `scrollTop` immediately. Restoring the gap later in the same effect does not undo that scroll movement.

The starting write loop therefore contains no geometry reads. Existing active heights stay in place during target measurement, unaffected animations continue, and changed targets resume from current size and velocity. Typing replacement transfers its footprint within this transaction rather than first collapsing it.

“Atomic” describes this layout initialization ordering, not a database transaction or a guarantee that arbitrary DOM mutations elsewhere are batched. Browser clamps from real shrinking ranges still require [scroll ownership](./scroll-ownership.md).

## Evidence

- Implementation: [insert, apply, and measureRemaining](../chat-insertions.ts).
- History: [7539e98](https://github.com/lennondotw/interaction-lab/commit/7539e98); later changes are reflected in the current implementation.
- Validation: [relevant checks](./verification.md#layout-and-typing).

[Architecture index](../README.md)
