# Bottom following as user intent

Following is explicit intent, not a boolean recalculated from proximity on every scroll event.

| State       | Meaning                                                               |
| ----------- | --------------------------------------------------------------------- |
| `following` | New content may follow; no catch-up spring is active.                 |
| `animating` | A spring is catching up to the bottom; follow intent remains enabled. |
| `detached`  | Native user scrolling owns the viewport.                              |

## Decision and why

The default bottom zone is 2px; stories expose 20px for debugging. A separate 0.5px geometry tolerance identifies a settled bottom and equivalent catch-up targets. Being inside it does not automatically reattach, and leaving it during a programmatic animation does not detach.

Upward wheel input detaches immediately, before native movement. Pointer-down in the viewport and scroll keys also detach. The controller closes its write gate, invalidates old completion callbacks with a generation counter, and resets its MotionValue to the actual position. It never prevents native scrolling. The same explicit viewport input also triggers the [intentional immediate flight handoff](./flight-handoff.md#user-interruption-is-an-intentional-immediate-handoff), so the user interacts with real message rows rather than a flight still targeting the bottom.

An unowned downward scroll can restore following upon entering the zone. A held pointer must first release or cancel, with the last nonzero movement downward and the viewport still in the zone. Restoration enables future following without immediately snapping the remaining pixels. There is no reattachment timeout or reliance on `scrollend` or inferred trackpad contact.

Newly inserted outgoing messages request bottom catch-up by default; incoming messages do not. The optional `scrollToBottom` field overrides that request independently of message side and entrance style. History insertion sets it to `false`: detached readers keep their reading anchor, while an already following viewport continues to follow layout. A normal local send still requests bottom scrolling even when detached. Every catch-up remains interruptible. Settled layout ticks track directly; active catch-up retargets only when its projected destination changes beyond tolerance.

## Evidence

- Implementation: [state transitions and input handlers](../chat-scroll-controller.ts).
- History: [cf8d1de](https://github.com/lennondotw/interaction-lab/commit/cf8d1de); later changes are reflected in the current implementation.
- Validation: [relevant checks](./verification.md#scrolling-and-composer).

[Architecture index](../README.md)
