# Input intent and native inertia ownership

This topic defines who may control scrolling and interrupt catch-up. [Bottom following](./bottom-following.md)
defines the three public states and restoration rules; [native inertia takeover](./native-inertia-takeover.md)
documents the browser workaround that implements the handoff.

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

## Programmatic ownership

Local sends requesting bottom scrolling and explicit bottom commands establish new programmatic intent.
Layout retargeting does not independently acquire native scrolling. A pending handoff belongs to the
controller, not a message, slot, or flight; it remains interruptible and uses the latest target when ready.

After native takeover, old position notifications continue updating the shared observation cursor without
canceling catch-up. A new pointer/touch contact or vertical non-zoom wheel clears that exemption; the input
policy above decides whether contact interrupts immediately. Scrolling keys detach directly. Merely
receiving a delayed notification does not make it a new gesture.

Following may finish before the last native delta arrives, especially with reduced motion. During this
old-tail exemption, following pins the actual bottom. The exemption ends on new input, detachment, or
`scrollend` while following within the existing 1px boundary tolerance. `scrollend` never grants follow
intent by itself. Reduced motion skips the spring, not a required native handoff.

Ordinary active-spring retargets retain their velocity policy. The 2px zone controls eligibility to resume
following; it is not an inertia detector or an arrival test. See the [workaround](./native-inertia-takeover.md)
for eligibility, geometry tolerances, scheduling, and cleanup.

## Defined behavior: a satisfied bottom command preserves native bounce

When the projected final target is already satisfied, the command invalidates any old programmatic animation and
establishes following intent without writing scrollTop, hiding overflow, or starting a spring. A
preexisting pending takeover is still cleaned up. This applies both at rest and during bottom bounce,
and when an explicit command resumes a detached viewport already at its destination.

A decreasing raw scrollTop whose previous and current positions are both at or beyond their bottom
boundaries is a rebound, not upward movement into history. Update the observation cursor without
using that decrease to detach or overwrite contact direction. Genuine movement inside the legal
range, new wheel/key input, and touch interruption of active catch-up retain their existing policies.
Downward movement still supplies restoration intent through the normal contact gate.

A changed final target still requires ordinary following/catch-up; this does not promise to preserve
bounce when a concurrent layout mutation requires repositioning. No bounce state or timer is added.

## Verification

[Interaction contracts](../../../../../scripts/test-chat-contracts.mjs) cover contact lifetimes, mouse
opt-in stories, restoration, and flight interruption. [Touch takeover regressions](../../../../../scripts/test-chat-touch-takeover.mjs)
cover new-input interruption, delayed observations, satisfied commands, and handoff cleanup in the local
full suite. The [workaround evidence and limits](./native-inertia-takeover.md#evidence-and-limits) distinguish
these contracts from browser-specific measurements.

[Architecture index](../README.md)
