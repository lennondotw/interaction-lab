# Animation batch timing during consecutive closes

Complementary tab expansion and collapse must use a coherent sample clock. Otherwise each spring can
preserve its own footprint and velocity while the total row temporarily contracts, moving the add
button even though the destination remains full.

## Publish intent immediately, hand off at preRender

[createTabSpring](../tab-spring.ts) records a changed destination synchronously. Consecutive closes can
therefore read the latest intended width before the next frame. Starting the replacement animation is
scheduled once in Motion's `preRender` phase; additional targets before that phase coalesce to the
latest destination.

Motion's `update` phase has already advanced all existing animations before `preRender`. Replacement
springs read their footprint and analytic velocity at that shared frame sample. Existing exits with
unchanged zero destinations keep their owned animations and continue from the same frame time.
They do not need to be restarted just to synchronize with survivors.

The new animation's start time is rounded to the shared frame timestamp's nearest millisecond.
JSAnimation rounds elapsed milliseconds internally; using integer origins makes old and new clocks
agree at fractional requestAnimationFrame timestamps. Without this alignment, frame-phase scheduling
alone removes the larger drift but can retain a smaller timing-rounding ripple.

For an integer origin `k`, `round(nextTime - k) = round(nextTime) - k`. Old and newly
created generators therefore use the same rounded sample grid. This rounds a millisecond clock, not
CSS widths, spring frequency, playback speed, or real-time hover/keyboard delays. Speed assignment
precedes origin alignment because the speed setter can rebase the clock; see
[spring scheduling and lifetime](./spring-lifecycle.md).

The add button remains in normal flow. Its placement follows actual tab/gap footprints; no independent
horizontal spring, pinned position, or compensation transform conceals the layout budget.

## Completion and cancellation own their lifetime

An old spring can finish during `update` in the same frame that `preRender` starts its replacement.
Its completion notification is deferred to a microtask and released only if that animation still owns
the MotionValue. An obsolete completion must not clear the replacement or prematurely report the new
entrance as complete.

Immediate mount/resize/reduced-motion updates cancel any pending start before jumping to the final
value. Cleanup cancels pending starts as well as the active animation. If several changes coalesce to
an already settled footprint, no zero-distance animation is needed. An unchanged destination still
leaves its pending or active animation alone; duplicate observations do not renew clocks.

This scheduling adds no React state or custom requestAnimationFrame loop. It uses Motion's existing
frame phases. [Hover release](./hover-hold.md) and keyboard repeat retain their real-time timers.

The [spring lifecycle note](./spring-lifecycle.md) records the individual pending-state, coalescing,
inactive-equality, and completion-identity decisions and their test coverage.

## Why creation-time handoff drifted

Previously, a changed target captured the most recently rendered footprint and created its replacement
immediately during the React layout pass. Older exits retained their clocks because their zero targets
had not changed. At the next frame, those exits had advanced from the older sample while new survivor
animations had advanced only from the later creation time. Their complementary changes did not cancel.

A deterministic probe with the installed Motion JSAnimation isolated this mismatch: sampling a close
batch at 160 ms and starting only new replacements at 172 ms produced about 605.28 px instead of 606 px
at the next sample. The 12 ms offset was an experimental input, not a constant measured in the browser.
The correction aligns the handoff sample rather than restarting every spring on every observation.

## Verification and numerical boundaries

[Spring tests](../__tests__/tab-spring.test.ts) simulate twenty-to-eight consecutive closes committed
between frames at 0.1×, 0.25×, 0.5×, and 1×. Fractional frame times exercise elapsed-time rounding;
previous exits retain their animation identity. The total footprint stays within the combined rest
residue allowance: up to forty independent width/gap values, each settling below 0.001 px. Separate
cases cover target coalescing, immediate/cleanup cancellation, and obsolete completion ownership.

The consecutive-close regression fails against the pre-fix implementation at all four speeds. The
base commit's existing spring tests pass. Browser probes on October 3, 2026 used twenty tabs at 0.25×,
closed twelve through Shift+W, and kept `natural` hover status and an approximately 606 px full target:

| Sampled variation          | Before correction | After frame and integer-clock alignment |
| -------------------------- | ----------------- | --------------------------------------- |
| Add-button left coordinate | About 3.28 px     | About 0.16 px                           |
| Raw animated footprint sum | About 3.17 px     | About 0.0018 px                         |

The remaining visible difference is fractional CSS width/margin quantization across the row. These
are session samples, not exhaustive frame or cross-browser coverage. A constant destination budget
does not imply mathematically exact painted-pixel equality, and changes that intentionally shorten
the destination, such as held middle closes or reaching the base-size cap, still move the add button.

Related: [spring continuity](./spring-parameters.md), [presence footprints](./presence-and-footprints.md),
and [verification](./verification.md).

[Architecture index](../README.md)
