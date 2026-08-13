# Buffered Split Layout Live Commit

The family's control case. No View Transition, no blur, no `scaleX` standing in
for a width — and so no `visual` width and no `locked` width either. There is one
width in the component, the one the real content lays out at, and every path
writes it directly.

The two panes are peers here. There is no expand/collapse, because collapse is
what made the leading pane special in the sibling demos, and the question this
one asks is what the split costs when nothing is hidden.

## Manual Resize

Dragging the divider commits on every pointer event. Both content columns reflow
on the frame the pointer moved, `pointerup` does nothing at all, and there is
nothing buffered anywhere to reconcile afterwards.

That is the whole path. It is worth having written down because it is the
baseline the other three demos are paying to avoid: what a drag looks like when
the expensive layout is simply allowed to happen.

## Window Resize

The only path with a policy, because it is the only one with no release signal to
commit on. The policy is not to hide the reflow but to split the two panes apart.

**The trailing pane is positioned by its two edges, not by a width.** Its left
edge is the divider and its right edge is the stage, so a viewport change reaches
it live, on every resize event, with no JavaScript involved. It tracks the window
frame for frame.

**The leading pane has an explicit width, so nothing moves it until something
does.** A 100ms trailing debounce is the only thing that does. When it fires, the
width the preferred ratio now asks for becomes the target of an overdamped
spring.

Every resize event pushes the tick back, so a window drag of any length moves the
leading pane exactly once, after the hand stops. Measured over 1200px → 1100px in
five events 60ms apart: five resize events, one retarget, with the leading pane
holding its width for the whole burst while the trailing pane moved on every one
of them.

100ms rather than the siblings' 200ms, and it can be half as long because the
delay is not covering anything. There it has to outlast a gesture whose reflow is
hidden behind a blur or a snapshot; here the reflow _is_ the animation, so the
only thing the delay buys is confidence that the window has settled.

So for the whole length of a window drag the leading pane does no layout work
whatsoever and the trailing pane does all of it. The divider gliding to its new
place afterwards is that deferred work becoming visible — the same reflow the
siblings spend a blur or a snapshot to cover.

Damping is not a taste choice on this path. Every frame the divider moves is a
real reflow of both columns, so an overshoot lays the content out past its target
and then lays it out again on the way back.

The spring is overdamped rather than critically damped — `k = 1600`, `c = 120`,
where critical would be `2√(km) = 80`, so ζ = 1.5. ζ = 1 is only the no-overshoot
boundary for a spring released from rest, and this one is not always released from
rest: a retarget that lands mid-flight inherits the value's velocity, and enough
inbound velocity crosses the target once even at critical damping. The margin is
what buys the guarantee, and it holds where it matters — measured on a reversal,
narrowing to 900px and then widening to 1500px 160ms later, mid-flight: overshoot
0.00px.

What the stiffness buys is the departure, not the arrival. The poles sit at
`ω(ζ ± √(ζ² − 1))` = 105/s and 15.3/s; the fast one is why the divider leaves
within a frame, the slow one sets the tail, and at τ = 65ms that tail is around
30% longer than a critically damped spring at the siblings' `k = 400` (τ = 50ms).
Measured on a 120px move from rest: first movement at 11ms, within half a pixel at
486ms, overshoot 0.00px. Tightening the arrival means lowering ζ or raising `k`
further — it does not come from this pair.

### The one exception

A viewport can narrow past the point where the held width leaves the trailing
pane its minimum. The clamp that catches this lives on the width write rather
than at each caller, so it applies on the frame it is crossed, on every path,
including a spring already in flight toward a target that was correct when the
debounce fired. Measured at 1100px → 800px: the leading pane gives way
on the resize event itself — the first frame this component gets — rather than
holding a width that leaves the trailing pane 120px until the next tick.

The leading pane moving without a tick is a deviation from "the leading pane
holds", and it is the right one. The alternative is a pane below its own minimum
width.

Keep narrowing past that point and the two panes trade places: the trailing pane
sits pinned at its minimum and the leading pane becomes the one absorbing the
viewport live. Measured over 1100px → 900px in twenty events 40ms apart, the
first eight held the leading pane and the remaining twelve moved it — one
retarget for the whole gesture either way, because the clamp writes the width
without touching the debounce.

Clamping on the write leaves the MotionValue free to sit outside the bounds while
the DOM does not, which is one source of truth with a clamp on its way out rather
than two that disagree. Two properties make that safe, and they are the reason
this is not a hack: every retarget aims at an already-clamped value and every
resize event queues a retarget, so an out-of-bounds value is transient and
self-correcting within the debounce plus the spring's flight; and the width
written is `min(value, bound)`, monotone and continuous in the value, so a binding
clamp can only stall the divider, never make it jump. Measured coming out of a
clamped viewport — 760px, where the bound holds the divider at 400px, widened to
1000px — the divider moves off in ordinary spring steps with no discontinuity.

### When both minimums cannot hold

Below 720px the two 360px minimums cannot both be honoured, and `getLeadingBounds`
arbitrates it: **the stage outranks the leading minimum, which outranks the
trailing minimum.** A pane's box is 20px narrower than the width it is handed, so
measured across the bands:

| viewport      | leading   | leading box  | trailing box                         |
| ------------- | --------- | ------------ | ------------------------------------ |
| ≥ 720px       | the split | ≥ 340px      | ≥ 340px                              |
| 380px – 720px | 360px     | 340px        | below its own minimum, 0 at 380px    |
| < 380px       | 360px     | 340px        | 0 — the used width would be negative |
| < 360px       | the stage | stage − 20px | 0                                    |

The trailing pane is positioned by two edges rather than by a width, so there is
no width for JavaScript to clamp in the last two rows; CSS floors the used width
at 0 on its own. The metrics derive 0 the same way, so the panel and the DOM agree
rather than the panel reporting a box that is not there. Every band is total and
monotone in the viewport width — the point of writing them down is that there is
no width at which the layout is merely undefined.

One consequence is not cosmetic. Where the bounds collapse to a single value the
divider cannot move, so a drag there carries no information and must not be
recorded as intent — otherwise a gesture with no visible effect rewrites the split
for every wider viewport afterwards. Measured before the guard: at 500px wide, one
drag took a stored 60% to 72% without the divider moving a pixel, and nothing
recovers it. Being pinned against one wall of a band that is still open is a
different case and does keep writing, because there the divider really is where
the pointer left it.

The divider still shows `cursor: col-resize` while it is pinned, which is a lie
this demo keeps: making it inert below a threshold is a second visual state to
explain, and the split is not the subject here.

## Target Ghost

The dashed line is where the divider is heading. It sits underneath the divider
on every path but the debounced one — during a drag the pointer _is_ the target —
and during a window resize the gap between the two is exactly the layout work the
leading pane has not done yet.

## Debug Overlay

- `pane`: the pane box width.
- `target`: the width that pane will have once the divider reaches the ghost.
- `layer`: the content layer inside the pane.
- `content`: the real content column, capped at 640px.
- `preferred`: the stored split ratio. Only a drag rewrites it, and only where the
  divider can move, so a viewport too narrow to honour the ratio clamps the width
  without losing the intent.
- `mode`: `idle`, `dragging`, `window resize` (a debounced tick is pending), or
  `settling` (the spring is running with no tick pending).

The counter in the corner reads `resize N | retarget M`: how many events the
window sent, and how few of them moved the leading pane. The dot flashes on each
retarget.

## Siblings

- [view-transition-commit](../view-transition-commit/README.md) — the same layout
  with the reflow hidden behind old/new snapshots. Read its known-issue section
  before reusing it.
- [blur-commit](../blur-commit/README.md) — the same layout with the reflow
  hidden behind a 6px blur.
- [spring-commit](../spring-commit/spring-commit.tsx) — the committed container
  springs to the buffered target.
