# Bottom following as user intent

Following is explicit intent, not a boolean recalculated from proximity on every scroll event.

| State       | Meaning                                                               |
| ----------- | --------------------------------------------------------------------- |
| `following` | New content may follow; no catch-up spring is active.                 |
| `animating` | A spring is catching up to the bottom; follow intent remains enabled. |
| `detached`  | Native user scrolling owns the viewport.                              |

## Decision and why

The default bottom zone is 2px; stories expose 20px for debugging. A separate 0.5px geometry tolerance identifies a settled bottom and equivalent catch-up targets. Being inside it does not automatically reattach, and leaving it during a programmatic animation does not detach.

Upward wheel input detaches immediately, before native movement. Pointer-down in the viewport and scroll keys also detach. The controller closes its write gate, invalidates old completion callbacks with a generation counter, and resets its MotionValue to the actual position. It never prevents native scrolling.

An unowned downward scroll can restore following upon entering the zone. A held pointer must first release or cancel, with the last nonzero movement downward and the viewport still in the zone. Restoration enables future following without immediately snapping the remaining pixels. There is no reattachment timeout or reliance on `scrollend` or inferred trackpad contact.

The current container treats newly inserted outgoing items as a local-send request, including outgoing history insertion. Such a request starts bottom scrolling even when detached; incoming insertion only follows existing intent. Every catch-up remains interruptible. Settled layout ticks track directly; active catch-up retargets only when its projected destination changes beyond tolerance.

## Evidence

- Implementation: [state transitions and input handlers](../chat-scroll-controller.ts).
- History: [cf8d1de](https://github.com/lennondotw/interaction-lab/commit/cf8d1de); later changes are reflected in the current implementation.
- Validation: [relevant checks](./verification.md#scrolling-and-composer).

[Architecture index](../README.md)
