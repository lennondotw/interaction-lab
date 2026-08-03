# How close can `corner-shape` get to Apple's continuous corner?

**Date:** 2026-08 · **Outcome:** within **0.003r** at `superellipse(1.3844)` with the
radius scaled 1.2408 — 0.074px at `r = 24`, invisible at any DPR. Good enough to be
`ContinuousCorner`'s first-paint baseline, but **only below the clamp**, because
`corner-shape` still cannot degrade · **Applies to:** `ContinuousCorner` as of
2026-08, Chrome 139+

## The question

`ContinuousCorner` has to measure its box before it can emit a path, so its first
paint has no corner. `corner-shape` needs no measurement at all. If the two are
visually indistinguishable, `corner-shape` can hold the first frame and the upgrade
to the exact path is imperceptible; if they are not, the upgrade is a visible pop
and leaving the first frame square is more honest.

This also asks a larger question backwards: if `corner-shape` is that close, most
callers do not need the SVG machinery at all.

## Method

Both sides are closed form, so no browser is needed for the fit.
`archive/2026-08-swiftui-corner-shapes` established Apple's curve exactly from its
control points and confirmed that Chrome's `superellipse(k)` is
`|x|ⁿ + |y|ⁿ = 1` with `n = 2ᵏ`.

**Two parameters are fitted, not one.** A superellipse is confined to the `r × r`
corner box while Apple's reaches `1.528665r`, so comparing them at the same nominal
radius compares nothing — the CSS radius has to be free to scale. What is minimised
is the symmetric **Hausdorff distance between the two outlines, straight edges
included**, which is what makes "leaves the edge at the wrong place" count as error
instead of being silently ignored.

## Result

| fit                                   |    `k` | radius scale |  deviation |
| ------------------------------------- | -----: | -----------: | ---------: |
| **best over both**                    | 1.3844 |       1.2408 | **0.003r** |
| `k` pinned to the folkloric 1.6       |    1.6 |       1.4070 |     0.006r |
| `k` = 1.6, depth-matched compensation |    1.6 |       1.4330 |     0.011r |
| `k` = 1.6, no compensation            |    1.6 |       1.0000 |     0.123r |

Two things worth noticing. The best `k` is **1.3844**, not the 1.6 everyone quotes —
`n = 2.61` rather than 3.03. And the best radius scale is **1.2408**, not the
1.4330 that matches corner _depth_: matching the whole curve and matching its apex
are different objectives, and the whole curve is the one that matters visually.

In pixels, at the best fit:

| apple radius | css radius | max deviation | visible at 2× DPR |
| -----------: | ---------: | ------------: | ----------------- |
|          8px |      9.9px |       0.025px | no                |
|         16px |     19.9px |       0.049px | no                |
|         24px |     29.8px |       0.074px | no                |
|         32px |     39.7px |       0.098px | no                |
|         64px |     79.4px |       0.197px | no                |

Sub-tenth-of-a-pixel across every radius anyone ships. Even the naive-but-corrected
`(1.6, 1.4330)` is 0.26px at `r = 24`.

The residual is not concentrated at the join — it peaks on the diagonal, at the
corner's apex, and falls to zero along both edges. That is the best possible shape
for an error to have: it is where the eye has no reference to compare against.

## Where the fit actually breaks — added 2026-08-03

The crossover at `ρ = 0.654166` is where Apple _starts_ flattening, and it was easy to
read the conclusion below as "the fit is unusable above it". It is not: measured by a
third instrument — the SDF tracer's `ContinuousCorner` story, whose contour is walked
out of a p-norm field rather than evaluated in closed form — the fit holds for another
fifth of the range and then falls off a cliff.

On a 300 × 180 box, one-sided max deviation of the traced contour from
`squircleCorners`' own geometry, over the nominal radius:

|   `ρ` | deviation |                                                 |
| ----: | --------: | ----------------------------------------------- |
| 0.656 |   0.0031r | the crossover — indistinguishable from below it |
| 0.722 |   0.0032r |                                                 |
| 0.800 |   0.0039r | still a quarter-pixel at `r = 72`               |
| 0.833 |   0.0166r | **4× worse, for a 0.03 step in `ρ`**            |
| 0.867 |   0.0319r |                                                 |
| 0.911 |   0.0504r |                                                 |
| 0.956 |   0.0672r |                                                 |
| 1.000 |   0.0826r | fully saturated                                 |

So the band that genuinely needs the generated path is `ρ > 0.8`, not `ρ > 0.654`, and the
crossover is a warning rather than a verdict. The knee sits between 0.80 and 0.83 and is
sharp enough that there is no useful middle ground to interpolate through — which also
means a caller cannot buy much by easing between the two modes.

Two caveats on comparing these numbers with the ones above. This is a _one-sided_ distance
from a traced polyline, where the fit used the symmetric Hausdorff distance between two
closed forms, so the 0.0826r at saturation is not the same measurement as the 12.5% quoted
below and the two should not be differenced.

And the tracer contributes its own error, so it was bounded before the table was trusted —
at `r = 36`, sweeping the cell size:

| cell | deviation | vertices | field evals |
| ---: | --------: | -------: | ----------: |
|    1 |   0.0031r |      956 |       8,505 |
|    2 |   0.0031r |      476 |       3,737 |
|    4 |   0.0031r |      240 |       1,901 |
|    8 |   0.0051r |      120 |         885 |

Identical from 4 down to 1 — the residual is the family's, not the sampler's — and only
`cell = 8` starts adding its own. Every row in the `ρ` table was taken at `cell = 1`.

## Cross-checked in Chrome, and a metric trap on the way

Measured against the shipped generator's real `clip-path` by hit-testing rays from
the corner vertex, the depth-matched fit reads **0.59px at r = 60 (0.0098r)** against
the predicted 0.01086r. They agree.

Getting there needed two corrections, both the same mistake in different clothes —
**a distance is only as good as the angle it is measured at**:

- **Vertical scan, discarded.** Sampling `y(x)` and differencing reported _30px_ of
  disagreement at `x = 0`. But near the edge the boundary is nearly vertical, so a
  vanishing perpendicular gap shows up as an enormous vertical one. Both curves hug
  `x = 0` there; nothing is visually apart.
- **Radial from the vertex, used with care.** Rays cross the corner curve steeply,
  but only near 45° is a radial distance close to a perpendicular one. The best-fit
  case peaks at 10° for exactly this reason, which inflates it; the depth-matched
  case peaks at 50°, where the metric is honest — which is why that is the row worth
  comparing against the closed form.

This is the third time in this series that hit-testing has been the wrong instrument
where a boundary is met obliquely. The rule that keeps holding: **measure a boundary
where it is crossed steeply, or read the geometry instead of probing it.**

## What was decided

**`corner-shape` is good enough — below the clamp.** At `(1.3844, ×1.2408)` the
difference from Apple is 0.003r, so as a first-paint baseline the upgrade to the
exact path cannot be seen.

**But it is not good enough at the clamp, and that is unfixable.** `corner-shape` has
no edge budget to run out of, so it never degrades: past 65.42% of half the short
side Apple flattens onto a circular arc while the superellipse keeps bulging, and at
`50%` the gap is **12.5%** of the radius rather than 0.3%. A pill or a circle held by
a `corner-shape` baseline would pop _visibly_ when the real path arrived — worse than
starting square.

Which leaves the useful shape of the answer:

- **Below the clamp**, `corner-shape: superellipse(1.3844)` with `radius × 1.2408`
  is Apple's corner for all practical purposes — no measurement, no extra DOM, no
  resize cost, and it composes with `border`, `box-shadow`, `outline` and `overflow`
  for free.
- **At the clamp**, plain `border-radius` with no `corner-shape` is _already exactly
  right_, because Apple's curve there **is** the arc.
- Only the band between them needs the generated path.

So a CSS-only baseline can cover both ends of the range, and the component's
measured path is what covers the transition — which is also the regime where it is
the only thing that works.

## Reproducing

```bash
node archive/2026-08-corner-shape-vs-apple/probe.mjs
```

No dependencies. Takes about 100s: the fit is a coarse-to-fine sweep over `k` and
the radius scale, and every candidate costs a full Hausdorff pass over two
900-point outlines.
