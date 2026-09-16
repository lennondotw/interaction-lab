# Reversible typing presence

Separate typing intent from whether its visual is still mounted. Turning typing off changes grouping immediately but may leave a visual alive while it exits.

## Decision and why

Settled typing occupies its natural 33px body plus the owned leading gap. Entry measures that footprint before paint and grows a temporary slot from zero. Exit captures the footprint and shrinks a temporary slot to zero. The visual stays full size, aligned at the top after the gap; its independent offset enters from 20px below and exits 10px downward while fading.

Reopening during an ordinary exit retargets current height progress, opacity, and offset instead of replaying from a fresh zero state. Their current values and velocities preserve continuity. Once settled, temporary geometry is removed and the indicator returns to natural flow.

Tail visibility follows intent immediately, while the transition retains the captured spacing needed for continuous geometry. Entry publishes pending height to shared layout projection. Layout ticks notify scrolling so a settled followed bottom tracks the height directly and shrinking-range movement remains correctly owned.

A reply that turns typing off in the same update is a different path: [typing replacement](./typing-replacement.md). Reopening during that replacement starts a fresh entry instead of reversing a collapse. Reduced motion bypasses the animated lifecycle.

## Evidence

- Implementation: [presence, geometry, and reversible values](../use-typing-exit.ts).
- History: [ce1ead4](https://github.com/lennondotw/interaction-lab/commit/ce1ead4); later changes are reflected in the current implementation.
- Validation: [relevant checks](./verification.md#layout-and-typing).

[Architecture index](../README.md)
