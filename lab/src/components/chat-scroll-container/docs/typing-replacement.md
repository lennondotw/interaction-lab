# Typing-to-message replacement

Receiving a reply and turning typing off in the same update transfers space to the message; it does not schedule a complete typing exit followed by a new entrance.

## Decision and why

When typing is still mounted and an incoming item arrives with typing off, the container selects a replacement. Before inserting its slot, the typing hook stops its old height animation, releases its projected-height registration, and returns current height velocity. The insertion manager starts from the cached actual typing row height, including its current gap, rather than the fully expanded intrinsic body height.

The new slot continues toward the message's measured footprint with that velocity. Typing becomes a zero-height overlay following the replacement body. Both visuals crossfade without new entrance/exit translation. If typing was still entering, its residual visual offset is frozen during fade rather than snapped to zero. The message itself uses zero entrance offset.

Only one owner contributes the transferred footprint. This avoids both a temporary collapse and double-counted height. Reopening typing during replacement starts a fresh measured entry and releases the old replacement positioning lifecycle.

`Receive a message` preserves typing and uses ordinary insertion. `Receive a message and turn typing off` supplies the replacement update. The component responds to supplied state; it does not automatically clear typing for every received message or match arbitrary remote messages to a typing identity.

## Evidence

- Implementation: [replaceWith and replacement lifecycle](../use-typing-exit.ts).
- Related implementation: [replacement selection](../chat-scroll-container.tsx) and [footprint transfer](../chat-insertions.ts).
- History: [7539e98](https://github.com/lennondotw/interaction-lab/commit/7539e98); later changes are reflected in the current implementation.
- Validation: [relevant checks](./verification.md#layout-and-typing).

[Architecture index](../README.md)
