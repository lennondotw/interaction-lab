# iOS simulator: inertia takeover experiments

2026-09-21. Research only; no production controller changes. Continuation of
[native inertia research](./inertia-research.md).

## Environment and method

- Booted iPhone 17 Pro simulator, iOS 27.0, Safari 27.0. This is iOS WebKit, not Chromium touch emulation,
  but it is still a simulator, not physical-device validation. Safari's compatibility UA reports iPhone
  OS 18_7; the runtime version came from simctl, not that UA token.
- With Message Input, loaded in a same-origin iframe inside a research harness. Inner viewport
  402 × 714 CSS pixels, DPR 3; chat viewport 368 × 250 CSS pixels. Bottom zone 2px, default 1× animation.
- Native simulator touch: finger moves from (180, 135) to (180, 305) in screen points. The browser
  supplies the post-release inertia. Native button taps use (201, 376), verified from the visible UI.
- Most interventions run 80ms after touchend. Additional trials use 0, 250, 1000, or 3000ms, or a native
  tap. Each trial captures 4.5 seconds from its first touchstart, including rAF positions, DOM events,
  controller scrollTop writes, and the displayed state. React's displayed state can lag a transition.
- No wheel events or post-release touchmove events occurred during uninterrupted inertia. This Safari
  exposes scrollend but not WheelEvent.momentum.

## Results

The initial 35 trials included repetitions, diagnostic controls, and a rerun of the saved harness. Exact per-trial
numbers are in [the CSV](../../../../../scripts/research/ios-inertia-observations.csv).

| Experiment                                                                                        | Observation                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unmodified bottom command at 80ms; native fling then button tap                                   | Catch-up canceled before its first position write; final mode detached, roughly 475–484px from bottom                                                               |
| Bottom command at 1000ms                                                                          | Still failed: this fling was still decelerating                                                                                                                     |
| Bottom command at 3000ms                                                                          | Reached bottom and following after inertia had settled                                                                                                              |
| Write the current scroll position; attach non-passive cancellation listeners; change touch-action | None stopped the inertia; roughly 289–292px additional movement after intervention                                                                                  |
| Hide overflow and restore synchronously, with no layout read between                              | Did not stop inertia                                                                                                                                                |
| Hide overflow, force layout, restore synchronously                                                | Stopped motion in this simulator                                                                                                                                    |
| Hide overflow and restore with timer, one rAF, or two rAFs, with layout reads                     | Stopped motion; some trials had 9–10px residual movement before settling                                                                                            |
| Hide overflow and immediately start catch-up, including starting before the two-rAF restoration   | Motion stopped, but a queued old scroll still canceled the new command                                                                                              |
| Restore after two rAFs, then start catch-up                                                       | All 10 uninterrupted command trials reached following at exactly 0px distance; includes native taps, different delays, and no synchronous hidden-state layout flush |
| Restore after 100ms, then start catch-up                                                          | Reached bottom; does not establish 100ms as a required duration                                                                                                     |
| Synchronous hide/flush/restore, consume current position, then command                            | Both diagnostic trials reached bottom                                                                                                                               |
| Suppress scroll delivery without stopping native inertia                                          | Both trials ended in following **70–71px away from bottom**; frame samples also showed competing forward/backward movement                                          |
| New upward scroll during 0.25× catch-up after restoration                                         | Both trials returned to detached and continued browsing history; second touches arrived while animating, about 367–385ms after the command                          |

In the successful uninterrupted two-rAF command trials, sampled scrollTop never decreased after the
command. This does not promise zero movement during the brief takeover itself, strict velocity
continuity, or identical behavior under every device/rendering load.

## Follow-up: complete zero-, one-, and two-rAF comparison

A further **48 native-fling trials** on the same simulator completed the missing one-rAF command path.
Each trial starts with a fresh story. Success requires both `following` and exactly 0px bottom distance
at the end of the 4.5-second capture, not just a successful state transition. See the
[complete matrix](../../../../../scripts/research/ios-inertia-frame-matrix.csv).

| Hidden interval | Explicit hidden-state layout flush | Reconcile position before command | Successful full catch-up |
| --------------- | ---------------------------------- | --------------------------------- | ------------------------ |
| 0 rAF           | Yes                                | No                                | 0 / 5                    |
| 0 rAF           | Yes                                | Yes                               | 5 / 5                    |
| 0 rAF           | No                                 | No                                | 0 / 4                    |
| 0 rAF           | No                                 | Yes                               | 0 / 2                    |
| 1 rAF           | Yes                                | No                                | 5 / 5                    |
| 1 rAF           | Yes                                | Yes                               | 5 / 5                    |
| 1 rAF           | No                                 | No                                | 4 / 4                    |
| 1 rAF           | No                                 | Yes                               | 2 / 2                    |
| 2 rAFs          | Yes                                | No                                | 5 / 5                    |
| 2 rAFs          | Yes                                | Yes                               | 5 / 5                    |
| 2 rAFs          | No                                 | No                                | 4 / 4                    |
| 2 rAFs          | No                                 | Yes                               | 2 / 2                    |

Each five-trial flushed group contains two 80ms interventions, one immediately after touchend, one at
250ms, and one native fling followed by a native button tap. The no-flush groups include a normal
sampling trial and a sparse trial at 80ms; the unreconciled groups also include sparse trials at 0ms
and 250ms. Sparse probes skip frame/event geometry reads while overflow is hidden. The production
controller still handles native events normally; this is not a measurement-free browser.

**One rAF also worked: 16 / 16**, including the complete command path, a native button tap, and sparse
sampling. Two rAFs also passed 16 / 16. Every successful trial had zero sampled backward travel after
the command. This corrects the earlier coverage gap: there is no evidence here that two rAFs are a
minimum requirement on this iOS simulator.

The event traces distinguish scheduling order from duration:

- In `matrix-sync-plain-1`, the last observed position was 5948px. The command started at 5939px;
  a queued native scroll arrived 2ms later and canceled catch-up before any spring write.
- In `matrix-one-frame-plain-1`, that native scroll was delivered 1ms **before** the command, updating
  the observation cursor to 5938px. The first spring write followed 17ms after the command and catch-up
  reached bottom. The sparse one-rAF trace has the same ordering.
- In `matrix-sync-reconcile-1`, a diagnostic notification consumed the current position before the
  command. The subsequent native notification no longer represented an upward delta.
- Without a hidden-state flush, zero-rAF hide/restore did not stop inertia; reconciliation alone did
  not rescue it. That separates motion cancellation from stale-position reconciliation.

Observed hide-to-restore durations were 0–1ms for synchronous restoration, 1–14ms for one rAF, and
15–86ms for two rAFs. These durations include instrumentation and scheduling; a rAF count is not a
fixed millisecond delay or a compositor acknowledgment. The unchanged earlier Chromium failures still
prevent treating this iOS result as a portable cancellation contract.

The added method suffixes are composable: `-reconcile` consumes the observation cursor using the
existing diagnostic synthetic notification; `-no-flush` omits explicit hidden-state layout reads;
`-sparse` also skips frame/event geometry reads while hidden. For example:

```sh
node scripts/research/ios-inertia-collector.mjs start one-frame-full command-after-hidden-one-frame 80
# Native fling, then wait for the result as above.
node scripts/research/ios-inertia-collector.mjs start one-frame-sparse command-after-hidden-one-frame-no-flush-sparse 80
```

`native-hidden-sync`, `native-hidden-one-frame`, and `native-hidden-two-frames` intercept a real button
click and restore overflow before invoking the unchanged command. They also accept `-reconcile`.
No production behavior was changed by this matrix.

## Two distinct boundaries

**Stopping movement does not consume a queued position notification.** In the synchronous stop trial,
scrollTop had already stopped at 5938px. The button requested catch-up, then an old native scroll event
arrived about 1ms later. The controller compared the current position with its older observation cursor,
classified the delta as upward user movement, and canceled before the first spring write.

The diagnostic `sync-reconcile` variant dispatches a synthetic scroll notification before the command
to make the existing controller consume the current position. It does not synthesize the fling or move
the viewport. Its two successful trials support the stale-observation explanation; dispatching fake DOM
events is not the proposed production implementation.

**Keeping animation ownership does not stop the browser.** The `command-ignore-scroll` negative control
blocks delivery of scroll events to the controller, while still recording actual positions and writes.
It removes that block on a new touch or after four seconds. The browser still moved the viewport after
the spring reached bottom, leaving following intent inconsistent with geometry. This deliberately crude
probe is not equivalent to a finished ownership policy; it demonstrates why actual movement must be
validated separately from state transitions.

## Reproduce

The collector and HTML harness are local research tools, excluded from the regression/CI runner.
Storybook must already be running. Start the collector in the repository root:

```sh
node scripts/research/ios-inertia-collector.mjs
# Open the same-origin harness in the booted simulator's Safari.
xcrun simctl openurl booted \
  "http://localhost:6009/@fs${PWD}/scripts/research/ios-inertia-harness.html"

# Use a fresh ID for each trial; waits until the story is ready for the native gesture.
node scripts/research/ios-inertia-collector.mjs start ios-trial-1 command 80
# Now fling toward history in the chat viewport.
node scripts/research/ios-inertia-collector.mjs wait ios-trial-1

node scripts/research/ios-inertia-collector.mjs start ios-trial-2 command-after-hidden-two-frames 80
# Repeat the same native gesture, then wait for the new trial.
node scripts/research/ios-inertia-collector.mjs wait ios-trial-2
```

`manual-command` captures an unmodified native button tap after the fling. `native-hidden-two-frames`
intercepts that trusted click in the harness, briefly hides overflow, restores it after two rAFs, then
calls the original button handler. For the interruption scenario, select 0.25× before the fling and
perform another upward scroll immediately after pressing the button.

The exact intervention branches are in the HTML. Layout reads are part of the experiment and can affect
results: `hidden-sync-no-flush` deliberately avoids a read while hidden, while two-rAF experiments still
have normal frame sampling. A timer or two rAFs is not proof of compositor acknowledgment.

`PORT` and `OUTPUT_DIR` configure the collector. A `collector` query parameter changes the harness's
collector URL. Raw evidence and the comparison recording are under ignored `artifacts/research/ios-inertia/`.
The recorded native-tap comparison shows the unmodified failure first and the temporary takeover second.

## Remaining limits

The candidate order is: stop old native motion, reconcile the observed position, establish the new
scroll owner, then animate. Any deferred start must be invalidated by a newer user gesture or command.
The two-rAF probe demonstrates that ordering can work; it is not a production protocol by itself.

Still unverified: physical iPhones, older iOS releases, desktop trackpad inertia, a touch arriving inside
the brief hidden interval, nested scroll chaining, background-tab scheduling, and simultaneous layout
mutations. Keep the earlier Chromium result: synchronous hide/flush/restore failed there even though it
stopped motion in this iOS simulator. Do not assume the iOS shortcut generalizes.

[Architecture index](../README.md)

## Production integration verification

The controller now applies the two-rAF overflow takeover itself, synchronizes the observation cursor,
and retains ownership of delayed native notifications until new input or settled following. The
research harness's `command` and `manual-command` modes do not add an overflow intervention.

On the same iOS simulator, `production-command-80`, `production-native-1`, and `production-native-2`
all reached `following` at exactly 0px distance. At 0.25×, `production-interrupt-tap` captured a new
native touch while animating at scrollTop 5919px: zero subsequent controller writes and zero sampled
position change, ending detached. `production-interrupt-swipe` likewise produced zero later controller
writes; native scrolling continued 484px toward history while detached. Raw captures remain in the
ignored research artifact directory.

The local regression script `test-chat-touch-takeover.mjs` additionally covers Chromium native flings,
real button taps, reduced motion, queued position updates, contact policies, replacement commands,
and immediate overflow cleanup on interruption/disposal. In Chromium, a final compositor delta can
arrive after restoration; reduced motion exposed a 13px displacement after the instant bottom write.
Keeping explicit ownership through that tail and pinning following geometry addresses it without
preventing new input. This is why the implementation needs both motion cancellation and ownership,
rather than treating two rAFs as proof that every native notification has drained.

## Bottom bounce: native reproduction and verification

Nine further trials used the same iOS simulator and story, starting at bottom. Swipe the finger upward
from native point (180, 300) by 170px to overscroll beyond the bottom. The harness additionally records
inline overflow and the content's visual bottom. [Per-trial results](../../../../../scripts/research/ios-bounce-observations.csv)
separate automated commands during bounce from slower native button taps.

Before the change, `bounce-red-command` requested bottom 80ms after release with 47px overscroll.
Overflow became hidden, a controller write set scrollTop to 6133px, and the first zero-overscroll frame
was 35ms after the command. The no-command control returned smoothly but incorrectly became detached
as raw scrollTop decreased. A native button tap also toggled overflow and wrote position, although only
1px of bounce remained by that later click.

After the change, commands at 0, 80, and 250ms observed 63, 54, and 16px overscroll respectively. All
three produced **zero controller writes and zero hidden frames**, returned naturally to bottom, and
remained following. The 80ms capture continued through 50, 46, 41, 37, 34, 30px and onward instead of
snapping to zero. The no-command control also remained following. The native button tap in this run
arrived after bounce had settled; it verifies an at-rest no-op, not a mid-bounce native tap.

`bounce-green-user-escape` issued a command at 63px overscroll and then performed a second native swipe
toward history. It ended detached, 478px above bottom, with zero controller writes. Users can still
leave following after the no-op command; the rebound exemption only covers movement outside the bottom
boundary. Controller fixtures separately cover detached-at-bottom commands, the 0.5px arrival tolerance,
the distinct 2px restoration zone, and projected insertion height that overscroll must not satisfy.

The fix adds no bounce state or timer. It changes command eligibility and classifies bottom rebound;
see [the defined contract](./input-and-inertia-ownership.md#defined-behavior-a-satisfied-bottom-command-preserves-native-bounce).
These are simulator observations, not physical-device verification.
