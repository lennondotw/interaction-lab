# Spring parameters and continuity

Tab widths, tab leading gaps, and the add-button gap use the same 25/1 spring. Those values describe
physical response, not a duration or a playback speed.

## Physical units and settling

[createTabSpring](../tab-spring.ts) converts angular frequency 25 rad/s and damping ratio 1 through
the shared physics utility. With unit mass this gives stiffness 625 and damping 50. The critically
damped response avoids oscillation from rest; a handoff with nonzero velocity can still initially move
away from its new destination.

Positions are CSS pixels. Generator velocity is pixels per second at normal playback speed.
`restDelta: 0.001` and `restSpeed: 0.01` allow widths and gaps to settle to their exact destination,
including zero for presence removal. Completion time depends on displacement, incoming velocity,
and playback rate; the component does not promise a fixed animation duration.

## Handoff preserves footprint and velocity

Retargeting records the destination immediately and schedules replacement at Motion's `preRender`
phase. After all older animations have updated, it reads the MotionValue's current absolute footprint
before replacing its owned JSAnimation.
While active, it obtains analytic velocity with `getGeneratorVelocity()` from that animation. When
inactive, it converts MotionValue's wall-clock velocity by dividing by the playback multiplier.

The next animation starts at that footprint with that velocity. A rapid add/add/close sequence
therefore preserves both position and momentum rather than restarting from zero or from a stale target.
Setting an unchanged destination returns without replacing the animation or restarting its clock.

The immediate path is checked before that same-target optimization: `jump()` stops the old animation,
sets the final value, and clears velocity even when its destination was already correct. This matters
when [resize interrupts all animation](./animation-intent.md).

## Playback scaling is independent

`animationSpeed` is a positive multiplier, default 1. `setSpeed()` updates an active animation's speed
in place; it retains its position, generator velocity, identity, and physical parameters. Subsequent
retargets use the current multiplier without converting the analytic velocity a second time.

The stories expose 0.1×, 0.25×, 0.5×, and 1.0× to inspect motion. Slowing playback does not alter the
500 ms hover release or the keyboard helper's 400/80 ms repeat clock. Those timers run in real time.

## Coordinated motion boundaries

Equal spring parameters let complementary width changes preserve total footprint in a synchronized
batch with appropriate starting velocities. Tests exercise one-batch additions and compressed-row
removals. This does not establish exact total-width conservation for every arbitrary rapid retarget,
independent incoming velocity, or container resize. Individual springs remain the owners of their
current pixel footprints; resize deliberately replaces continuity with immediate final layout.

The [animation batch timing note](./animation-batch-timing.md) explains shared frame sampling and
integer-millisecond origins for consecutive closes. Older exits keep their clocks without getting
ahead of new handoffs. Independent rest snapping and fractional CSS layout still allow tiny residual
differences; arbitrary destination changes need not conserve total width.

Verification: [spring tests](../__tests__/tab-spring.test.ts) check the analytic critical response,
current-position/velocity handoff, unchanged-target identity, immediate cancellation, exact zero,
coordinated batches, and all four playback multipliers. Controllers stop owned animations on cleanup.

[Architecture index](../README.md)
