# Spring intent, scheduling, and completion ownership

The spring controller stores destination intent immediately, while Motion owns frame updates and
animation lifetime. These responsibilities explain the small ordering and cancellation decisions in
[createTabSpring](../tab-spring.ts).

## Destination intent and visible pixels have different clocks

`getTarget()` reports the latest requested width as soon as `set()` returns. The MotionValue continues
to represent current pixels. A close before the next frame must budget against the intended survivor
layout, rather than the previous target or an entering zero-width footprint.

Changed targets schedule one stable `start` callback in `frame.preRender`. Motion deduplicates the
callback in its frame queue; several changes before it runs replace the stored target rather than
creating several intermediate animations. The callback samples current position and velocity when it
runs, after older animations have advanced in `update`, rather than caching that sample at `set()`.

This avoids mixing a late creation clock with an older pixel sample. There is no separate row-level
transaction object, React frame state, or custom requestAnimationFrame loop. Shared Motion phases and
the frame timestamp provide coordination; [batch timing](./animation-batch-timing.md) describes the
clock and numerical contract.

## Unchanged intent does not renew work

An identical target returns before scheduling. If a start is already pending, it remains pending once;
if a spring is already active, it keeps its identity and clock. A duplicate observer notification or
selection-only render must not create another physical handoff.

At flush time, an inactive value already equal to its destination needs no zero-distance spring.
The inactive check matters: a moving spring can cross its new destination with nonzero velocity, so
position equality alone is not a valid reason to discard its handoff.

Playback speed is stored separately from pending work. A speed change updates any active animation
in place, and a pending start reads the latest multiplier when it creates its animation. Physics stays
25/1. Creation applies speed before aligning the integer frame origin because changing JSAnimation's
speed can rebase its time; reversing this assignment order could undo the origin alignment.

## Immediate updates cancel before they jump

The immediate branch runs before unchanged-target comparison. An animation headed toward the correct
destination still needs to stop during resize or reduced motion, and queued work must not restart it.

The controller clears `pending`, cancels `start` in Motion's queue, updates the stored target, then
calls `jump()`. Clearing the flag and canceling the callback serve separate purposes: cancellation
removes future queued work, while the flag prevents an already dispatched callback from starting stale
work. Cleanup uses the same pair before stopping the active animation.

These flags describe intentional resource lifetime; they are not substitutes for required DOM or
footprint invariants. [useTabFootprint](../use-tab-footprint.ts) still requires registration and valid
refs, and writes immediate width/margin styles before paint. Hover state, its held-width snapshot,
and its release timer remain independent.

## Completion belongs to the animation that still owns the value

A spring may reach its target during `update` while a replacement is waiting for `preRender` in the
same frame. Resolving the old MotionValue animation would schedule its completion notification and
owner cleanup; that cleanup must not clear the new animation created later in the frame.

Each JSAnimation captures its own identity as `owned`. Its completion queues a microtask, then checks
`value.animation === owned` before resolving MotionValue completion. A superseded or stopped owner
does not resolve that obsolete completion. The check uses animation identity, not target equality:
two animations can share a target while having different lifetime owners.

The microtask is an ownership-ordering boundary, not a duration, a new animation frame, or the hover
release delay. A genuine completion still reaches the width listener that restores normal close-slot
flex layout. Visual exit removal independently waits for both width and leading gap to become zero
and checks that condition after render.

## Contract and evidence

| Operation                                           | Destination intent                  | Scheduled/active work                                      | Evidence                                  |
| --------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------- | ----------------------------------------- |
| Several targets before a frame                      | Latest target immediately           | One start toward that latest target                        | Coalescing regression                     |
| Identical target                                    | Unchanged                           | Preserve pending/active work                               | Same-target and retained-exit regressions |
| Immediate target, including the same target         | Final target immediately            | Cancel pending start and active motion                     | Immediate-cancellation regressions        |
| Stop during a pending start                         | Stored intent is no longer executed | Cancel pending start and active motion                     | Cleanup regression                        |
| Old completion followed by replacement in one frame | Replacement intent                  | New owner remains active; old completion is ignored        | Completion-ownership regression           |
| Change speed                                        | Keep target                         | Update active playback; queued creation uses current speed | Playback regression and controller source |

[Spring tests](../__tests__/tab-spring.test.ts) cover the listed regressions. The pending-speed detail and
inactive equality guard follow current controller source; they do not have separate named assertions.
[Browser verification](./verification.md) remains necessary for frame-to-DOM behavior and presence.

[Architecture index](../README.md)
