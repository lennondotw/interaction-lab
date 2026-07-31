# Why a smoothed corner reads smaller, and why it can never be a circle

**Date:** 2026-07 · **Outcome:** the compensation is 1.4334, derived from the
exponent rather than written down — and corner smoothing is mutually exclusive
with circles and pills, by definition rather than by omission ·
**Applies to:** `RoundedOutlinedContainer` as of 2026-07, Chrome 139+

## The symptom

Two complaints about the same prop.

Turn on `cornerSmoothing` and the corner visibly shrinks. The component
compensates with a hard-coded `radius * 1.5` carried over from `opal-ui`'s
`OpalGlass`, with no derivation attached — a magic number covering a real effect
nobody had written down.

And no value of `radius` ever produces a circle. `50%` on a square gives a
rounded blob; a pill's `9999px` gives a rounded rectangle. The unsmoothed
versions of both are exact.

## What `k` actually is

`corner-shape: superellipse(k)` draws `|x/r|ⁿ + |y/r|ⁿ = 1`, and `k` is not `n` —
it is its base-2 log, `n = 2ᵏ`. Reverse-solving `n` from the rendered geometry
confirms it (`r = 300px`):

| `corner-shape`      | computed            |    depth | implied `n` |  `2ᵏ` |
| ------------------- | ------------------- | -------: | ----------: | ----: |
| `round`             | `round`             | 122.86px |       2.027 |     — |
| `superellipse(0)`   | **`bevel`**         | 210.74px |       1.010 |     1 |
| `superellipse(0.5)` | `superellipse(0.5)` | 162.99px |       1.430 | 1.414 |
| `superellipse(1)`   | **`round`**         | 122.86px |       2.027 |     2 |
| `superellipse(1.6)` | `superellipse(1.6)` |  85.32px |       3.087 | 3.031 |
| `superellipse(2)`   | **`squircle`**      |  66.09px |       4.093 |     4 |
| `superellipse(3)`   | `superellipse(3)`   |  33.81px |       8.347 |     8 |

The canonicalised keywords in bold are the giveaway. A circular arc is not the
absence of a superellipse — it is the `n = 2` member of the family, and every
named corner keyword is an alias for a point on the `k` axis:

| keyword    |  `k` |   `n` |
| ---------- | ---: | ----: |
| `notch`    | `-∞` | `→ 0` |
| `scoop`    | `-1` | `0.5` |
| `bevel`    |  `0` |   `1` |
| `round`    |  `1` |   `2` |
| `squircle` |  `2` |   `4` |
| `square`   | `+∞` | `→ ∞` |

Which side of that equivalence gets serialised is version-dependent, so do not
read meaning into the literal computed value: the Chromium Playwright pins here
canonicalises `superellipse(0)` to `bevel`, while Chrome 152 goes the other way
and reports `superellipse(0)` for a specified `bevel`. Convert to `k` before
comparing.

## Why the corner shrinks

The curve is confined to the same `r × r` corner box whatever `n` is. Setting
`x = y` in `|1 − x/r|ⁿ + |1 − y/r|ⁿ = 1` puts its apex at `r·(1 − 2^(−1/n))` on
each axis, so the distance from the sharp corner in to the curve is

```
d = √2 · r · (1 − 2^(−1/n))
```

| shape                          | measured `d/r` | closed form |
| ------------------------------ | -------------: | ----------: |
| `round` (`n = 2`)              |         0.4095 |      0.4142 |
| `superellipse(1.6)` (`n≈3.03`) |         0.2844 |      0.2891 |

A higher exponent cannot spread along the edges, so it hugs the sharp corner
instead: only 0.284r is bitten out where the arc takes 0.414r. The footprint is
identical and the visual corner is 30% shallower, which is exactly what "the
corner got smaller" is.

So the compensation is the ratio of the two depths — the `√2` is common to every
`n` and cancels:

```
scale = (1 − 2^(−1/2)) / (1 − 2^(−1/2ᵏ))
```

|                          |      value |                                   |
| ------------------------ | ---------: | --------------------------------- |
| measured                 |       1.44 | hit-testing, ~1% instrument error |
| **closed form**          | **1.4334** | what the component now derives    |
| inherited from `opal-ui` |        1.5 | overshoots by 4.7%                |

1.5 is suspiciously close to 1.528, the edge extension of Apple's continuous
corner — plausibly where it came from, but that is the answer to a different
question (see below), not to this one.

### How this differs from iOS and Figma

Both are after the same thing: a circular arc meets a straight edge with
curvature jumping from 0 to 1/r, and that discontinuity is what reads as a cheap
corner. A superellipse with `n > 2` has zero curvature at the join, so it is
curvature-continuous too. The goal is shared; **where the smoothness is paid for
is not.**

|               | CSS `superellipse`                   | iOS `.continuous` / Figma smoothing                       |
| ------------- | ------------------------------------ | --------------------------------------------------------- |
| construction  | one closed-form algebraic curve      | piecewise: Bézier easing + a circular arc + Bézier easing |
| extent        | locked inside the `r × r` corner box | spreads _along the straight edges_, past `r`              |
| cost          | pushes the curve at the corner       | consumes edge length                                      |
| apparent size | **shrinks** — needs compensation     | roughly preserved — needs none                            |
| degenerate at | large `r` → squircle                 | short edges → smoothing has to be clamped                 |

Apple's corner reaches about `1.528r` along each edge (reverse-engineered by
others, not measured here) and is not a superellipse at all, so no single `k`
reproduces it; `1.6` is a fit, not an equivalence. Superellipse buys a wider
space in exchange — bevels and concave scoops are one parameter away, and are
not expressible in Figma's 0–100% smoothing at all.

This table is the whole answer to both symptoms. Compensation exists because CSS
chose the corner-box-confined construction; the circle is impossible for the
same reason.

## Why a circle is impossible

At `border-radius: 50%` there is no straight edge left anywhere on the box, so
the entire outline _is_ the corner curve — and a superellipse of exponent `n ≠ 2`
is not a circle. Radial distance from the centre of a 600px square:

| `corner-shape`      |  0° |   15° |    30° |    45° |    60° |   75° | 90° | bulge     |
| ------------------- | --: | ----: | -----: | -----: | -----: | ----: | --: | --------- |
| `round`             | 300 |   300 | 300.01 | 300.01 | 300.01 |   300 | 300 | **0%**    |
| `superellipse(1.6)` | 300 | 308.5 | 327.32 | 337.56 | 327.32 | 308.5 | 300 | **12.5%** |

Flat across the row is a circle; the superellipse holds the nominal radius on the
axes and bulges on the diagonal by `√2 · 2^(−1/n) − 1`, which for `n ≈ 3.03` is
12.5% — matching the measurement to three digits. There is no radius that
recovers a circle. Only `k = 1` does, and `k = 1` is the arc.

The pill fails the same way, one axis at a time. `9999px` clamps to half the
height, so each end cap is a corner curve spanning the full height — measured
from the cap's own centre on a 900×400 box:

| `corner-shape`      |  180° |   195° |   210° |   225° |   240° |   255° |  270° | deviation |
| ------------------- | ----: | -----: | -----: | -----: | -----: | -----: | ----: | --------- |
| `round`             | 200.5 | 201.22 | 201.35 | 201.39 | 201.35 | 201.22 | 200.5 | **0.4%**  |
| `superellipse(1.6)` | 200.5 | 206.73 | 219.48 | 226.43 | 219.48 | 206.73 | 200.5 | **12.9%** |

A semicircular cap is constant; the superellipse cap is 13% fatter at 45°, and a
flattened cap is precisely what makes the smoothed pill read as a rounded
rectangle.

Note also that compensation is _inert_ on both shapes, for two different reasons:
`50%` is a percentage and is never scaled — which is what keeps the unsmoothed
circle exact — while `9999px` inflated by anything still clamps to the same
half-height. On a circle or a pill, smoothing can only change the shape, never
the size.

## What was decided

1. **Derive the constant.** `cornerDepth(2) / cornerDepth(2 ** CORNER_SHAPE_K)`
   rather than `1.5`, so moving `k` cannot leave a compensation behind that
   belongs to a curve no longer being drawn.
2. **Gate it behind `@supports`.** The compensation only has a reason to exist
   where the superellipse does. It was applied from JS whenever `cornerSmoothing`
   was set while the shape was applied by CSS, so a browser without
   `corner-shape` — Safari, Firefox, Chrome before 139 — dropped the shape and
   kept the inflation, drawing a plain circular corner 43% too large. The factor
   now travels as a custom property that an `@supports` variant decides whether
   to use, with a `var()` fallback of `1`, and the radius is emitted as `calc()`
   against the result. Neither can appear without the other.
3. **Keep smoothing available on the Circle and Pill stories**, documented as the
   degeneration rather than removed. They are the clearest demonstration of the
   corner-box constraint the whole component is shaped by, and hiding the knob
   would only make the limit look like a bug in the wrapper.

## Reproducing

```bash
node archive/2026-07-corner-shape-superellipse/probe.mjs
```

Needs `pnpm exec playwright install chromium` and Chrome 139+ for `corner-shape`;
the probe checks and says so. No Storybook and no component — the shapes are
plain divs, so the numbers are about CSS rather than about our wrapper.

The instrument is hit-testing: `elementFromPoint` respects `border-radius` and
`corner-shape`, so bisecting along a ray finds the painted boundary without
reading a pixel, which a screenshot-and-threshold approach cannot do without also
measuring antialiasing. It lands ~1.4px inside the true boundary, constant across
shapes, so every geometry is deliberately large — 1.13% error at `r = 300`
against 3.4% at `r = 100`. Section 1 prints the arc against its exact closed form
so that residual is visible rather than implied.
