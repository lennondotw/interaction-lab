# Input intent and native inertia ownership

This topic defines the implemented contact and takeover policy, with the evidence below;
[bottom following](./bottom-following.md) defines the three public states and restoration rules.

## Why separate input from position

A `scroll` notification reports a position change, not which gesture owns it. It can arrive after an
explicit bottom command even though the movement happened before that command. Conversely, changing
controller ownership does not stop native inertia. Correct takeover requires both stopping old motion
and reconciling its notifications, while letting a new user interaction reclaim control.

Keep three concerns separate: public follow intent, input contact lifetime, and temporary native
handoff. Do not add a public state for every combination, infer device intent from scroll speed, or
extend a timeout whenever another notification arrives.

## Defined input policy

| Input in the message viewport              | `following`        | `animating`                                 | `detached`    |
| ------------------------------------------ | ------------------ | ------------------------------------------- | ------------- |
| Touch contact                              | Preserve following | Immediately detach and stop catch-up/flight | Stay detached |
| Mouse press, `interruptOnMouseDown: false` | Preserve following | Preserve catch-up                           | Stay detached |
| Mouse press, `interruptOnMouseDown: true`  | Detach             | Detach and stop catch-up/flight             | Stay detached |
| Pen contact                                | Preserve following | Preserve catch-up                           | Stay detached |

The mouse option defaults to `false` and replaces `interruptOnPointerDown`; it does not configure touch
or pen. Touch pointer-down and touchstart implement the same policy, including touch-only browsers.
They do not wait for movement to interrupt an active catch-up. Preserving a pen contact does not assume
that pens cannot scroll: subsequent unowned upward movement still detaches.

Upward non-zoom wheel and scrolling keys detach. Downward non-zoom wheel interrupts active catch-up,
then evaluates the normal restoration gate. Horizontal-only and zoom wheel do not interrupt. Input
handlers do not call `preventDefault()`.

Pointer and touch lifetimes are independent: `pointercancel` can occur when native scrolling takes
over while the finger remains down. It must not clear touch contacts. Following cannot be restored
while a tracked contact remains held; release alone is not downward intent. See
[the restoration rules](./bottom-following.md#decision-and-why).

## Defined programmatic takeover

Local sends requesting bottom scrolling and explicit bottom commands share this protocol. Layout
retargeting does not initiate it independently.

1. Touch movement marks that native scrolling may remain unsettled after release. A tap alone does
   not arm takeover. `scrollend` with no active contacts clears this eligibility; it never restores
   following. Without that event, a later command may conservatively perform the short takeover.
2. A command encountering released, unsettled touch movement stops the old spring and enters
   `animating`. It hides `overflow-y`, reads layout to apply the hidden state, and waits two rAFs.
   This is an internal pending phase of catch-up, not another public follow state.
3. Restore the previous inline overflow value and priority. Read the actual position into the shared
   observation cursor, then start toward the latest projected bottom. Synchronizing the cursor does
   not itself scroll the viewport or manufacture a DOM event.
4. Old native notifications continue updating position observations without canceling the acquired
   catch-up. A new pointer/touch contact or vertical non-zoom wheel clears this exemption; the input
   policy above decides whether contact interrupts immediately. Scrolling keys detach directly.
5. Following may finish before the last compositor delta arrives, especially with reduced motion.
   While the old-tail exemption remains, following pins the actual bottom. The exemption ends on new
   input, detach, or `scrollend` while following within the existing 1px boundary tolerance.

Two rAFs are a browser workaround, not a compositor acknowledgment. One rAF succeeded in the iOS
experiments but failed in the earlier Chromium stop probe. No universal minimum delay is claimed.
Reduced motion skips the spring, but still performs any required native handoff.

## Lifecycle invariants

- Pending takeover belongs to the controller, not a message, layout slot, or flight. Layout updates
  may refresh geometry during the wait but cannot start the spring early; restoration uses the latest
  target, including concurrently inserted items.
- A newer command replaces a pending one. New interrupting input or disposal invalidates the callback
  and immediately restores overflow. A canceled callback must never restart scrolling or restore an
  obsolete style over its replacement.
- The observation cursor is shared by layout callbacks, native notifications, and owned writes. A
  queued notification is not a second movement simply because it arrived through another callback.
- Ordinary commands with no unsettled touch movement do not acquire a two-frame delay. Active spring
  retargets retain their existing velocity policy. Desktop wheel interruption remains unchanged.
- The 2px zone controls eligibility to resume following; it is not a delay or inertia detector. The
  0.5px target tolerance and 1px browser-boundary tolerance serve separate geometry checks.

## Evidence and limits

[Touch takeover regressions](../../../../../scripts/test-chat-touch-takeover.mjs) cover contact policy,
queued updates, cancellation/style restoration, replacement commands, concurrent layout, reduced
motion, and real Chromium flings followed by a command or native button tap. They run in the local
full suite, not the CI subset. [Interaction contracts](../../../../../scripts/test-chat-contracts.mjs)
also cover contact lifetimes, mouse opt-in stories, restoration, and flight interruption.

The [iOS research record](./inertia-ios-experiments.md#production-integration-verification) includes
three successful production takeovers and two new-touch interruption trials. A tap during slow
catch-up produced zero later controller writes and zero sampled movement. These are simulator results,
not physical-iPhone or desktop-trackpad guarantees. Research measurements explain the workaround;
regressions define the behavior to preserve when the workaround changes.

## Defined behavior: a satisfied bottom command preserves native bounce

Before acquiring native inertia, compare the legal current position with the projected final bottom
using the existing 0.5px target tolerance. Clamp positive overscroll to the current bottom for this
comparison: bounce distance cannot satisfy a message's still-unexpanded height. The 2px restoration
zone is not an arrival test.

When that target is already satisfied, the command invalidates any old programmatic animation and
establishes following intent without writing scrollTop, hiding overflow, or starting a spring. A
preexisting pending takeover is still cleaned up. This applies both at rest and during bottom bounce,
and when an explicit command resumes a detached viewport already at its destination.

A decreasing raw scrollTop whose previous and current positions are both at or beyond their bottom
boundaries is a rebound, not upward movement into history. Update the observation cursor without
using that decrease to detach or overwrite contact direction. Genuine movement inside the legal
range, new wheel/key input, and touch interruption of active catch-up retain their existing policies.
Downward movement still supplies restoration intent through the normal contact gate.

No bounce state or timer is added: command eligibility and movement classification own these rules.
A changed final target still requires ordinary following/catch-up; this does not promise to preserve
bounce when a concurrent layout mutation requires repositioning. Deterministic controller tests cover
boundary classification and projected growth; the iOS research record captures the native RED/GREEN
bounce trajectory and confirms zero controller position writes for a satisfied command.

[Architecture index](../README.md)
