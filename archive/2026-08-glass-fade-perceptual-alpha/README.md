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

### The radius is quantised

One element, restyled in 0.02px steps, holding position fixed. Most steps change **nothing at
all**; every second or third step changes something:

| radius    | changes at       | period | magnitude    |
| --------- | ---------------- | ------ | ------------ |
| 3.6–4.3   | 3.86, 4.14       | 0.28px | **2.2–3.3%** |
| 8.6–9.3   | 8.66, 8.92, 9.18 | 0.26px | 0.3–0.4%     |
| 17.9–18.6 | 17.96, 18.50     | 0.54px | 0.3%         |

So the axis is a staircase, the tread roughly doubles with the radius, and each step _costs_ less
as the radius grows. Which explains a scrub that jumps at specific α rather than moving smoothly,
and where it jumps: with γ = 2, one 0.01 tick of α moves the radius by 0.4·α px, so near α = 1 a
tick crosses a whole tread while near α = 0 many ticks fall inside one. **The mapping makes the
high end coarse in radius terms** — γ trades a dead low end for a steppy high end.

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
- Do not chase the staircase. It is the compositor's, its worst tread costs ~3% of detail down at
  4px, and the only way to hide it would be to stop moving the radius at all.

## Caveats

Chromium only, at 2× device pixels, over this backdrop. Quantisation treads and their magnitudes
are implementation detail and should be expected to move between versions and engines; the
shapes — tint linear, radius logarithmic, radius quantised — are what the decisions rest on.
`perceived` is a detail-energy proxy, not a psychophysical measurement: it says how much
structure a blur removed, which is not the same as how frosted a person would call it. Where the
two might disagree, the probe reports the curve rather than a single number, so a reader can
disagree with the weighting and refit.
