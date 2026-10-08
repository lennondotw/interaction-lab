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

Upward non-zoom wheel detaches. Downward wheel interrupts active animation, then evaluates the normal
restoration gate. Horizontal-only and zoom wheel do not interrupt. Wheel and pointer input remain
native; recognized keyboard scrolling commands prevent the native scroll default and own a spring.

### Keyboard scrolling

Focus the message viewport with Tab or a click. Keyboard commands drive the controller's existing
15/1 spring and MotionValue, including its playback speed and reduced-motion policy:

| Key                     | Spring target                                  |
| ----------------------- | ---------------------------------------------- |
| Arrow up / down         | Current keyboard target ±40px                  |
| Space / Shift+Space     | One viewport down / up, retaining 40px overlap |
| PageDown / PageUp       | One viewport down / up, retaining 40px overlap |
| Option+Arrow up / down  | The same page step                             |
| Home / End              | Top / projected final bottom                   |
| Command+Arrow up / down | Top / projected final bottom                   |

The 40px small increment matches the measured native arrow step. Page size comes from the current
viewport height. Consecutive keys accumulate against the pending keyboard destination, not the
partially animated scroll position. Retargeting preserves the spring's exact position and analytic
generator velocity, including same-frame repeats and direction reversal.

A reading destination enters `animating` and completes as `detached`. A command reaching the bottom
uses the ordinary projected-bottom path and completes as `following`. Downward commands already at
the bottom preserve following. Keyboard takeover of bottom catch-up ends the old message flight
without resetting the scroll spring's velocity. Receive/layout changes retain a reading destination;
reading-anchor compensation shifts both its current position and destination. Local send and explicit
bottom commands can replace it with bottom catch-up. Wheel or touch contact interrupts either spring.
The public state target reports the active animation destination. Its `following` flag distinguishes
bottom intent from a keyboard reading animation even while both use `animating`.

Only key events targeted at the viewport are handled. Descendant editors, buttons, and nested widgets
retain editing/activation. Consumed events, composition, Ctrl chords, and unrecognized combinations
are left alone. Recognized commands stop propagation, so Option+Arrow does not reach Storybook's
outer story-navigation handler. No global shortcuts or native smooth-scroll animation are involved.

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
policy above decides whether contact interrupts immediately. Keyboard commands acquire their own spring destination. Merely
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

[Keyboard contracts](../../../../../scripts/test-chat-keyboard.mjs) cover real keys, intermediate spring
progress, target accumulation, velocity continuity, direction reversal, receive/layout changes,
boundary following, wheel interruption, reduced motion, and descendant/consumed/composition isolation.

[Interaction contracts](../../../../../scripts/test-chat-contracts.mjs) cover contact lifetimes, mouse
opt-in stories, restoration, and flight interruption. [Touch takeover regressions](../../../../../scripts/test-chat-touch-takeover.mjs)
cover new-input interruption, delayed observations, satisfied commands, and handoff cleanup in the local
full suite. The [workaround evidence and limits](./native-inertia-takeover.md#evidence-and-limits) distinguish
these contracts from browser-specific measurements.

[Architecture index](../README.md)
