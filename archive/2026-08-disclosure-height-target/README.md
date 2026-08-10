# 2026-08 — what should a disclosure animation own?

`FileTree` animated its disclosure as `height: 0 → auto`. Open a folder, then open a
folder inside it 150ms later, and everything below the subtree stalled for ~110ms and
then jumped 152px in a single frame.

The question is not how to patch that. It is which quantity a disclosure animation
should hold at all, given that the thing it is disclosing can change size while the
animation is still running.

## Why `auto` is stale by construction

Motion resolves `auto` by measuring. `DOMKeyframesResolver.measureInitialState()` reads
the current box as the origin and jumps the element to the target keyframe;
`measureEndState()` measures the box _while it is at `auto`_, writes that pixel number
in as the final keyframe, and stashes the original `'auto'` in `this.finalKeyframe`.
From then on the animation is a plain number-to-number spring, and nothing re-measures
— there is no mechanism to invalidate a resolved keyframe when the content changes.

`JSAnimation`'s tick then does, on the frame it finishes:

```js
if (isAnimationFinished && type !== inertia) {
  state.value = getFinalKeyframe(keyframes, this.options, finalKeyframe, this.speed);
}
```

`getFinalKeyframe` returns `finalKeyframe` — the string `auto` — rather than the
numeric last keyframe. That is a feature: it leaves an open disclosure on `auto`, so
content that grows afterwards is followed for free. It is also the exact line that
produces the discontinuity when the content grew _during_ the flight, and the step is
precisely the amount it grew by.

So `height: auto` is two different things at two different times: a frozen number
while animating, and genuinely `auto` only after. Everything that looked like a
benefit of `auto` holds for the second half only.

## Four candidates

| mode         | animates                          | target is                                         |
| ------------ | --------------------------------- | ------------------------------------------------- |
| `length`     | `height: 0 → auto`                | a pixel number, resolved once                     |
| `ratio`      | `grid-template-rows: 0fr → 1fr`   | dimensionless; layout resolves it                 |
| `arithmetic` | `height: 0 → count × pitch`       | a pixel number, recomputed each render            |
| `observed`   | `height: 0 → measured`, re-issued | a pixel number, re-measured by a `ResizeObserver` |

The reparameterisation is the whole idea. `height = contentHeight + delta` with `delta`
animating `−contentHeight → 0` needs a measurement, because `delta`'s _range_ is a
length. `height = f × contentHeight` with `f` animating `0 → 1` needs none, because `f`
is dimensionless. CSS gives you "a fraction of my content box" for free and does not
give you "my content box minus N pixels" — the one construction that subtracts from a
live content box, a negative bottom margin inside a BFC, still needs the number, and
`-100%` resolves against the _inline_ axis, not the block one.

## Numbers

Every row below is `probe.mjs` output. Absolute timings track the machine; the
differences between rows are what the decision rests on.

**Is "a fraction of my own content height" expressible, and live?** Content 156px, then
the same box at 312px, then holding `f = 0.5` and growing the content underneath it:

```text
mechanism        f=0  f=.25  f=.5  f=.75  f=1  live 0.5f, 156->312
grid fr (156)    0    39     78    117    156  78 -> 156
grid fr (312)    0    78     156   234    312
calc-size (156)  0    39     78    117    156  78 -> 156
```

Exactly proportional, and live in both. `interpolate-size: allow-keywords` and
`calc-size()` are Chrome-only at the time of writing, which is why the shipped answer
is the grid track. Note that we never rely on CSS _interpolating_ `0fr → 1fr` — Motion
writes discrete fractions every frame — so the support floor for this use is lower than
the floor usually quoted for the trick.

**The four candidates, nested expand interrupted at 150ms, three warm runs:**

```text
mode        step 1   step 2   step 3   stall  settled  moved
length      151.2px  149.7px  151.7px  117ms  402ms    312px
ratio       19.9px   18.3px   18.8px   50ms   402ms    312px
arithmetic  19.9px   18.4px   18.8px   50ms   402ms    312px
observed    19.9px   17.9px   18.8px   41ms   644ms    312px
```

**The component after the switch:**

```text
step    stall  settled  moved  track ends on  distinct row pitches
18.2px  49ms   400ms    312px  1fr            52
```

## What the numbers say

`length` is the only one with a cliff, and it is 8× the others. Its 117ms stall is the
parent pinned at a target that no longer described its content.

`ratio` and `arithmetic` are indistinguishable — within 0.3px of each other on every
run, and they settle at the same time. Either fixes the bug.

`observed` avoids the cliff and still costs something: it settles 240ms later, and its
per-frame deltas ripple rather than decaying monotonically (10 direction reversals
against 7 for `arithmetic`). Two separate causes, and only one is fixable:

- **Inherent.** It re-targets to the child's _current_ height, so it chases a target
  that is itself converging. A spring following a decaying ramp lags one aimed at the
  final value. A `ResizeObserver` cannot know the end state — which is exactly the
  information `arithmetic` has and measurement does not.
- **Not inherent.** Every observer delivery re-issues `animate()`, and each new
  animation takes its initial velocity from `value.getVelocity()`. That returns **0**
  when more than `MAX_VELOCITY_DELTA` (30ms) has passed since the last write, and
  otherwise divides by a delta that depends on where in the frame the callback landed
  — and observer callbacks run outside Motion's frame loop. So each re-issue can launch
  with the wrong initial velocity, and a critically damped spring launched wrong leaves
  a kink. Deduping the re-target with an epsilon smooths it at the cost of tracking
  accuracy.

Facing that trade directly — track tightly and accept the ripple, or smooth it and lag
further — the preference recorded here is the former. It does not affect the shipped
answer, which needs neither.

## Decided

`ratio`. It fixes the bug the same as `arithmetic` and beats it on two counts: no fixed
pitch invariant, and no duplicate of the row height between CSS and JS. It beats
`observed` on three: no observer, no forced layout to obtain a target, and no
feedback-loop hazard. And unlike all three of the others it never resolves a length at
all, so `needsMeasurement` stays false, `measureEndState` never runs, `finalKeyframe`
stays undefined, and the `auto → number → auto` round trip that produces the step does
not exist to be worked around.

`min-h-0 overflow-hidden` on the inner child is load-bearing, not hygiene: it is what
makes the grid track's base size zero. Without it the track cannot shrink below the
content's min-content contribution and the collapse stops part-way.

## Not fixed

The ~50ms stall every mode shares. That is the frame the second expand costs in
mounting and painting the newly revealed rows — React's commit is 3ms of it; the rest
is layout, paint, and (for the three measuring modes) Motion's own four-pass
`resolveKeyframes` batch. Springs are time-driven, so a long frame applies its whole
elapsed travel in one paint whatever the target is.

Two measurement lessons worth keeping:

- **A sampler that costs layout measures itself.** The first attempt read four
  `getBoundingClientRect()`s and a `scrollHeight` per frame and dropped the loop to
  ~10fps, which pushed keyframe resolution past the second expand and made `length`'s
  target come out _correct_. The artefact disappeared because the instrument caused a
  different one.
- **`step` alone cannot tell a cliff from a dropped frame.** A 107px step with `6.8px`
  either side of it is a long frame; a 150px step with a run of `0.0px` before it is a
  discontinuity. The plotted shape distinguishes them; the scalar does not.
