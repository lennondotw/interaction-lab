# What choosing a coordinate frame buys a beacon's follower, and what it cannot buy

**Date:** 2026-08 · **Status:** shipped; one measurement bug found on the way · **Applies to:** `origin.ts`, `use-beacon.ts`, `use-active-beacon.ts`, `follower.tsx`, `layout-offset.ts`

A beacon publishes one box — position and size — and a shared follower springs to
it. Which numbers that box contains is a choice, and until this investigation the
choice was implicit: the container's top-left corner.

That frame has a property nobody picked deliberately. A horizontally centred
element's distance from the left edge is half the container's width, so **shrinking
the window is a change of position in that frame**. The spring is handed a moving
target and trails it for as long as the drag lasts. Nothing about the element
moved; the frame did.

The reflex is to stiffen the spring. That is the wrong layer: the input was wrong,
not the smoothing. This file measures the alternative — expressing the same
geometry against a reference point the layout actually holds still — and, more
usefully, measures **where it stops working**, because "pick the right frame" is
otherwise very easy to over-generalise into a cure for tracking lag in general.

## The design

### One fraction, used twice

An origin is a fraction per axis. It is applied to **two** boxes, and that is the
whole idea:

```
coordinate = (the beacon's own f-point) − (the container's f-point)

  f = 0    left / top edge      'start'
  f = 0.5  centre               'center'
  f = 1    right / bottom edge  'end'
```

So `f = 0.5` reads as "the beacon's centre, offset from the container's centre",
and a centred element reports a constant `0` at every container width. `f = 0`
degenerates to the old top-left behaviour exactly, which is why it is the default.

The two axes are independent and usually differ — the common page is
`{ x: 'center', y: 'start' }`. An omitted axis inherits the provider's default
([`resolveBeaconOrigin`](../../lab/src/components/beacon/origin.ts#L117)).

### The measurement side cancels before the spring sees anything

Both terms are read in one `measure()` call
([`use-beacon.ts:377`](../../lab/src/components/beacon/use-beacon.ts#L377)):

```ts
const frame = readBeaconOriginFrame(container); // clientWidth / clientHeight
handle.update({ position: toBeaconOriginFrame(box, frame, { x: originX, y: originY }) });
//   x = box.left + origin.x * (box.width - frame.width)
```

A resize moves the element and the frame by amounts that cancel, and the
cancellation happens **inside a single measurement**. Two separate observers —
one for the element, one for the container — would each fire with a stale view of
the other's term and leave a frame of jitter behind. This is why the origin term
costs no observer.

### The rendering side must not put the origin term through a spring

The follower rebuilds the frame out of two CSS percentages
([`follower.tsx:228`](../../lab/src/components/beacon/follower.tsx#L228)):

```ts
left: '50%',            // the container term — re-resolved by layout
top:  '50%',
translate: '-50% -50%', // the beacon's own term — a % of its own live box
x: springX, y: springY, // only the anchor-relative coordinate is animated
width: springW, height: springH,
```

This is the load-bearing detail. `left` is re-resolved by the browser in the same
layout pass the container resizes in, so the follower moves with the container
_instantly_ — no observer, nothing to catch up on. Springing that term is what
caused the original lag. `translate` percentages resolve against the element
itself, so the compositor recomputes the second term on every frame of the size
spring rather than interpolating between two states.

`translate` is an independent transform property, applied before `transform` and
composing with it, so it coexists with the `x` / `y` motion writes instead of
fighting them. It is also not in motion's transform-prop list, so it passes
through as a plain style.

### Two axes of choice, not one

The origin picks **which point** inside a box is the reference. `containerRef`
picks **which box**. They solve different failures, and §2 below is the proof that
one cannot substitute for the other:

| choice         | cancels                          | cannot cancel |
| -------------- | -------------------------------- | ------------- |
| `origin`       | container / viewport **resize**  | scroll        |
| `containerRef` | **scroll** of the registered box | resize        |

### The frame belongs to the beacon, and handoff has to convert

The right fraction is a property of how an element is laid out, so it is declared
per beacon, with a provider-level default for the region
([`context.ts:34`](../../lab/src/components/beacon/context.ts#L34)). It is
immutable while a beacon is registered — every position written under it is
interpreted in it — and re-read at push time, so a beacon that mounts disabled
adopts the frame it has when it is enabled
([`use-beacon.ts:113`](../../lab/src/components/beacon/use-beacon.ts#L113)).

The cost of per-beacon frames is that one slot can hold two beacons that disagree,
while the springs hold a value in the outgoing frame. `useActiveBeacon` converts
it in a **layout effect**, because the CSS percentages change on the render that
observes the swap and the springs have to agree with them before that render
paints ([`use-active-beacon.ts:181`](../../lab/src/components/beacon/use-active-beacon.ts#L181)):

```ts
x' = x + (to.x - from.x) * (springW.get() - frame.width)
```

Note it converts the spring's **current** value, not the target's. When the swap
happens mid-flight, what continuity has to preserve is the lag.

### The growth anchor is the same fraction, deliberately

Using one fraction for both roles couples one more thing: the origin point is
what holds still while the size spring runs. §4 measures it. The alternative —
a second, independent parameter — is possible (spring `x + (g − f) · targetSize`
and render `x − g · size`, which leaves resting geometry identical for any `g`)
and was rejected, because `g = f` is the only value that keeps position and size
**orthogonal**. Any other puts `targetSize` into the position value, so an element
that merely resizes would kick the position spring.

## Method

Seven blocks against the real `Components/Beacon` stories, driven by
[`probe.mjs`](./probe.mjs). Nothing is re-implemented: every measurement is the
**painted** geometry — `getBoundingClientRect` on the follower against
`getBoundingClientRect` on the target — which is deliberately _not_ the
`offsetParent` walk the hook uses to decide where to paint. An instrument that can
disagree with its subject is the only kind that can report a measurement bug as a
number instead of as two copies of the same mistake agreeing. (§6 is the block
where that mattered.)

Sampling is per `requestAnimationFrame` inside the page, so a "frame" is a real
compositor frame. Headless Chromium, for one specific reason: an occluded headed
window stalls rAF while still reporting `visibilityState: "visible"`, and every
peak in this file would read as `0`.

Two columns recur. **peak Δ** is the worst disagreement at any frame — the error a
user could see. **settled Δ** is the gap once everything is at rest; non-zero
means the measurement itself is wrong, not merely late.

## 1 · Resize: the frame removes the lag, it does not divide it

Three layouts — corner-pinned, centred, far-corner-pinned — with the slider
resizing the stage on both axes at once. First with each layout given the origin
it holds still against, then with all three claiming the corner.

**origin matches the layout** — peak Δ x / y:

| layout · origin      | 4px/frame | 12px/frame | 32px/frame | 60px/frame | settled Δ |
| -------------------- | --------- | ---------- | ---------- | ---------- | --------- |
| `top-left · start`   | 0 / 0     | 0 / 0      | 0 / 0      | 0 / 0      | 0 / 0     |
| `centred · center`   | 0 / 0.2   | 0 / 0.1    | 0 / 0      | 0 / 0      | 0 / 0     |
| `bottom-right · end` | 0 / 0     | 0 / 0      | 0 / 0      | 0 / 0      | 0 / 0     |

**all three claim the corner** — peak Δ x / y:

| layout · origin        | 4px/frame   | 12px/frame  | 32px/frame  | 60px/frame | settled Δ |
| ---------------------- | ----------- | ----------- | ----------- | ---------- | --------- |
| `top-left · start`     | 0 / 0       | 0 / 0       | 0 / 0       | 0 / 0      | 0 / 0     |
| `centred · start`      | 22.5 / 14.3 | 49.8 / 30.8 | 47.8 / 29.9 | 60 / 37    | 0 / 0     |
| `bottom-right · start` | 44.9 / 28.1 | 99.5 / 61.3 | 95.7 / 59.8 | 120 / 74   | 0 / 0     |

Four things worth reading off this:

**The right frame is 0 at every speed, not "small".** There is no spring activity
to be fast or slow about, because the published coordinate does not change. The
one exception is the `0.2 / 0.1` in the centred row, which is §5's rounding
residue and not lag — it does not grow with speed, it shrinks, because it is a
fixed ±0.5px wobble being sampled fewer times.

**A wrong frame's error is speed-dependent, which is the signature of a spring
chasing something.** It saturates at the full displacement: at 60px/frame the drag
finishes in two frames and the follower has not started moving, so the peak _is_
the displacement (60 for a centred element, 120 for a far-corner one over the same
120px stage change).

**The error is proportional to how much of the container's size the layout
consumes** — 0 for corner-pinned, half for centred, all of it for far-corner —
and the two wrong rows sit in a clean 1 : 2 ratio at every speed. Two beacons
lagging by _different_ amounts in the same drag is the tell that the frame is
wrong rather than the spring being slow.

**Every row settles to 0.** A wrong frame is not a wrong measurement; it is a
correct measurement of a quantity nobody wanted animated. That is exactly why it
is easy to ship: at rest it looks perfect.

## 2 · Scroll: the boundary of the whole idea

| subject                      | position   | rest Δ  | peak Δ      | settled Δ | coordinate moved |
| ---------------------------- | ---------- | ------- | ----------- | --------- | ---------------- |
| panel · frame = the panel    | `absolute` | 0 / 0   | **0 / 0**   | 0 / 0     | **0 / 0**        |
| panel · frame = the viewport | `fixed`    | 0 / 0   | 0 / 203.3   | 0 / 0     | 0 / −300         |
| page · frame = page content  | `absolute` | 0 / 0.3 | **0 / 0.3** | 0 / 0.3   | **0 / 0**        |
| page · frame = the viewport  | `fixed`    | 0 / 0.3 | 0 / 259.6   | 0 / 0.3   | 0 / −400         |

The `coordinate moved` column is the finding, not the peak. It is the springed
value itself, read back out of what motion wrote, sampled at rest before and after
the scroll:

- framed by the scrolled box, the published coordinate **does not change at all**
  over a 300px scroll;
- framed by the viewport, it changes by exactly the scroll delta — 300 and 400.

**No origin fraction can cancel that.** The origin term is `f × frame extent`, and
scrolling changes neither `f` nor the extent, so the entire scroll delta lands in
the layout term where no reference point can reach it. This is not a tuning
failure, it is the correct answer: relative to the viewport, a scrolled element
really does move.

What fixes it is the other axis of choice. Measured against a scroll container the
walk deliberately stops there and leaves the container's own scroll in
([`layout-offset.ts`](../../lab/src/components/beacon/layout-offset.ts), the
container exception), because the follower is `position: absolute` inside it and
the same scroll carries both. The follower then tracks by **layout**, not by
animation: the transform written on it never changes during the scroll.

The page row is the useful shape of the fix. The registered wrapper is _not_ a
scroll container — the document scrolls — but registering it is still enough,
because the walk stops there and the follower becomes an absolutely positioned
element in the page flow. The reflex for page scroll is `position: fixed`, which
is exactly the version that lags by 260px.

## 3 · What the handoff conversion is worth

`without conversion` is `Δf · (w − W)`: what the swap would have jumped by if the
held value were reinterpreted under the incoming frame's percentages.

| swap                                    | frame `left%` | jump px | without conversion |
| --------------------------------------- | ------------- | ------- | ------------------ |
| push #2 · at rest, corner → centre      | 0% → 50%      | **0**   | 131                |
| pop #2 · at rest, centre → corner       | 50% → 0%      | **0**   | 109                |
| _(lag carried into the next swap)_      | —             | _72.07_ | —                  |
| push #2 · mid-drag, wrong frame → right | 0% → 50%      | **0**   | 45                 |
| pop #2 · mid-drag, right frame → wrong  | 50% → 0%      | **0**   | 135                |

Every component of how the follower is painted changes across these swaps —
`left`, `translate`, and the springed value — and the painted position moves by
0.00px. The mid-drag rows are the ones that constrain the implementation: the swap
happens while the surface is 72px behind its target, and the conversion has to
preserve **that**, because it converts the spring's current value rather than the
target's. A conversion of the target instead would snap the surface onto the new
beacon and lose the velocity continuity the shared follower exists for.

## 4 · The growth anchor, per axis, for the whole transition

Grow the target by +80 × +40 and record the largest deviation of each of the
follower's edges from where it started, over 50 frames:

| layout · origin      | left  | centre x | right | top   | centre y | bottom |
| -------------------- | ----- | -------- | ----- | ----- | -------- | ------ |
| `top-left · start`   | **0** | 40.8     | 81.6  | **0** | 20.4     | 40.8   |
| `centred · center`   | 40.8  | **0**    | 40.8  | 20.4  | **0**    | 20.4   |
| `bottom-right · end` | 81.6  | 40.8     | **0** | 40.8  | 20.4     | **0**  |

Exactly one quantity per axis is 0, and it is the origin's point. The zeros are
exact and hold for the _whole_ transition, not just its ends, because the
renderer's own offset is a percentage of its live box rather than an interpolation
between two computed offsets. The overshoot visible on the far edge (81.6 for an
80px change) is the size spring, and it appears only on non-anchored edges.

Per-axis independence falls out of the same mechanism: `start` is 0 on both `left`
and `top`, so `{ x: 'center', y: 'start' }` grows symmetrically across and
downwards.

## 5 · The sub-pixel residue is parity, not noise

Centre origin, stage width one pixel at a time:

| stage | clientWidth | parity | `offsetLeft` | springed x | visual Δx |
| ----- | ----------- | ------ | ------------ | ---------- | --------- |
| 300   | 298         | even   | 79           | 0          | 0         |
| 301   | 299         | odd    | 80           | 0.504      | 0.5       |
| 302   | 300         | even   | 80           | −0.004     | 0         |
| 303   | 301         | odd    | 81           | 0.504      | 0.5       |
| …     | …           | …      | …            | …          | …         |
| 311   | 309         | odd    | 85           | 0.504      | 0.5       |

Perfectly correlated with the parity of `clientWidth`, alternating 0 / +0.5 across
a drag. `offsetLeft` and `clientWidth` are integers while layout positions
elements at fractional pixels, so the residue is the price of `offset*`'s
transform-immunity, not something the frame introduced — a corner-pinned beacon in
a container of odd height reports the same ±0.5. It is a spring input a hundred
times smaller than the lag the frame removes.

## 6 · The border term the walk was dropping

This block is arithmetic rather than behaviour, so the number means the same thing
whether or not the fix is present: sum the `offsetParent` chain the way a naive
walk does, then with each hop's `clientLeft` / `clientTop`, against the rect.

| element → frame                   | naive Σ `offsetLeft` | + `clientLeft` | truth     | bordered hops | term costs |
| --------------------------------- | -------------------- | -------------- | --------- | ------------- | ---------- |
| panel-framed target → panel       | 59 / 56              | 59 / 56        | 59 / 56   | none          | 0 / 0      |
| panel-framed target → viewport    | 387 / 334            | **388 / 335**  | 388 / 335 | `div 1/1`     | 1 / 1      |
| viewport-framed target → panel    | 59 / 56              | 59 / 56        | 59 / 56   | none          | 0 / 0      |
| viewport-framed target → viewport | 711 / 334            | **712 / 335**  | 712 / 335 | `div 1/1`     | 1 / 1      |

The two ends of a hop are measured from different edges. `node.offsetLeft` is
relative to its offsetParent's **padding** edge, but the next iteration's
`offsetParent.offsetLeft` locates that parent's **border** edge — so summing raw
`offsetLeft`s drops one border width per hop, permanently. `clientLeft` /
`clientTop` is exactly the missing quantity, and with it the walk matches the rect
in all four cases.

The rows where the term is 0 are the reason this survived a previous
investigation: when the bordered element **is** the container its border is
correctly excluded, because the follower is positioned inside it and the final
hop's `offsetLeft` already reports a padding-box-relative number. The term only
goes missing when a bordered offsetParent sits _strictly between_ the element and
the frame — which no story did until the viewport-framed scroll panel, whose
resting error was (−1, −0.5) before the fix and (0, 0.5) after. A 1px dashed
border cost 1px; a 4px border would cost 4.

That the instrument uses `getBoundingClientRect` while the subject uses the walk is
what made this visible at all. Had the probe measured the same way the hook does,
both would have agreed on 804 and reported success.

## 7 · Freeze inherits whatever the frame guarantees

`onEmpty: 'freeze'` holds the last coordinate with nothing measuring. Pop the only
beacon, then shrink the viewport 1280×900 → 940×680:

| story        | frame                 | rest Δ | target moved | gap while frozen | after re-push |
| ------------ | --------------------- | ------ | ------------ | ---------------- | ------------- |
| centre frame | `50% 50% · -50% -50%` | 0 / 0  | −170 / −110  | **0 / 0**        | 0 / 0         |
| corner frame | `0% 0% · 0% 0%`       | 0 / 0  | −170 / −110  | **170 / 110**    | 0 / 0         |

Same content, same pop, same resize; the frozen box is stale in one frame and
still correct in the other. "Stale" is not a property of freezing — it is relative
to the frame it froze in. The centred layout moves by half the viewport delta
(−170 of −340), and in the centre frame that movement is not a coordinate change
at all, so a frozen coordinate stays true and the outline stays glued with nothing
running.

Which means `onEmpty` and `origin` are not independent choices. Freezing geometry
is only safe in a frame the layout preserves.

## What this says about the design

The frame is not a smoothing setting. It decides **whether a change is movement**,
which is upstream of every spring parameter:

| change                      | absorbed by                              | residual      |
| --------------------------- | ---------------------------------------- | ------------- |
| container / viewport resize | the origin, if it matches                | ±0.5px parity |
| scroll of a box             | registering that box, not the origin     | 0             |
| element genuinely moves     | nothing — this is what the spring is for | —             |
| element resizes             | nothing; the anchor point holds still    | —             |

Three consequences that were not obvious before the numbers:

**A wrong frame is worse than the default.** It reads as configured, it is exact
at rest (§1, every `settled Δ` is 0), and nothing warns. The only check is whether
the layout really holds that fraction still — which is why the origin belongs to
the beacon, and why the stories keep a deliberately mismatched pair around.

**The two axes of choice have to both exist.** §2 is the case that cannot be
solved by choosing a better point, only by choosing a better box. A design that
exposed only the origin would look complete and leave scroll tracking permanently
springy.

**Keeping the origin term out of the springs is what makes it free.** §1's zeros
are not "the spring caught up in under a frame"; there is no animation. That comes
from spending the term as two CSS percentages, which also means no container
observer, and no chance for two observers to disagree by a frame.

## What this does not bound

- **Classic scrollbars.** Every measurement here is on macOS overlay scrollbars,
  where `clientWidth` does not change when a scroller becomes scrollable —
  observed ad hoc while building §2 (a panel turned into a scroller stayed at
  `clientWidth` 398), not a column of any table below. Where a scrollbar takes
  layout width, the viewport-framed origin term changes by half its width without
  any _ancestor_ resizing. The observation cascade walks up to `document.body`, not
  `documentElement`, so the common case (auto-width body) is covered by the body
  RO and the fixed-width-body case is a gap. Unmeasured, and left open.
- **Writing modes and RTL.** `offsetLeft` / `clientLeft` are physical, and
  `clientLeft` folds in the scrollbar gutter when it sits on the leading edge. No
  RTL or vertical-writing-mode case was run.
- **Fractional device pixel ratios.** All runs are at DPR 1. The ±0.5 residue in
  §5 is a CSS-pixel effect and should be DPR-independent, but that is an argument,
  not a measurement.
- **Deep offsetParent chains.** §6's chains are two hops. The border term is
  per-hop and so is the integer rounding, so both scale with depth; the sampled
  depth does not bound the residue for a deeply nested positioned tree.
- **`origin` as an arbitrary fraction.** Only 0, 0.5 and 1 were run. The
  arithmetic is linear in `f` and nothing special-cases the named values, but
  `0.25` is untested.

## Reproducing

```bash
pnpm --filter @monorepo/lab dev            # port 6010
pnpm exec playwright install chromium      # once
node archive/2026-08-beacon-origin-frame/probe.mjs
```

Set `STORYBOOK_URL` for a non-default port. The probe drives the real stories
through their own sliders and buttons, so it cannot quietly drift from what ships;
by hand, the same numbers are visible in `Components/Beacon` — `Origin · match`
and `Origin · mismatch` for §1, `Scroll · frame` and `Scroll · page` for §2, the
two `Origin · handoff` stories for §3, and the two `Lose Last · freeze` stories
for §7.

To see §6's failing side, drop the `clientLeft` term and let Vite reload:

```bash
git log --oneline -S 'offsetParent.clientLeft' -- lab/src/components/beacon/layout-offset.ts
git checkout <that commit>~1 -- lab/src/components/beacon/layout-offset.ts
node archive/2026-08-beacon-origin-frame/probe.mjs   # § 6 loses a pixel; § 2's rest Δ goes to −1
git checkout HEAD -- lab/src/components/beacon/layout-offset.ts
```

Absolute peaks track the machine and vary between runs — ~1px in §1, ~5px on §2's
scroll peaks — because both depend on where in the spring's response a sampled
frame lands. Everything the conclusions rest on is exact and stable: the zeros,
the 1 : 2 ratio between the two wrong rows in §1, the `coordinate moved` column in
§2, and every cell in §4, §5, §6 and §7.
