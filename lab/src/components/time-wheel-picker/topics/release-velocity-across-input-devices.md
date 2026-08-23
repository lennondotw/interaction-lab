# Release velocity across input devices

**Status:** open · **Touches:** `pointer-velocity.ts`, `use-wheel.ts` (`settleWithVelocity`)

## The question

A fling is only as good as the velocity read at the moment the pointer is released, and that
read currently comes from one rule for every input device: average the pointer's movement
over the last 80ms, and treat a gap longer than 100ms since the last move as a deliberate
stop.

That rule was chosen against a known failure — `MotionValue.getVelocity()` uses two samples,
so a single jittery final `pointermove` could throw the wheel forty rows — and it fixes that.
What it has never been checked against is whether one window suits both a finger and a
mouse. There is reason to think it does not: a mouse or trackpad drag often **decelerates
sharply just before the button comes up**, because the hand is aiming rather than throwing.
Averaging over 80ms then reports the speed of the aiming, not of the gesture, and the wheel
under-throws. A finger leaving a touchscreen has no equivalent habit — contact simply ends,
usually at speed.

If that is real, the two devices want different treatment, and the interesting part is
_which_ treatment rather than _whether_.

## What is unknown

- **The shape of the deceleration.** Does a mouse drag decay over the last 20ms, 50ms, 150ms?
  A window that is too short is noise; too long and it eats the flick. The right number is a
  property of hands and hardware, not something to pick.
- **Whether the peak is a better estimator than the mean.** Taking the maximum speed within
  the window, or the mean of the fastest half of it, would ignore a terminal slowdown by
  construction. That may be right for a mouse and wrong for a finger, which would make the
  estimator device-dependent rather than the window.
- **Whether `pointerType` is enough to branch on.** `mouse` / `pen` / `touch` is available on
  every event, so branching is cheap. But a trackpad reports as `mouse` while behaving more
  like a finger in some respects, and a touchscreen laptop mixes both within one session.
- **Whether coalesced events hide the answer.** `getCoalescedEvents()` exposes the samples
  the browser merged into one `pointermove`. If the deceleration happens inside a coalesced
  group, the current sampling cannot see it at all and any window tuned without it is tuned
  against the wrong data.
- **Whether this interaction belongs on the desktop at all.** A wheel picker is a touch
  idiom. On a desktop the same value is usually better served by typing, the arrow keys or
  the scroll wheel — all of which this component already supports and none of which involves
  a release velocity. It is worth knowing whether desktop flinging is a path to make good or
  a path to make merely inoffensive, because that changes how much of the above is worth
  doing.

## How to find out

A **sampling story** rather than reasoning. The component already routes every
`pointermove` through one place, so a story can record the raw stream and draw it:

- Log `{ time, y, pointerType, coalesced }` for a whole gesture, from `pointerdown` to the
  release, without touching what the wheel does with it.
- Plot instantaneous speed against time, with the release marked, so the terminal shape is
  visible rather than inferred.
- Overlay what each candidate estimator would have returned — the current 80ms mean, a 40ms
  mean, the in-window peak, the fastest-half mean — so they can be compared on the _same_
  gesture instead of by feel across separate attempts.
- Collect a handful of gestures per device: mouse, trackpad, touchscreen. The question is
  about a habit, so one gesture proves nothing.
- Report where the wheel would have landed under each estimator, in rows. Rows are the unit
  the user experiences; pixels per second are not.

Only then decide, and record the numbers in `archive/` the way the typeahead and drum
questions were, since the outcome is a constant that will otherwise look arbitrary.

## Related

- `pointer-velocity.ts` — the current window, and why it is not `getVelocity()`.
- `archive/2026-08-wheel-typeahead-platform` — the shape a measured decision takes here.
- The `tap-drag-threshold` skill covers the _start_ of a gesture; this is about its end.
