# What does one α mean to a glass surface?

**Date:** 2026-08 · **Status:** measured, shipped in `Demos/Glass fade` · **Applies to:** Chromium
at 2× device pixels

A frosted surface is two ramps that both start at nothing: a blur radius and a tint alpha.
Driving both from one linear α is the obvious thing and it feels wrong — almost all of the
change arrives in the first fraction of the ramp. The question is whether that is the eye
responding to the material or a mistake in the driving.

It is the material, and only half of it. The tint is already perceptually even; the radius is
not, and is not fixable by an exponent. Two further things fell out of measuring it: the radius
is **quantised** by the compositor, and past about 4px it stops doing anything the eye can see.

## Measured

`perceived` is the fraction of the backdrop's multi-scale detail energy a material has removed —
octave-spaced neighbour differences from 2 to 64 device px, equally weighted, inside the panel
and clear of its edge. A blur is a low-pass filter, so this is what it destroys, and it stands in
for "can you still read what is behind the glass". `share` normalises it against the
full-strength material.

| radius |    share |     | tint α | share |
| -----: | -------: | --- | -----: | ----: |
|    1px | **0.71** |     |  0.018 |  0.11 |
|    2px |     0.87 |     |  0.054 |  0.32 |
|    4px |     0.95 |     |  0.090 |  0.51 |
|    8px |     1.00 |     |  0.144 |  0.80 |
|   20px |     1.00 |     |  0.180 |  1.00 |

The tint is linear to within a rounding error — veiling removes backdrop contrast in proportion
to (1 − α), so detail loss already _is_ linear in α. Nothing to correct, and its fitted exponent
comes back as 1.00 with a spread of 0.15.

The radius is logarithmic. **One pixel of blur delivers 71% of everything the axis will ever
deliver**, and 8px delivers all of it. Fitting `radius = R·αᵏ` to even that out gives no stable
answer — γ ranges over 16 depending on which part of the curve is fitted — because a power law
cannot invert a log:

| γ   | perceived at α = ⅛ … 1          | mean error vs an even ramp |
| --- | ------------------------------- | -------------------------- |
| 1   | .89 .97 1.0 1.0 1.0 1.0 1.0 1.0 | 0.422                      |
| 2   | .22 .75 .91 .97 1.0 1.0 1.0 1.0 | **0.295**                  |
| 3   | .03 .22 .72 .89 .97 1.0 1.0 1.0 | 0.199                      |
| 4   | .00 .06 .28 .75 .92 .99 1.0 1.0 | 0.165                      |

γ = 4 measures best and is not shippable: 0.3⁴ of 20px is 0.16px, so the first third of the ramp
is a dead zone you can watch. γ = 2 is about 1.4× more even than linear with nothing dead, which
is why it is the default and why the exponent is a slider rather than a constant.

### The radius steps, and how much depends on the device pixel ratio

Holding position fixed and restyling one element in 0.02px steps, the detail sum only moves every
second or third step — every 0.26px around radius 9, 0.54px around 18, and the move costs 2–3% of
detail down at 4px against 0.3% at 18px. It is tempting to read that as the compositor quantising
the radius, and phase B's numbers alone cannot tell you whether it is.

They are not enough, because the metric's floor is 0.05% of a sum over half a million pixels.
Phase D asks the question a slider actually poses — does _this_ 1% tick change any pixels at all —
and the answer depends on the device pixel ratio:

| tick, γ = 2 | radius        |     1× |  2× |  3× |
| ----------- | ------------- | -----: | --: | --: |
| 0.88 → 0.89 | 15.49 → 15.84 |    61% | 60% | 48% |
| 0.89 → 0.90 | 15.84 → 16.20 | **0%** | 37% | 49% |
| 0.93 → 0.94 | 17.30 → 17.67 | **0%** | 47% | 48% |
| 0.94 → 0.95 | 17.67 → 18.05 |    62% | 60% | 51% |
| 0.96 → 0.97 | 18.43 → 18.82 | **0%** | 60% | 52% |

At **1×** roughly every third tick comes back _pixel-identical_, and the rest move 38–62% of the
pixels. At 2× and 3× nothing is identical. So the axis is genuinely quantised, but finely enough
that more device pixels dissolve it — and a dead tick sitting beside a live one is what reads as a
jump. `0.94 → 0.95` is a live tick between two dead ones at 1×, which is exactly the report that
started this.

Two things follow. Per-tick amplitude is small either way — 1 to 3 luma out of 255 — so what is
noticeable is the _pattern_ (stall, stall, move) rather than the size of any one move. And the
mapping decides where the pattern lands: with γ = 2 one tick moves the radius by 0.4·α px, so the
high end takes strides comparable to a tread while the low end takes many ticks to cross one. γ
trades a dead low end for a steppy high end.

Also visible in the first table: `share` peaks slightly above 1 around 12px and comes back down.
Past ~10px the blur is pulling in clamped content from outside the panel faster than it is
smoothing what is inside, so more radius returns a little detail. Another way of saying that most
of a 20px design is spent where the eye cannot see it change.

### Retracted

An earlier version of phase B laid one stage per radius down a 6000px page and reported a clean
**−7.5% cliff at radius 9**, with a flat plateau before it. It does not survive re-measuring the
same element in place. Every sample in that layout sat at a different y, so anything
position-dependent in how Chromium rasterises a backdrop-filter was being attributed to the
radius. The number was real; the cause was not the one claimed. Phase B holds position fixed for
this reason, and it is why the probe restyles one element rather than building a column.

## Layers, and their order

Three of them, and the order does not commute:

```text
gesture → ease → α → mapping → axis value → composite
```

The ease decides _when_ α arrives; the mapping decides _how much material_ being there means.
Phase C drives the shipped stories through their args and checks all 29 rows of
mode × α × mapping × γ against that model, then samples α per frame:

| timing                   | α at 100ms | α at 200ms | radius = 20·α² every frame |
| ------------------------ | ---------: | ---------: | -------------------------- |
| linear                   |       0.23 |       0.48 | yes                        |
| decelerate `(0,0,0.2,1)` |   **0.55** |       0.83 | yes                        |

**A CSS `transition` cannot express the mapping layer.** A transition interpolates each
property's endpoint values and never evaluates the α between them — and 0 and 1 map to 0 and 1
under any mapping, so a transition-driven toggle silently ignores it. That is the whole reason
the interactive stories drive α per frame instead, at the cost of a render per frame.

Two easing notes, both measured rather than assumed. The stock `cubic-bezier(0.4, 0, 0.2, 1)` is
**not** an ease-out: α is still 0 after two frames and only reaches 0.35 by halfway, so it delays
the start — which stacks with the mapping's slow low end into a visible nothing. The demo uses
`(0, 0, 0.2, 1)` instead, at full speed from the first frame, which is why α is past half by
100ms above.

## Decided

- Map the radius, leave the tint and the content alone. `PERCEPTUAL_EXPONENT = { blur: 2,
content: 1, tint: 1 }` in `lab/src/demos/glass-fade/glass-fade.tsx`.
- Keep γ a control. The metric's optimum and the shippable value disagree, and no measurement
  settles that.
- Keep the mapping out of the sliders. They read α; only the material is mapped, so a value is
  comparable across mappings.
- Drive α per frame for gestures, and pair the mapping with a _decelerating_ ease, not an S.
- Do not chase the staircase. It is the compositor's, it dissolves above 1×, and the only way to
  hide it at 1× would be to stop moving the radius at all.

## Caveats

Chromium only, at 2× device pixels, over this backdrop. Quantisation treads and their magnitudes
are implementation detail and should be expected to move between versions and engines; the
shapes — tint linear, radius logarithmic, radius finely quantised — are what the decisions rest
on. Anything phrased as "this tick changes nothing" is a claim about pixels and needs a pixel
diff: the detail-energy metric of phase A and B has a floor, and reading its zeros as identical
frames is how the first pass here overstated the treads.
`perceived` is a detail-energy proxy, not a psychophysical measurement: it says how much
structure a blur removed, which is not the same as how frosted a person would call it. Where the
two might disagree, the probe reports the curve rather than a single number, so a reader can
disagree with the weighting and refit.
