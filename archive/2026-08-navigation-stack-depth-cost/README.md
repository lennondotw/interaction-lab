# 2026-08-navigation-stack-depth-cost

**Question.** `navigation-stack` keeps every view on the stack mounted, so going back does not
remount, refetch or re-scroll the view underneath. What does that cost as a stack gets deeper,
and where does it stop being free?

**Answer.** The animation never gets more expensive — it is O(1) in depth, because only two
elements ever move. What grows is the **one frame that contains the commit**: `NavigationContent`
maps over every entry on every navigation, so a push re-renders all N mounted views. Measured at
**~1.0ms per level of depth** for a 53-node view and **~0.5ms** for a 21-node one, on top of a
~5–11ms floor. At a realistic view weight that crosses a 60fps frame at **depth 8**, and the
symptom is a single hitch as the transition starts, with everything after it clean. Nodes grow
exactly linearly and never come back: 53.0 nodes per view at every depth measured, 1696 of them
at depth 32.

Two full runs, which is worth stating because only some of this is stable: the slopes reproduce
(0.50 then 0.46, 1.04 then 1.01) and `nodes/view` is identical to the decimal, while the floor
moves by a couple of milliseconds between runs. The slope is the finding; the intercept is the
machine.

## The measurement

`probe.mjs` drives the real stories, because the question is about what our component does rather
than what the platform does. Two of them, for two content weights: `RevisitedView` (three rows,
the lightest a view gets, and the only story that can be pushed to arbitrary depth) and
`WithTabBar` (twelve rows and a paragraph). The tab story's other two tabs sit at depth 1 and
have their own providers, so they never re-render when this one navigates — constant overhead
rather than a confound.

Each depth is measured by push, measure, pop, five times, reported as a median. That is not
ceremony: a first exploratory pass with single samples reported a worst frame of 28ms at depth 8
and 8ms at depth 24, which is noise, and would have supported any conclusion asked of it.

Two numbers per navigation:

- **toDom** — click to the first DOM mutation inside the stack. Scheduling, render, commit.
  Deliberately not measured by timing `click()` itself: React flushes a discrete update _after_
  the event returns, so that window contains only the dispatch and reads ~0 at every depth. The
  first version of this probe did exactly that and had to be thrown away.
- **worst** — the longest frame between the click and the spring settling. The one a user feels.

| depth | nodes | nodes/view | toDom ms | worst ms |     | nodes | nodes/view | toDom ms | worst ms |
| ----: | ----: | ---------: | -------: | -------: | --- | ----: | ---------: | -------: | -------: |
|     1 |    21 |       21.0 |     4.20 |     9.30 |     |    53 |       53.0 |     9.00 |     9.10 |
|     2 |    42 |       21.0 |     6.70 |     9.20 |     |   106 |       53.0 |     9.60 |     9.20 |
|     4 |    84 |       21.0 |     4.80 |     9.30 |     |   212 |       53.0 |    11.50 |     9.30 |
|     8 |   168 |       21.0 |     8.00 |     9.30 |     |   424 |       53.0 |    15.40 |     9.30 |
|    16 |   336 |       21.0 |    12.00 |     9.20 |     |   848 |       53.0 |    25.20 |    25.00 |
|    32 |   672 |       21.0 |    19.70 |    16.60 |     |  1696 |       53.0 |    41.30 |    41.60 |

Left half `RevisitedView`, right half `WithTabBar`. Chromium at 1x, five pushes per depth, median.
Absolute milliseconds track this machine; the linearity and the ratio between the two weights are
what the reading rests on.

## Three readings

**Nothing is ever released.** `nodes/view` is 21.0 and 53.0 at _every_ depth — not approximately,
exactly. That is the design working as written, and it is also the whole cost: at depth 32 the
heavier stack is carrying 1696 elements, 1643 of which are parked behind `visibility: hidden` and
`inert` and cannot be seen or reached.

**The commit is linear in depth, and its slope is content weight.** ~0.5ms per level at 21
nodes/view against ~1.0ms at 53 — roughly a millisecond per level per fifty nodes. Fitting the
heavier case, `9.0 + 1.04d`, puts a 16.7ms frame at **depth 8**, which the table agrees with:
15.4ms measured at 8, 25.2ms at 16. The second run landed on 16.7ms at depth 8 exactly.

**The slow frame is the commit, not the animation.** `worst` is pinned at ~9.3ms through depth 8
in both cases while `toDom` has already tripled — the transition itself does not care how deep the
stack is, because only the arriving view and the one it covers ever animate. Then at depth 16 and
32 of the heavier case `worst` and `toDom` converge (25.0 against 25.2, 41.6 against 41.3): past
one frame, the commit _is_ the longest frame. So the symptom is one hitch at the start of a
transition and nothing after it — which is the good failure mode, and also the one that is easy to
misdiagnose as the spring being wrong.

## What this decides

**`keep` stays the default.** A stack five deep with ordinary views costs ~11ms of commit and a
flat 9ms worst frame; there is nothing here to fix, and everything to lose — scroll offsets,
uncontrolled inputs, in-flight work, the instant back.

**`whenCovered: 'unmount'` has a real payoff, and it is the right shape for this cost.** A covered
view that renders `null` is not reconciled, so unmounting removes both halves at once: the nodes
stop accumulating and the per-navigation render stops growing. With every covered view unmounting,
cost is constant in depth rather than bounded by a number someone has to choose — which is why
this measurement did _not_ end up arguing for a separate "keep the nearest N" knob, despite the
problem being depth-shaped. The per-view switch already covers it.

**Where it matters: deep stacks of heavy views.** Past depth ~8 at 50 nodes a view, or ~25 at 20.
A file browser or a settings tree can reach that; a two-level detail flow cannot.

## Open

- Nodes, not bytes. Retained heap was not measured, and 1643 parked elements will cost more than
  their node count suggests once views hold images or canvases.
- `toDom` includes React's scheduling, which is not separated from render or commit. The slope is
  the useful part and scheduling is not depth-dependent, but the intercept is not all render.
- Every measured push starts from a settled stack. Pushing again mid-transition is the case where
  a leaving view, an arriving view and a parking view are all live at once, and it is unmeasured.
- One machine, Chromium, 1x. A 3x device paints more, and the commit is CPU-bound where the
  animation is not, so the crossover moves with the CPU rather than with the display.
