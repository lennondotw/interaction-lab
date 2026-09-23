# Bottom following as user intent

Following is explicit intent, not a boolean recalculated from proximity on every scroll event.

| State       | Meaning                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------- |
| `following` | Layout changes pin the current bottom; no scroll spring is active.                           |
| `animating` | Catch-up owns scrolling, including a short native-inertia takeover before its spring starts. |
| `detached`  | Native user scrolling owns the viewport.                                                     |

## Decision and why

The default bottom zone is 2px; stories expose 20px for debugging. A separate 0.5px geometry tolerance identifies a settled bottom and equivalent catch-up targets. Being inside it does not automatically reattach, and leaving it during a programmatic animation does not detach.

Upward wheel input detaches immediately, before native movement. Scroll keys also detach. Mouse pointer-down interrupts only when `interruptOnMouseDown` is `true` (default `false`); ordinary clicking otherwise preserves follow and flight. Actual upward movement still interrupts in either mode. The controller closes its write gate, invalidates old completion callbacks with a generation counter, and resets its MotionValue to the actual position. Input handlers never prevent native default actions. Explicit takeover of released touch scrolling briefly hides scrollable overflow, as defined in the [input and inertia topic](./input-and-inertia-ownership.md). The controller emits one shared interruption signal that also triggers the [intentional immediate flight handoff](./flight-handoff.md#user-interruption-is-an-intentional-immediate-handoff), so the user interacts with real message rows rather than a flight still targeting the bottom.

An unowned downward scroll can restore following upon entering the zone. A non-zoom downward wheel while already inside the zone also restores it, even when the native position cannot move. Both use the same detached-only restoration gate. During `animating`, a non-zoom downward wheel first cancels catch-up and flight, entering `detached`, then checks that gate. Outside the zone, native scrolling owns the position until a later downward return; inside it, following resumes without a position write. A downward wheel during `following` leaves that state intact. Pure horizontal wheel and zoom input do not interrupt. A held pointer must first release or cancel, with the last nonzero movement downward and the viewport still in the zone. A click release without downward movement does not restore following. Layout compensation and native boundary clamps never supply downward intent, and an earlier wheel outside the zone is not saved for a later layout change. Restoration enables future following without immediately snapping the remaining pixels. There is no reattachment timeout or reliance on `scrollend` or inferred trackpad contact.

Newly inserted outgoing messages request bottom catch-up by default; incoming messages do not. The optional `scrollToBottom` field overrides that request independently of message side and entrance style. History insertion sets it to `false`: detached readers keep their reading anchor, while an already following viewport continues to follow layout. A normal local send still requests bottom scrolling even when detached. Every catch-up remains interruptible. All layout changes in following track the current bottom directly; active catch-up retargets only when its projected destination changes beyond tolerance.

Pointer and touch lifetimes are tracked independently. Native touch scrolling can emit `pointercancel` while fingers remain on screen; that event ends only the pointer lifetime. Contacts that started in the viewport keep the restoration gate closed until all of them end or cancel, even if released outside the viewport. The last nonzero movement is shared across that interaction, so adding or lifting one finger does not erase its direction. Touch contact immediately detaches active catch-up (including its pending native takeover) and ends flight. While already following, a touch contact does not itself detach or restore; upward movement is still detected from scrolling, without a separate touch-direction threshold. Both touch pointer-down and touchstart support this policy, including touch-only browsers. Pen contact does not immediately interrupt; subsequent upward scrolling still does. The mouse opt-in does not change touch or pen behavior.

The **Detach Following State On Mouse Down** story opts into immediate mouse interruption; other demos use the non-blocking default. Both modes retain the pointer-and-touch restoration gate once detached.

## Event ordering and transitions

| Event / observation                         | Guard                                                     | Transition and effect                                             |
| ------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| Upward non-zoom wheel                       | Any mode                                                  | Detach and stop catch-up/flight before native movement.           |
| Downward non-zoom wheel                     | `animating`                                               | Detach and stop catch-up/flight first; then evaluate restoration. |
| Downward wheel or unowned downward movement | `detached`, within the bottom zone, no held pointer/touch | Restore `following` without writing position.                     |
| Local send                                  | `following`                                               | Follow the new layout directly; do not start a scroll spring.     |
| Local send / explicit bottom request        | Detached or catching up; explicit command in any mode     | Request catch-up, or finish immediately if already at its target. |
| Layout geometry changes                     | `following`                                               | Synchronize the current bottom and remain `following`.            |
| Layout geometry changes                     | `animating`                                               | Retarget the projected final bottom, retaining spring velocity.   |
| Current catch-up completes                  | Its generation still owns scrolling                       | Write the bottom and enter `following`.                           |
| Owned scroll notification / layout clamp    | Recognized by the position cursor and geometry            | No user-intent transition.                                        |

A wheel event can precede native movement. Check the current position at input time and observe the actual position again when it changes; do not assume the wheel has already moved it. The 2px zone is a geometric eligibility condition, not a scheduling delay. Owned writes record their actual result immediately, so delayed or coalesced scroll notifications cannot reclaim ownership for a cancelled animation. Independent layout slots continue after interruption; stopping flight does not remove their space. If restoration leaves a few threshold pixels untouched, the next layout change in `following` synchronizes directly to the current bottom instead of starting another catch-up spring. This includes natural rewrap, viewport resizing, asynchronous intrinsic size changes, and composer clearance; no resize-intent detection or source whitelist is needed. Reconcile native movement before applying this policy, so an upward user scroll closes the following write gate first. The bottom zone controls restoration eligibility, not whether existing follow intent survives a layout change.

## Explicit bottom command

The public `ChatScrollContainerHandle.scrollToBottom()` command requests animated catch-up to the projected final bottom using the same 15/1 spring as a local send. It preserves velocity when retargeting active catch-up and enters `following` on arrival. Native gestures can interrupt it under the same rules. With reduced motion, it skips the spring and reaches the current bottom after any required native takeover. The story's Scroll to bottom button invokes this command; bottom-zone controls default to 2px.

## Input and native inertia

[Input intent and native inertia ownership](./input-and-inertia-ownership.md) defines the contact
policy, delayed-notification ownership, and satisfied bottom commands that preserve native bounce without
writing position. [Programmatic takeover of native inertia](./native-inertia-takeover.md) describes the
overflow workaround, eligibility, and cleanup. Reduced motion skips the spring; if native takeover is
needed, it completes that handoff first.

## Evidence

- Implementation: [state transitions and input handlers](../../scroll-anchor/scroll-anchor-controller.ts).
- History: [cf8d1de](https://github.com/lennondotw/interaction-lab/commit/cf8d1de); later changes are reflected in the current implementation.
- Validation: [relevant checks](./verification.md#scrolling-and-composer).

[Architecture index](../README.md)
