# Preserving the reading anchor

A detached reader should keep the visible conversation in place when space changes above it, without re-enabling bottom following.

## Decision and why

Binary search selects the first existing layout row whose bottom crosses the viewport top, skipping newly entering rows. Compensation preserves that body's **bottom relative to the viewport**, not its screen position. A partially visible message can therefore shorten during rewrap without disappearing above the viewport and forcing a new anchor. Moving the container itself does not produce a reading correction.

Selection uses direct list rows, then their item body; it does not search text nodes or arbitrary descendants. The body is the anchor, while the temporary slot owns animated layout space. Preserving the visible body's lower edge makes a narrow → wide → narrow resize reversible when the anchor survives and scrolling is not clamped.

Snapshots also record `scrollTop`, so actual scrolling since capture adjusts the expected offset. Layout changes compensate first, then refresh the selection. A queued scroll event with no movement since that snapshot cannot reselect against newer, uncompensated geometry. During a pending width change, selection waits for the resize callback; intervening scrolling is still included in the offset calculation. Genuine scrolling after layout selects the new topmost reading row normally.

This policy applies while detached. Following and catch-up retain their separate bottom policies. Removed anchors fall back to a new selection, and browser scroll boundaries can limit compensation; anchoring a message edge does not preserve a particular word within reflowing text.

For a supplied live anchor, detached layout compensation is:

```text
requestedScrollTop = currentScrollTop + currentBottomOffset - savedBottomOffset + roundingRemainder
```

Both offsets are relative to the viewport top. The saved offset accounts for scroll movement since capture.

The controller writes within the available range and carries a bounded fractional remainder to the next tick, avoiding accumulated rounding drift. An append below the anchor normally produces no displacement; insertion above it does. User input remains authoritative.

Lookup costs O(log n) plus any entering rows skipped. This relies on normal ordered row geometry and mounted DOM anchors. It does not solve virtualization, arbitrary transforms that reorder row boxes, or preserving a removed anchor. A future virtual-list adapter must supply stable identities, size information, and an anchor for its mounted range.

## Debugging and regression contract

**Resizable Message Input** exposes **Show anchor element** and insertion buttons before/after the
first visible message. The purple overlay uses the manager's saved selection, covers the body without
occupying layout space, and has `pointer-events: none`. It can display the candidate in any scroll
state; only detached mode uses it for reading compensation.

The [resizable-window regression](../../../../../scripts/test-chat-resize-window.mjs) places a message
almost above the viewport, then resizes in single steps and continuous drags, including a translated
container. Both anchor identity and its bottom offset must survive the round trip. At 0.1×, frame
samples cover insertion before and after that message through final layout handoff: detached intent
and the anchor stay stable within 1px rounding tolerance. Insertion above compensates `scrollTop`;
insertion below leaves it unchanged. A real wheel scroll must still select a new reading anchor.

## Evidence

- Implementation: [captureAnchor, remember, and anchorFromSnapshot](../chat-insertions.ts).
- Related implementation: [scroll compensation and rounding remainder](../chat-scroll-controller.ts).
- History: [7539e98](https://github.com/lennondotw/interaction-lab/commit/7539e98); later changes are reflected in the current implementation.
- Validation: [relevant checks](./verification.md#layout-and-typing).

[Architecture index](../README.md)
