# Programmatic takeover of native inertia

This is the browser workaround used by explicit bottom commands in
[the scroll controller](../../scroll-anchor/scroll-anchor-controller.ts). [Input ownership](./input-and-inertia-ownership.md)
defines the behavior it must preserve. Research records contain the underlying measurements, not an
additional runtime protocol.

## Why this workaround exists

Writing `scrollTop` does not reliably stop released touch inertia. Ignoring its `scroll` notifications
only changes controller decisions; the browser can still move the viewport. Conversely, stopping motion
does not consume a queued notification: an outdated observation cursor can misclassify its position delta
as a new upward gesture and cancel the new spring.

The handoff therefore has three responsibilities: stop native motion, reconcile the actual position,
and establish ownership that new input can interrupt. None substitutes for the other two.

## When to skip it

`requestBottom` first cleans up any prior pending takeover and checks whether the projected final target
is already satisfied:

```text
abs(finalBottom - min(scrollTop, currentBottom)) <= 0.5px
```

Clamping positive overscroll prevents bounce distance from satisfying a still-unexpanded message height.
This uses the existing target tolerance, not the 2px following-restoration zone.

If satisfied, invalidate the old animation and restore following intent without writing position,
changing overflow, or starting a spring. This preserves native bottom bounce. Rebound entirely at or
beyond the bottom is classified separately from upward movement into history; see the
[bounce contract](./input-and-inertia-ownership.md#defined-behavior-a-satisfied-bottom-command-preserves-native-bounce).

Otherwise, only released, potentially unsettled touch scrolling uses the workaround. `touchmove` with
tracked contacts arms `nativeTouchScroll`; `scrollend` without contacts clears it. A tap alone does not
arm it. Commands with active touches or no unsettled touch flag use the ordinary scrolling path.
Without `scrollend`, eligibility can remain conservative; a sampled zero velocity is not proof that
the native scroll has finished. Layout retargets never initiate this handoff independently.

## Handoff sequence and why

1. Invalidate the old spring with its write gate closed. Enter `animating`, retaining a cancelable
   pending operation inside that state rather than adding another public scroll state.
2. Save the inline `overflow-y` value and priority, set it to `hidden !important`, and read geometry.
   The read applies the hidden state so hide/restore is not simply coalesced.
3. Wait two nested `requestAnimationFrame` callbacks. Layout updates can refresh geometry during this
   interval but cannot start a competing spring.
4. Restore the original inline overflow exactly, including priority or absence. Read the actual
   position into the shared observation cursor before establishing the new animation. This read
   neither scrolls the viewport nor dispatches a synthetic event.
5. Start toward the latest target under the existing scrolling policy. A new native handoff starts
   from rest; ordinary retargeting of an active catch-up retains velocity. Reduced motion and instant
   following skip the spring but still wait for a required handoff.

Two rAFs are a compatibility choice, not a fixed duration or compositor acknowledgment. The iOS
experiments also succeeded with one rAF, while the earlier Chromium stop probe did not. A final native
delta can still arrive after restoration; the controller's [old-tail ownership rule](./input-and-inertia-ownership.md#programmatic-ownership)
keeps it from canceling catch-up and pins following until that exemption ends. Do not treat restoration
as proof that all native notifications have drained.

## Cancellation and cleanup

The pending operation owns its scheduled callback and overflow restoration. A newer command cleans up
and replaces it. Interrupting input or disposal immediately restores overflow and invalidates future
callbacks; an obsolete callback must not restart scrolling or overwrite a replacement's styles.

Pending takeover is independent of any message or flight. Concurrent insertion changes the target read
after restoration, without acquiring a separate handoff. Input handlers never call `preventDefault()`.
No bounce timer or velocity-based inertia detector is needed.

## Evidence and limits

- [Chromium research](./inertia-research.md#measured-stop-experiments): two-rAF restoration stopped the
  tested fling; synchronous and one-rAF variants did not. Residual travel means this is not an atomic freeze.
- [iOS comparison](./inertia-ios-experiments.md#follow-up-complete-zero--one--and-two-raf-comparison): one
  and two rAFs each passed 16/16 full catch-ups. Zero-rAF outcomes depended on layout flushing and cursor
  reconciliation, so the iOS shortcut is not a portable replacement.
- [Production verification](./inertia-ios-experiments.md#production-integration-verification) covers native
  commands and new-touch interruption. [Bounce trials](./inertia-ios-experiments.md#bottom-bounce-native-reproduction-and-verification)
  at 0/80/250ms produced zero controller writes and zero hidden frames for satisfied commands.
- [Local regressions](../../../../../scripts/test-chat-touch-takeover.mjs) pin cancellation, style
  restoration, replacement commands, concurrent layout, reduced motion, and real Chromium flings.
  Deterministic overscroll fixtures verify classification; they are not native Safari bounce tests.

The iOS results are simulator evidence, not physical-device guarantees. Older iOS, desktop trackpads,
nested scroll chaining, background scheduling, and classic-scrollbar geometry still need native coverage.
The regression contracts should survive replacement of this workaround; the measured frame counts and
delays should not become universal browser guarantees.

[Architecture index](../README.md)
