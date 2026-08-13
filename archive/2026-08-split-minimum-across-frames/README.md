# 2026-08 — can a held pane be painted below its own minimum?

`Demos/Buffered Split Layout/Live Commit` resizes on a policy that looks like it has
to break a minimum width. On window resize the leading pane **holds** the width it
already laid out at, and the trailing pane — positioned by two edges rather than by a
width — absorbs the entire viewport change live. A stale width against a shrinking
viewport is exactly the shape of a minimum-width violation, and the policy runs for
100ms of debounce plus a spring flight before anything corrects it.

The requirement is not "it settles correctly". It is that **no frame ever shows a pane
narrower than its own minimum**, intermediate frames included. So: does one land, and
if not, what stops it?

Both minimums are 360px of width. A pane gives up 20px to the gaps around it, so the
number to watch is a 340px box.

## Three observers, because "a frame" needs defining

The interesting part turned out to be not _whether_ a sub-minimum box exists, but
_who can see it_. Four samplers, differing only in when they run relative to the
rendering update:

| observer         | when it runs                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `task`           | a 4ms `setInterval` — any task boundary, including before the update                       |
| `resize`         | a listener registered after the component's, so it sees the DOM after the component's turn |
| `rAF`            | inside the update, after the resize steps, so it reads what that frame paints              |
| `ResizeObserver` | later in the same update, after layout                                                     |

## Numbers

Every table below is `probe.mjs` output against the real story.

**Where can both minimums even hold?** Settled geometry across the range:

```text
viewport  leading width  leading box  trailing box  both >= 340
--------  -------------  -----------  ------------  -----------
1200px    720px          700px        460px         yes
1000px    600px          580px        380px         yes
800px     440px          420px        340px         yes
720px     360px          340px        340px         yes
700px     360px          340px        320px         no
600px     360px          340px        220px         no
500px     360px          340px        120px         no
420px     360px          340px        40px          no
380px     360px          340px        0px           no
360px     360px          340px        0px           no
300px     300px          280px        0px           no
200px     200px          180px        0px           no
```

720px is the whole story of the bottom half: two 340px boxes plus 40px of gaps is
exactly 720, so below it the two minimums are not jointly satisfiable and something
has to give. What gives is a priority ladder — the stage outranks the leading
minimum, which outranks the trailing minimum — and the trailing pane goes under. That
is a steady state, not a transient, and it bounds the invariant rather than breaking
it: the claim can only be made for viewports that can afford both.

**Does an intermediate frame violate it above 720px?** The smallest box each observer
saw across the whole transition:

```text
transition                        trailing rAF  trailing ro  trailing task  leading rAF  painted below 340
--------------------------------  ------------  -----------  -------------  -----------  -----------------
1200 -> 760, one event            340px         340px        20px           380px        no
1200 -> 900, one event            340px         340px        160px          520px        no
1200 -> 900, 6 events 50ms apart  340px         340px        290px          520px        no
1200 -> 600, one event            220px         220px        0px            340px        yes, 220px
1200 -> 380, one event            0px           0px          0px            340px        yes, 0px
```

Above 720px, `rAF` and `ResizeObserver` bottom out at exactly 340 — the floor, touched
and never crossed — while a timer task reads 20px on the same transition. The two rows
that do violate are the two below 720px, where the settled state violates it too.

**So who sees the 20px?** One event, sampled by everyone:

```text
+ms   observer                  viewport  trailing box  note
----  ------------------------  --------  ------------  ---------------
0.0   ResizeObserver            1200px    460px
0.0   task (4ms timer)          1200px    460px
4.2   task (4ms timer)          900px     160px         below the floor
9.4   resize (after component)  900px     340px
9.6   rAF                       900px     340px
9.8   ResizeObserver            900px     340px
10.3  task (4ms timer)          900px     340px
```

The order is the answer. At +4.2ms the viewport is already 900px while the width is
still the held 720px, so the trailing box computes to 160px — and the only thing that
can be looking is a task, because the rendering update that describes the new viewport
has not run yet. At +9.4ms it does: the resize steps fire, the component re-clamps,
and every observer from there on — rAF at +9.6, ResizeObserver at +9.8 — reads 340.

## What makes it hold

Three properties, and the third is the one that is easy to delete by accident.

1. **The bound is a function of the viewport alone.** `maxPx = W - MIN_TRAILING_PX` _is_
   the statement "the trailing pane keeps its box", and `minPx` is the same for the
   leading pane, so both minimums are one interval on one number. The trailing pane
   never needs a clamp of its own: positioned by two edges, its width is
   `W - leading - gaps` by construction, so bounding `leading` bounds it exactly.
2. **The clamp is on the output, not on the target.** Mount, drag and the spring's
   `onUpdate` all publish through one function that clamps before writing. That is why
   a spring may fly toward a value the viewport has since invalidated without ever
   putting one on screen — what sits outside the bounds is the MotionValue, never the
   published width.
3. **The published value moves in the same task as the bound.** The `resize` handler
   re-publishes the width it already holds, for no other purpose than to run it past
   the new bound. It reads like a no-op and it is the invariant. Delete it and the
   violation survives until the debounce fires — the retarget counter in the probe's
   output shows that tick landing ~100ms later, so the 160px box above would have had
   six frames to be painted in.

Two consequences fall out of the same shape. The written width is `min(value, bound)`,
monotone and continuous in the value, so a binding clamp can only **stall** the divider
— it can never make it jump. And an out-of-bounds MotionValue is always transient:
every retarget aims at an already-clamped value and every resize event queues a
retarget, so it self-corrects within the debounce plus the flight.

## What this does not measure

`rAF` and `ResizeObserver` agreeing is as close as an in-page probe gets to the painted
frame — both run inside the update that paints it — but neither is the compositor. A
frame drawn from a stale main thread during a window drag is outside what this sees,
and no amount of JavaScript ordering would fix that case. The construction that would
is a CSS floor (`min-width` on both panes), which removes the dependency on when script
runs at the cost of changing the sub-720px behaviour from "collapse" to "hold and
overflow". The demo has not taken it; this is the record of what the current behaviour
is and why, not an argument that it is the only one available.
