# Catch-up while message slots expand

Settled following and animated catch-up have different position owners. Both should converge to the
real bottom after a finite sequence of sends, provided layout stabilizes and the user does not interrupt.

## Decision and why

Let `B(t)` be the current maximum scroll offset and `P(t)` the scroll spring's position. With fixed
composer clearance:

```text
Settled following: actual scrollTop = B(t)
Animated catch-up: actual scrollTop = clamp(P(t), 0, B(t))
Final spring target = current content height + pending layout height - viewport height
```

Settled following directly compensates the slot's 28/1 height animation. There is no second scroll
spring, and the content-end line stays fixed on screen. Catch-up uses a separate 22/1 spring. The end
line may move while catching up; keeping it fixed is not the correct assertion for this state.

Expansion increases current height while reducing pending height, leaving the final target unchanged.
Differences within 0.5px do not retarget. A second send changes the target; retargeting starts from the
actual scroll offset and carries the sampled spring velocity, adjusted for playback speed. The first
flight keeps its original shape clock and uses destination compensation rather than restarting.

A faster scroll can hit the still-expanding boundary. Clamping two continuous trajectories preserves
position continuity but can change velocity at their intersection. If scrolling finishes before layout,
settled following continues to compensate subsequent height updates. Velocity continuity is not required.
Native rounding and completion tolerances mean the implementation is not an exact real-number model.

The current Motion implementation can advance the old spring to the current timestamp during `stop()`.
Therefore, retarget need not leave `scrollTop` numerically unchanged within the commit. Distinguish that
elapsed motion from a layout discontinuity by comparing content coordinates and sampling visible frames.

## Verification boundary

[Catch-up checks](../../../../../scripts/test-chat-catch-up.mjs) cover 8px and 100px upward escape, one
or two identical sends, and 0.1x/1x playback. They check stable projected targets between sends, layout
continuity, bounded frame displacement, convergence without a rescue scroll, and aligned flight handoff.
Separate controller fixtures use 10/1 and 40/1 layout expansion to exercise both relative speed orders.
These finite cases do not prove every possible timing or strict velocity continuity.

- Related: [follow intent](./bottom-following.md), [destination compensation](./destination-compensation.md),
  and [flight handoff](./flight-handoff.md).
- Implementation: [scroll controller](../chat-scroll-controller.ts) and [final geometry](../chat-layout.ts).

[Architecture index](../README.md)
