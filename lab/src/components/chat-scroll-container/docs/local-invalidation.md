# Layout dependencies and local invalidation

Let the list model declare which rows need new geometry. Do not measure the entire history on every animation tick or attempt to discover a general CSS dependency graph.

## Decision and why

On an immutable items-array update, compare IDs, content inputs, and each item's computed leading gap. New items and changed rows enter an affected set. A normal insertion affects the new row and may affect its next neighbor. Presentation-only tail changes do not change body height. Later rows move through normal document flow without individual animation entries.

A shared ResizeObserver watches intrinsic bodies, not animated slots. First delivery establishes the height cache; later changes, such as loaded content, enter the same transaction. A viewport width change invalidates all mounted targets because wrapping is a global dependency. Active rows release temporary width for measurement but retain their current height.

Model comparison remains O(n) per changed array. Target measurement is O(k) for k affected rows; initial observation and width invalidation can touch all rows. Binary reading-anchor lookup avoids a full body scan, but rendering, browser layout, active visual copies, and other consumers still cost work. The 10,000-row regression measures the production layout manager, not constant-time whole-app performance. Virtualization is not implemented.

## Evidence

- Implementation: [affected-row comparison and registration](../chat-scroll-container.tsx).
- Related implementation: [intrinsic observer and measurement cache](../chat-insertions.ts).
- History: [7539e98](https://github.com/lennondotw/interaction-lab/commit/7539e98); later changes are reflected in the current implementation.
- Validation: [relevant checks](./verification.md#layout-and-typing).

[Architecture index](../README.md)
