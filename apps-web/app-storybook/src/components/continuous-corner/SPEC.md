# Apple's continuous corner — the geometry this component implements

Every number here was read off `RoundedRectangle(cornerRadius:style:.continuous)`'s
own `CGPath` control points on macOS 27 / Swift 6.2, not fitted and not
hit-tested. The probe that produces them lives in
`archive/2026-08-swiftui-corner-shapes/`, and
`__tests__/squircle-path.test.ts` golden-tests this implementation against its
output.

## Construction

Three cubic Béziers per corner. Not a superellipse, and no `k` reproduces it — see
`archive/2026-07-corner-shape-superellipse/` for why CSS `corner-shape` is a
different curve family with a different set of trade-offs.

Normalised by the radius, in a local frame with the corner vertex at the origin,
running from the vertical edge to the horizontal edge:

```text
start (0, EXTENT)
C (0, OUTER_1)            (0, OUTER_2)            -> (INNER_SHORT, INNER_LONG)
C (MIDDLE_SHORT, MIDDLE_LONG) (MIDDLE_LONG, MIDDLE_SHORT) -> (INNER_LONG, INNER_SHORT)
C (OUTER_2, 0)            (OUTER_1, 0)            -> (EXTENT, 0)
```

| constant       |    value |
| -------------- | -------: |
| `EXTENT`       | 1.528665 |
| `OUTER_1`      | 1.088490 |
| `OUTER_2`      | 0.868407 |
| `INNER_SHORT`  | 0.074911 |
| `INNER_LONG`   | 0.631494 |
| `MIDDLE_SHORT` | 0.169060 |
| `MIDDLE_LONG`  | 0.372824 |

The curve is symmetric about the corner's diagonal: the outer two segments are
mirrors of each other, and the middle one is its own mirror.

## Why the corner reaches past the radius

`EXTENT > 1` is the whole difference from a circular arc, and from CSS's
superellipse. A circular arc of radius `r` occupies exactly `r` of each edge; this
curve occupies `1.528665r`. It buys curvature continuity by **spending edge
length** rather than by cutting deeper into the corner.

That is why it needs no radius compensation. Its apex sits at `0.412253r` along the
diagonal against the arc's `0.414214r` — it gives up **0.48%** of apparent corner
size. CSS's `superellipse(1.6)` is confined to the `r × r` corner box, so it can
only bulge inward, and gives up **43.3%**, which is where
`RoundedOutlinedContainer`'s 1.4330 compensation comes from.

## Degradation

Edge length is finite, so the extent has to be capped. The rule is **per axis**,
against half of that axis's own side length — and it is what makes circles and
pills come out correct instead of merely close.

Let `H` be half the side on the axis in question and `ρ = r / H`:

```text
CROSSOVER = 1 / EXTENT = 0.654166

rho <= CROSSOVER    extent = EXTENT * r
                    outer1 = OUTER_1 * r
                    outer2 = OUTER_2 * r

rho >  CROSSOVER    extent = H                                  (saturated)
                    t      = (rho - CROSSOVER) / (1 - CROSSOVER)
                    outer1 = lerp(OUTER_1 * CROSSOVER, 0.96, t) * H
                    outer2 = lerp(OUTER_2 * CROSSOVER, 0.82, t) * H
```

Three things about this are load-bearing:

- **The radius is not reduced.** Only the two outer, collinear control points move.
  The inner points and the middle segment keep scaling with `r` throughout. Apple
  keeps the radius and flattens the curve, which is the same model Figma's
  smoothing percentage uses — not "shrink the corner".
- **The two branches meet.** At `ρ = CROSSOVER` the clamped formula reproduces the
  unclamped values to 3 × 10⁻⁴, so this is one continuous curve rather than two
  regimes stitched together.
- **`0.96` and `0.82`** are the fully-saturated values, measured at `ρ = 1`. At that
  point the curve is a circular arc for practical purposes, though not exactly one —
  it undulates 0.62% with a period of 90°, which is small but measurable and
  visible. See below.

### Asymmetric corners are normal, not an edge case

Because the budget is per axis, a corner in a non-square box can be clamped on one
axis and not the other. On a 400×200 box with `r = 80` the corner reaches
`122.293` along the top edge (unclamped, `H = 200`) and `100.000` down the left
edge (saturated, `H = 100`). The corner is genuinely not diagonal-symmetric, so the
implementation cannot take the mirror shortcut. This is the regime every pill lands
in.

### At maximum radius the shape is not quite a circle

This is faithful, not a defect, and it is visible if you look for it. At `r` = half
the side on a square the outline undulates with a period of 90°, measured on a 400px
box:

| direction from the centre |  radius | vs a true circle |
| ------------------------- | ------: | ---------------: |
| 0° / 90° — edge midpoints | 200.001 |         +0.001px |
| ~21° — the minimum        | 199.158 |     **−0.833px** |
| 45° — the corner diagonal | 200.392 |     **+0.392px** |

0.62% peak to peak, 1.234px. **It bulges toward the four diagonals and pinches
between them**, which is exactly why a large one can read as very slightly squarish
or diamond-like rather than round.

It is Apple's shape, not an artefact of this port: at maximum radius every control
point here is identical to `RoundedRectangle(.continuous)`'s own, which
`__tests__/squircle-path.test.ts` asserts. So iOS draws the same undulation. That is
also the real reason SwiftUI ships `Circle()` as a separate type — measured radially
it is flat to 0.00%, where the max-radius rounded rect is not. The difference between
them is therefore **not only** the layout one (`Circle()` insets to the largest
inscribed circle instead of filling its frame); the curve differs slightly too.

If a perfect circle matters more than matching iOS, the fully-clamped case is cheap
to special-case — `border-radius: 50%` with no `corner-shape` is exactly round. This
component does not, because matching iOS is the point.

### Overlap needs no separate negotiation

Capping each corner's extent at half its edge means two corners sharing an edge can
never together exceed it. Unlike CSS's `border-radius`, no proportional scale-down
pass is required.

## Radius clamping

`r` is first clamped to `min(r, H_x, H_y)` per corner, matching
`RoundedRectangle`: a radius past half the short side has no effect, so
`cornerRadius: 10000` and `cornerRadius: height / 2` are the same shape.

## Which shape path to use

Measured in `archive/2026-08-corner-shape-vs-apple`: CSS can get much closer to this
curve than the SVG machinery suggests, so most callers do not need it.

| path                       | deviation from Apple |           at the clamp | cost                              |
| -------------------------- | -------------------: | ---------------------: | --------------------------------- |
| `mode="path"`              |                exact |                  exact | measure, regenerate, extra layers |
| `mode="css"`               |              0.0031r | **12.5% off — do not** | nothing                           |
| baseline (pre-measurement) |              0.0138r |              **exact** | nothing                           |

`css` mode is `border-radius × 1.2409` plus `corner-shape: superellipse(1.3844)`.
Both numbers are fitted; note that `k` is **not** the 1.6 usually quoted and the
scale is **not** the 1.4330 that matches corner depth — fitting a whole curve and
fitting its apex are different objectives. In that mode the border becomes an
`outline` with a negative offset, which follows `corner-shape` and gives all three
alignments for free, so there is no SVG and no measurement at all.

**So use `css` for cards, panels and buttons**, where the radius is comfortably below
65% of half the short side, and it composes with everything CSS already does.
**Use `path` for pills, circles, and anything near the clamp**, which is the one
regime where `corner-shape` is not an approximation but a different shape:
it has no edge budget to run out of, so it never degrades.

### When `corner-shape` is unsupported

`corner-shape` needs Chrome 139+; Safari and Firefox do not have it yet. `css` mode
degrades there **onto the baseline exactly** — the radius that was asked for, drawn
as a plain arc, 0.0138r from Apple.

That only holds because the radius compensation is gated by the same `@supports`
that applies the superellipse, rather than baked into the number:

```text
border-radius: calc(<r>px * var(--continuous-corner-radius-scale, 1))

@supports (corner-shape: squircle) {
  --continuous-corner-radius-scale: var(--continuous-corner-radius-compensation)
}
```

JS owns both numbers (`1.3844` and `1.2409`, written as custom properties); CSS owns
whether the compensation is used. A baked-in `× 1.2409` would draw a plain circular
arc **24% too large** wherever `corner-shape` is missing — a worse corner than not
trying at all. Gated, compensation and the thing it compensates for can only appear
together.

The `@supports` condition tests `corner-shape: squircle`, a keyword, rather than the
fitted `superellipse(1.3844)`. It is asking whether the feature exists, so it should
not have to be edited when the fitted `k` changes.

`debugSimulateNoCornerShapeSupport` pins the scale to 1 and drops the superellipse, which
reproduces what those browsers render — verified as 28px unscaled against the
supported path's 34.75px.

Verified in Chrome:

| story                       | `data-shape` |   radius | `corner-shape`         |
| --------------------------- | ------------ | -------: | ---------------------- |
| `CssMode`                   | `css`        | 34.745px | `superellipse(1.3844)` |
| `CssModeWithoutCornerShape` | `baseline`   |     28px | `round`                |
| `DebugBaseline`             | `baseline`   |     28px | `round`                |

`path` mode is unaffected — it never depends on `corner-shape` at all, so it is
exact in every browser.

### The pre-measurement baseline

Before the box is measured — first paint, SSR — the shape is a plain `border-radius`
at the radius asked for, with no `corner-shape`. That is 0.0138r below the clamp, and
0.33px at `r = 24`.

It deliberately does _not_ use the closer `corner-shape` fit, because **plain
`border-radius` is exact at the clamp**: it clamps to a true pill or circle by
itself, which is precisely where Apple's curve is the arc. So the baseline is never
the _wrong silhouette_, only a slightly less smooth corner — and it needs to know
nothing about the box to be safe, which matters because before measuring there is no
way to tell whether the radius is past the clamp. A `corner-shape` baseline would be
four times closer below the clamp and 12.5% wrong at it, and a pill popping from
squircle to arc is far more visible than a corner getting slightly smoother.

`debugForceCssBaseline` pins it there so the first frame can be looked at.

## Cost of the two sizing modes

Measured in Chrome 152 on a 144Hz display (6.9ms frame budget), via the
`ResizeStress` story and a synthetic scaling harness.

**The generator is not the bottleneck.** One path is **6.6µs** and 450 characters,
so a 16ms frame fits ~2400 of them. Twelve instances regenerating every frame is
0.08ms — about 1% of a frame.

**At component scale the two modes are indistinguishable.** Twelve observed
instances against twelve fixed, resizing every frame for three seconds:

| configuration     |   fps | p50 | p95 | long tasks |
| ----------------- | ----: | --: | --: | ---------: |
| both, 12 + 12     | 144.3 | 6.9 | 7.0 |          0 |
| observed only, 12 | 144.7 | 6.9 | 7.0 |          0 |
| fixed only, 12    | 144.3 | 6.9 | 7.0 |          0 |

**It starts to matter in the hundreds.** Isolating just the path rewrite —
`clip-path` re-written per frame versus written once — while animating width:

| instances | fixed, fps | observed, fps | observed p95 |
| --------: | ---------: | ------------: | -----------: |
|        12 |      145.6 |         144.4 |          7.0 |
|        50 |      144.4 |         144.4 |          7.0 |
|       150 |      144.4 |         144.4 |          7.0 |
|       400 |      144.4 |     **140.0** |          7.0 |
|       900 |      144.4 |     **111.3** |     **13.9** |

The fixed row is flat to 900 because nothing is being rewritten; only the box
changes under a path that was written once. So the cost of the observed mode is the
per-frame `clip-path` invalidation, not the arithmetic, and it is free until several
hundred instances resize simultaneously.

Practical reading: **use the observed mode.** Reach for `size` when you have
hundreds of instances animating at once, or when the first frame must already be
correct — an SSR'd surface, or one that must not pop on mount.

## What this component does _not_ claim

- **It is not Apple's curve outside `RoundedRectangle`.** `Capsule` and `Circle`
  are geometrically the clamped limit of the same construction — measured
  point-for-point identical — so they need no special case. `Circle()` differs only
  in that it insets to the largest inscribed circle instead of filling its frame;
  that is a layout decision, not a curve, and is left to the caller.
- **Borders are exact, but by construction rather than by offsetting.** The true
  equidistant offset of this curve is not another curve of the same family — under
  inward offset by `d`, curvature maps `κ → κ / (1 − dκ)`, which is a proportional
  rescale only when `κ` is constant, i.e. only for a circle. So `r_inner = r − d`
  is an approximation, and once `d·κ_max ≥ 1` the offset self-intersects into
  cusps. This component sidesteps it: an inner border of width `d` is drawn by
  stroking the _outer_ path at width `2d` and clipping to that same path, which is
  exact for any `d`. Outer borders mirror it with a mask.
