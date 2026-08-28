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

## Minimum Widths

The policy above is a stale width held against a shrinking viewport, which is exactly
the shape of a minimum-width violation, and it runs for 100ms of debounce plus a spring
flight before anything corrects it. So the contract has to be stated as a frame-level
invariant rather than as a settled one:

> **No painted frame shows either pane narrower than its own minimum, at any viewport
> that can afford both.** Drag, hold, spring flight and clamp included.

Both minimums are 360px of width; a pane gives up 20px to the gaps around it, so the
number this shows up as is a 340px box. Measured in
[archive/2026-08-split-minimum-across-frames](../../../../../../archive/2026-08-split-minimum-across-frames/README.md),
where a 1200px → 900px change is watched by four samplers at once: a 4ms timer task
reads a 160px trailing box, and `rAF` plus `ResizeObserver` — both inside the rendering
update that paints the frame — read 340px. The sub-minimum box exists in the DOM and is
never composited.

Three properties make it hold, and the third is the one that is easy to delete by
accident:

1. **The bound is a function of the viewport alone.** `maxPx = W - MIN_TRAILING_PX` _is_
   the statement "the trailing pane keeps its box", and `minPx` is the same for the
   leading pane, so both minimums are one interval on one number. The trailing pane
   needs no clamp of its own: positioned by two edges, its width is
   `W - leading - gaps` by construction, so bounding the leading width bounds it
   exactly.
2. **The clamp is on the output, not on the target.** Mount, drag and the spring's
   `onUpdate` all publish through one function that clamps before writing, which is why
   a spring can fly toward a value the viewport has since invalidated without ever
   putting one on screen. What sits outside the bounds is the MotionValue, never the
   published width — one source of truth with a clamp on the way out rather than two
   that disagree.
3. **The published value moves in the same task as the bound.** `republishWithinBounds`
   re-writes the width the component already holds, for no other purpose than to run it
   past the new bound, and it has to be called from the `resize` handler because that
   task runs inside the rendering update, ahead of animation frame callbacks and
   ResizeObserver delivery. It reads like a no-op and it is the invariant: without it
   the violation would survive until the debounce fired, six frames later.

Two consequences fall out of the same shape. The written width is `min(value, bound)`,
monotone and continuous in the value, so a binding clamp can only **stall** the divider
— never make it jump; measured coming out of a clamped 760px viewport into 1000px,
ordinary spring steps and no discontinuity. And an out-of-bounds MotionValue is always
transient, because every retarget aims at an already-clamped value and every resize
event queues a retarget.

The one thing this does not cover: `rAF` and `ResizeObserver` are as close as an in-page
probe gets to the painted frame, but neither is the compositor, so a frame drawn from a
stale main thread during a window drag is outside what was measured. Removing that
dependency would mean a CSS floor — `min-width` on both panes — at the cost of changing
the sub-720px behaviour from collapse to overflow. Not taken here.

### Where the leading pane gives way

The invariant is what makes "the leading pane holds" not quite true, and deliberately
so. When the viewport narrows past the point where the held width would leave the
trailing pane less than its minimum, the leading pane gives way on the resize event
itself rather than at the next tick — measured at 1100px → 800px, rather than holding a
width that would leave the trailing pane 120px.

Keep narrowing and the two panes trade places entirely: the trailing pane sits pinned at
its minimum and the leading pane becomes the one absorbing the viewport live. Measured
over 1100px → 900px in twenty events 40ms apart, the first eight held the leading pane
and the remaining twelve moved it — one retarget for the whole gesture either way,
because the clamp writes the width without touching the debounce.

### When both minimums cannot hold

Above is the affordable range, and this is where it ends. Below 720px the two 360px
minimums cannot both be honoured — two 340px boxes plus 40px of gaps is exactly 720 —
and `getLeadingBounds` arbitrates it: **the stage outranks the leading minimum, which
outranks the trailing minimum.** Measured across the bands:

| viewport      | leading   | leading box  | trailing box                         |
| ------------- | --------- | ------------ | ------------------------------------ |
| ≥ 720px       | the split | ≥ 340px      | ≥ 340px                              |
| 380px – 720px | 360px     | 340px        | below its own minimum, 0 at 380px    |
| < 380px       | 360px     | 340px        | 0 — the used width would be negative |
| < 360px       | the stage | stage − 20px | 0                                    |

The trailing pane is positioned by two edges rather than by a width, so there is
no width for JavaScript to clamp in the last two rows; CSS floors the used width
at 0 on its own. The metrics derive 0 the same way, so the panel and the DOM agree
rather than the panel reporting a box that is not there — and the panel says so out
loud: a pane resting on its floor reads `(min)`, and a pane below it reads
`(under min)`, which is reachable only in this range. Every band is total and monotone
in the viewport width — the point of writing them down is that there is no width at
which the layout is merely undefined.

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

- `pane`: the pane box width, flagged `(min)` when it is resting on its own minimum
  and `(under min)` in the range where the two minimums cannot both hold.
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

## Investigation

- [2026-08-split-minimum-across-frames](../../../../../../archive/2026-08-split-minimum-across-frames/README.md)
  — whether a pane held at a stale width is ever painted below its own minimum, and
  what stops it. Drives this story, so it cannot drift from what ships.
