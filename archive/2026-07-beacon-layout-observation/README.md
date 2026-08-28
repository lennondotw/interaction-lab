# Which of the beacon's five observation sources catches which layout change

**Date:** 2026-07 · **Status:** three bugs found and fixed · **Applies to:** `useBeaconAnchor`

A beacon publishes one box — position and size, relative to a registered
container — and a shared follower springs to it. Size is the easy half: one
`ResizeObserver` and you are done. Position is the hard half, because the
browser has no "this element moved" notification, and the interesting ways an
element moves are all indirect:

- a sibling mounts and pushes it aside
- a flex property changes on the parent and the whole row redistributes
- padding or margin changes somewhere above it
- an ancestor scrolls
- the viewport resizes

`useBeaconAnchor` answers this with five primitives wired to one `measure()`
([`use-beacon.ts:289-338`](../../lab/src/components/beacon/use-beacon.ts)):
a self `ResizeObserver`, an ancestor RO cascade walking `parentElement` up to and
including the container, a capture-phase `scroll` listener on `window`, a
`resize` listener on `window`, and the `IntersectionObserver` layout-shift trick
([`layout-shift.ts`](../../lab/src/components/beacon/layout-shift.ts)).
No polling, no rAF loop.

The question this investigation asks is not "does it work" — with all five on it
did, mostly. It is **which source is carrying which case**, because that is the
only form of the answer that tells you what breaks if one of them is removed,
and the only form that can catch a source contributing _nothing_.

Which is what happened. One of the five was dead.

## Method

Ten cases, five configurations, one fresh page per run. Each configuration knocks
out one primitive from outside the app via `page.addInitScript` — stubbing
`window.ResizeObserver` / `window.IntersectionObserver`, or wrapping
`addEventListener` to swallow one event type. Nothing in the hook is forked or
mocked; the shipped code runs, with one of its senses removed.

The story owns the measurement. Two choices in it are load-bearing:

- the beacon box is read from the **store entry's raw MotionValues**, never from
  the follower — the follower runs springs, and sampling it would turn spring
  easing into apparent observation lag;
- the target box is read with an **independent** `getBoundingClientRect`
  differenced against the container, deliberately _not_ the `offsetParent` walk
  the hook itself uses. An instrument that can disagree with the subject is the
  only kind that can report a measurement bug as a number, instead of as two
  copies of the same mistake agreeing.

Each run reports a per-frame delta series, and three numbers off it:

| number        | meaning                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| **base Δ**    | beacon vs target _before_ the mutation. Non-zero ⇒ the case proves nothing. |
| **max Δ**     | worst disagreement at any frame — the error a user could see.               |
| **settled Δ** | the gap once everything is at rest. Non-zero ⇒ the change was missed.       |

Plus `frames / ms`, measured from the first frame that _saw_ the change rather
than from the mutation call — a mutation applied between frames is not observable
until the next one, and counting from the call would bill the cascade for the
browser's frame boundary.

A trace, in full:

```
201ms  case      C4 · flex property
201ms  setup     stage 680×240 · scroller static top=0 · wrap transform=none · row 420
                 justify=flex-start padL=12px · target 120px×48px marginL=0px · siblings=0
201ms  baseline  target 143,37 120×48 · beacon 143,37 120×48 · Δ 0
201ms  mutate    row justify-content: flex-start → flex-end  →  expect: IntersectionObserver
827ms  frames    Δ per frame: 274 0×30
827ms  settle    max Δ 274px · settled Δ 0px · recovered in 1 frames / 3ms
827ms  verdict   tracked · settled Δ 0px
```

`274 0×30` is the whole finding in one line: the flex change moved the target
274px, exactly one frame saw the gap, and the next 30 frames agreed.

## The cases

| #       | vector                     | mutation                                     | expected owner                             |
| ------- | -------------------------- | -------------------------------------------- | ------------------------------------------ |
| **C1**  | self resize · grow         | target width 120 → 260                       | self RO                                    |
| **C2**  | self resize · shrink       | target width 260 → 120                       | self RO                                    |
| **C3**  | sibling mounts             | a 96px sibling inserted before the target    | IO — no box changes size                   |
| **C4**  | flex property              | row `justify-content: flex-start → flex-end` | IO — no box changes size                   |
| **C5**  | parent padding             | row `padding-left: 12 → 108`                 | ancestor RO cascade                        |
| **C6**  | own margin                 | target `margin-left: 0 → 96`                 | IO — the target's own box is unchanged     |
| **C7**  | nested scroll · static     | inner `scrollTop 0 → 160` over 10 frames     | capture-phase window `scroll`              |
| **C8**  | nested scroll · positioned | the same, scroller `position: relative`      | the same, but it is now the `offsetParent` |
| **C9**  | viewport resize            | the window narrows mid-flight                | window `resize`, or the RO cascade         |
| **C10** | ancestor transform         | wrap `transform: translateX(64px)`           | **nothing** — see below                    |

C3, C4 and C6 are the cases the user asked about, and they are the genuinely hard
ones: the target moves without any observed element changing size. C6 is the
sharpest of the three — the target's own margin changes, and its own
`ResizeObserver` still says nothing, because margin is outside the box RO
measures.

## Before: two dead cases and one dead sense

| #   | all five | − RO           | − IO | − scroll | − resize |
| --- | -------- | -------------- | ---- | -------- | -------- |
| C1  | ok       | **Δ140**       | ok   | ok       | ok       |
| C2  | ok       | _setup missed_ | ok   | ok       | ok       |
| C3  | **Δ108** | Δ108           | Δ108 | Δ108     | Δ108     |
| C4  | **Δ274** | Δ274           | Δ274 | Δ274     | Δ274     |
| C5  | ok       | **Δ96**        | ok   | ok       | ok       |
| C6  | **Δ96**  | Δ96            | Δ96  | Δ96      | Δ96      |
| C7  | ok       | ok             | ok   | **Δ160** | ok       |
| C8  | **Δ160** | Δ160           | Δ160 | Δ160     | Δ160     |
| C9  | ok       | ok             | ok   | ok       | ok       |
| C10 | Δ64      | Δ64            | Δ64  | Δ64      | Δ64      |

Read the `− IO` column against the `all five` column: **identical**. Removing the
IntersectionObserver entirely changed no cell. A source that costs nothing when
removed is not covering anything, and C3/C4/C6 — precisely the cases it exists
for — failed with it switched on.

### Bug 1 — the layout-shift frame had zero height

`observeLayoutShift` frames the element's current rect with a negative
`rootMargin`, so that at rest the intersection ratio is exactly `1`; any movement
breaks the alignment and fires. The insets are computed against
`documentElement.clientWidth/clientHeight` — the viewport. The root passed to the
observer was `documentElement` itself.

Those are not the same rectangle. An **element** root contributes its own content
box; `<html>`'s content box is as tall as the page content. On a 900px viewport
with 698px of content, the bottom inset over-shrinks the frame past zero:

```
docEl.clientHeight = 900   docEl.getBoundingClientRect().height = 697.5
→ rootBounds.height = 0 → intersectionRatio = 0 at rest
```

The observer therefore reported `ratio 0` on its very first callback — never `1`
— took the not-visible-yet branch, and went to sleep for a second at a time,
forever. It never once fired for a real movement.

A **Document** root has exactly the viewport rect, which is the frame the insets
were already measured in. One word:

```ts
io = new IntersectionObserver(handler, { ...options, root: el.ownerDocument });
```

([`layout-shift.ts:144`](../../lab/src/components/beacon/layout-shift.ts).
With the fix, the wrapper logs `rootBounds.height = 48` at rest against a 48px
target — the frame fits the element exactly, as designed.)

### Bug 2 — a positioned scroller's scroll was never subtracted

C8 is C7 with `position: relative` added to the scroll panel, and it failed in
every configuration including the full one — so this was not an observation gap.
`measure()` was firing; the number it computed was wrong.

`layoutOffsetRelativeTo` walks the `offsetParent` chain accumulating
`offsetLeft` / `offsetTop`, subtracting each ancestor's scroll on the way. It
stopped one node short of the `offsetParent` itself. But `offsetLeft` / `offsetTop`
are expressed in the offsetParent's **unscrolled** content space — so when the
offsetParent is itself a scroll container (any `position: relative` element that
also scrolls, i.e. an ordinary scroll panel), its own scroll has to come off at
that hop. Direct comparison at `scrollTop = 160`:

```
walk = {x: 280, y:  37}      ← what the hook computed
truth = {x: 280, y: -123}    ← getBoundingClientRect differencing
```

Fixed by including the `offsetParent` in the subtraction walk
([`layout-offset.ts:89-95`](../../lab/src/components/beacon/layout-offset.ts)).
The container is the one deliberate exception, and it stops the walk: the
follower is positioned inside the container, so it already scrolls with the
container's content, and subtracting that scroll would double-count it.

### Bug 3 — the invisible-element retry never reported what it found

With the first two fixed, `− scroll` left C7/C8 at Δ80 — not the full Δ160, and
not zero. Wrapping the real `IntersectionObserver` from outside the page showed
the whole mechanism:

```
#0 arm=-119px -527px -733px -253px th=1      ratio=1       top=119   ← at rest
                                             ratio=0.3333  top=87    ← scrolling
#1 arm=-87px  …            th=1              ratio=0.6667  top=71
#2 arm=-71px  …            th=0.667          ratio=0.4375  top=55
#3 arm=-55px  …            th=0.4375         ratio=0.1042  top=39
#4 arm=-39px  …            th=0.104          ratio=0       top=23    ← left the clip
#5 arm=+41px  …            th=1e-7           ratio=0       top=-41
#6 arm=+41px  …            th=1e-7           ratio=0       top=-41
```

The IO tracks an inner scroll frame by frame, re-arming as it goes, for as long
as the element stays partly visible — `#0` through `#3`, and the delta series
shows it keeping up (`16 0 0 0 0`). At `#4` the target has left the 240px stage's
clip and the ratio hits `0`, which takes the not-visible branch — and that branch
re-armed with `skipNotify: true`. So `#5` and `#6` keep re-arming around the
element's new rect once a second and never report it. The beacon freezes at its
last visible measurement and stays 80px off indefinitely.

Upstream Floating UI passes `refresh(false, 1e-7)` there — `skip = false`, it
notifies. The 1000ms throttle is the loop guard; staying silent adds nothing but
a permanently stranded beacon, for any anchor that gets clipped out by scrolling,
a collapsing panel, or an accordion. Dropping the flag
([`layout-shift.ts:115`](../../lab/src/components/beacon/layout-shift.ts))
turns "never recovers" into "recovers ≈1.07s later — the retry timer", which the table below records
rather than hides.

## After

| #   | all five | − RO     | − IO     | − scroll               | − resize |
| --- | -------- | -------- | -------- | ---------------------- | -------- |
| C1  | ok       | ok       | ok       | ok                     | ok       |
| C2  | ok       | **Δ140** | ok       | ok                     | ok       |
| C3  | ok       | ok       | **Δ108** | ok                     | ok       |
| C4  | ok       | ok       | **Δ274** | ok                     | ok       |
| C5  | ok       | ok       | ok       | ok                     | ok       |
| C6  | ok       | ok       | **Δ96**  | ok                     | ok       |
| C7  | ok       | ok       | ok       | **ok, Δ80 for ≈1.07s** | ok       |
| C8  | ok       | ok       | ok       | **ok, Δ80 for ≈1.07s** | ok       |
| C9  | ok       | ok       | ok       | ok                     | ok       |
| C10 | Δ64      | Δ64      | Δ64      | Δ64                    | Δ64      |

Every case is tracked with all five sources on, and every source now owns
something. Reading it column by column:

**The IO earns its place, and only it covers C3 / C4 / C6.** These are the pure
position shifts, and they are the reason the trick exists. No `ResizeObserver`
anywhere fires: in C4 not one box in the tree changes size, the row merely
redistributes its children. The RO cascade is blind to it by construction, not by
accident.

**The `− RO` column is thinner than expected: only C2.** C1 (grow) and C5 (parent
padding) survive without any `ResizeObserver` at all, because a resize is also a
movement, and the repaired IO frame catches it — in 3ms, versus the RO's 15ms.
C2 is the exception that shows what an RO is actually for: **shrinking the target
in place moves its top-left corner not at all**, so the IO frame stays aligned
and stays silent. Size-without-movement is the RO's exclusive territory, and it
is a smaller territory than the name suggests.

**C9 is covered three times over.** With the `resize` listener gone the ancestor
RO cascade picks the viewport change up in 1 frame / 17ms; with it, the gap never
reaches a frame boundary at all (`max Δ 0`). Genuine redundancy — the one case
where two sources overlap completely.

**C7 / C8 are the scroll listener's, on latency rather than outcome.** Since
bug 3 the IO does eventually recover them, so a pass/fail matrix would show all
`ok` and lose the finding. The lag is the finding: without the listener the beacon
is 80px wrong for a full second. With it, `max Δ 0` — capture-phase `scroll` fires
before the frame paints, so the gap never becomes visible. The cell reports both.

**C10 is not a bug and must not be fixed.** A beacon is defined as a **layout
anchor**: it tracks where its element is _laid out_, not where it currently
_paints_. An ancestor `transform` changes only the latter, so the follower
correctly stays on the layout position while the target slides 64px away
(`__screenshots__/all-c10.png` — that gap is the feature). This is what lets a
presentation-layer animation — a step slide, a shared-element morph — run on top
of a beacon in parallel with the follower's own spring, instead of fighting it.
It is also why `measure()` reads `offsetLeft`/`offsetTop` and `offsetWidth`/
`offsetHeight` rather than `getBoundingClientRect`: rects are transform-inclusive
and would drag the beacon along with every animation above it.

## What this says about the design

The cascade is not five redundant safety nets. It is four sources with almost
disjoint coverage plus one genuine overlap:

| source                 | exclusively covers                           |
| ---------------------- | -------------------------------------------- |
| self `ResizeObserver`  | size changes that don't move the corner (C2) |
| ancestor RO cascade    | — (C5 shared with IO, C9 with resize)        |
| `IntersectionObserver` | pure position shifts (C3, C4, C6)            |
| capture-phase `scroll` | inner scroll, at frame latency (C7, C8)      |
| window `resize`        | — (C9, shared with the RO cascade)           |

Removing any of the first three leaves a permanently wrong beacon in at least one
ordinary layout situation. That is a stronger claim than "it works", and it is
the claim worth having, because it means the next person to read this file knows
what each `observe()` call is buying.

The lesson about the _method_, though, is the one that generalises: a single
all-on run passed C1, C2, C5, C7 and C9 and would have shipped a completely dead
IntersectionObserver, one measurement bug, and one permanent-stall branch. It
took ablation to notice that a column of the matrix was doing nothing at all.

## Reproducing

```bash
pnpm --filter @monorepo/app-storybook dev          # port 6010
pnpm exec playwright install chromium              # once
node archive/2026-07-beacon-layout-observation/probe.mjs
```

Set `STORYBOOK_URL` for a non-default port. The probe drives the real
`Studies/Beacon layout observation` story through its own buttons; the only thing
it asks of the app is a handful of `data-testid` handles. By hand, open the story
and press the buttons — the trace panel is the same one the probe parses.

To see the failing side, check out the pre-fix files and let Vite hot-reload:

```bash
git checkout HEAD~1 -- apps-web/app-storybook/src/components/beacon/layout-shift.ts \
                       lab/src/components/beacon/layout-offset.ts
node archive/2026-07-beacon-layout-observation/probe.mjs
git checkout HEAD -- apps-web/app-storybook/src/components/beacon/layout-shift.ts \
                     lab/src/components/beacon/layout-offset.ts
```

Absolute latencies track the machine. The pattern of which cells are red does
not, and that is what the conclusions rest on.
