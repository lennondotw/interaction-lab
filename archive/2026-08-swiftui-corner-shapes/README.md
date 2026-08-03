# What Apple's continuous corner actually does, measured

**Date:** 2026-08 · **Outcome:** it spends **edge length** (1.520r per side,
measured) and keeps the corner depth (ratio 1.005–1.02), which is why it needs no
radius compensation where CSS needs 1.433 · **Applies to:** macOS 27 SDK /
Swift 6.2, cross-checked against `archive/2026-07-corner-shape-superellipse`

## The question

[`2026-07-corner-shape-superellipse`](../2026-07-corner-shape-superellipse/README.md)
explained CSS's radius compensation by contrasting it with Apple's corner: CSS
confines the curve to the `r × r` corner box and pays in depth, while Apple
spreads along the edge and pays in edge length. The whole explanation rested on
that contrast — and the Apple half was second-hand, marked in that README as
"reverse-engineered by others, not measured here".

The `1.528r` figure in particular was load-bearing and unverified. So was the
claim that the continuous curve must give way as the radius approaches its clamp.
Both are measurable without leaving the machine.

Two further questions fell out of asking: does `RoundedCornerStyle` mean the same
thing as `CALayerCornerCurve`, and is `Circle()` just `RoundedRectangle` with a
big radius?

## No Xcode project is needed for this

Shape geometry is platform-independent — `RoundedRectangle(...).path(in:)` returns
the same path on macOS and iOS — so a question about _shape_ never needs a
simulator. Two single files answer it:

```bash
xcrun swift probe.swift                                  # measurements, no UI
xcrun swiftc -parse-as-library demo.swift -o demo        # visual, one compile
./demo                                                   # window
./demo --png __screenshots__/shapes.png                  # headless render
```

`-parse-as-library` is what lets `@main` live in a single file; without it the
compiler reads the file as top-level script code and rejects the attribute.

`xcrun` matters. A `swift` from swiftly or `/usr/bin` may not match the selected
Xcode's SDK, and the mismatch surfaces as a wall of parse errors inside
CoreGraphics' `.swiftinterface` rather than as anything resembling a version
complaint.

A real device or simulator is only worth the setup when the answer depends on the
platform rather than the geometry — UIKit-only API, Dynamic Type, hit-testing
inside a live view tree, or how something feels under a finger.

## The instrument

`Path.contains` bisected along a ray, the same method the CSS probe uses, so the
two sets of numbers are directly comparable. Nothing is rendered.

Two quantities per corner:

- **corner depth** — distance from the sharp box corner inward to the curve, along
  the 45° diagonal. "How big does the corner look."
- **edge extent** — how far along the top edge the treatment reaches before the
  boundary is straight again. For `.circular` this is exactly `r`, which doubles
  as the instrument's calibration.

Calibration comes out at 149.98 against a true 150, so the numbers below are good
to about 0.02px.

## 1. Apple spends edge length, not depth

`RoundedRectangle` on a 300×300 square:

| r   | edge `.circular` | edge `.continuous` | edge ratio | depth `.circular` | depth `.continuous` | depth ratio |
| --- | ---------------: | -----------------: | ---------: | ----------------: | ------------------: | ----------: |
| 10  |             9.99 |              15.17 |  **1.519** |              4.47 |                4.12 |       1.084 |
| 30  |            29.99 |              45.59 |  **1.520** |             12.78 |               12.66 |       1.009 |
| 60  |            59.98 |              91.22 |  **1.521** |             25.21 |               24.74 |       1.019 |
| 90  |            89.98 |             136.78 |  **1.520** |             37.28 |               37.10 |       1.005 |
| 120 |           119.98 |             149.72 |      1.248 |             50.14 |               49.89 |       1.005 |
| 150 |           149.98 |             149.88 |      0.999 |             62.13 |               62.36 |       0.996 |

The reverse-engineered figure holds: **1.520**, stable across the whole usable
range. And the depth ratio is **1.00–1.02** — the corner apex barely moves.

That is the answer. Apple buys curvature continuity with edge length and leaves
the apparent corner size alone, so nothing needs compensating. CSS buys the same
continuity by pushing the curve at the corner, which moves the apex 30% and has to
be paid back. Same goal, opposite currency.

## 2. It self-limits, and the rule is simple

Edge extent saturates at half the side — there is no more edge to take:

| r / (side/2) |     r | edge `.circ` | edge `.cont` |     ratio |
| ------------ | ----: | -----------: | -----------: | --------: |
| 5%           |   7.5 |         7.49 |        11.35 |     1.515 |
| 40%          |  60.0 |        59.98 |        91.22 |     1.521 |
| 65%          |  97.5 |        97.48 |       148.25 |     1.521 |
| 70%          | 105.0 |       104.98 |       149.33 |     1.422 |
| 80%          | 120.0 |       119.98 |       149.72 |     1.248 |
| 90%          | 135.0 |       134.98 |       149.83 |     1.110 |
| 100%         | 150.0 |       149.98 |       149.88 | **0.999** |

So the behaviour is `edge extent = min(1.52r, side/2)`, and the crossover is where
`1.52r = side/2` — at `r = 65.8%` of half the side, which is exactly where the
table turns.

Past that the curve degrades continuously back toward the arc, and at maximum
radius it _is_ the arc (0.999). This is the graceful degradation CSS does not
have: the superellipse has no edge budget to run out of, so it never notices the
limit and keeps drawing a squircle where a circle was wanted.

## 3. At maximum radius everything converges on the circle

Radial distance from the centre of the 300×300 box:

| shape                           |    0° |    15° |    45° |    90° |    bulge |
| ------------------------------- | ----: | -----: | -----: | -----: | -------: |
| `RoundedRect(150, .circular)`   | 150.0 | 149.59 | 150.00 | 150.00 |     0.3% |
| `RoundedRect(150, .continuous)` | 150.0 | 149.47 | 149.77 | 150.00 |     0.4% |
| `RoundedRect(1e4, .continuous)` | 150.0 | 149.47 | 149.77 | 150.00 |     0.4% |
| `Capsule(.circular)`            | 150.0 | 149.59 | 150.00 | 150.00 |     0.3% |
| `Capsule(.continuous)`          | 150.0 | 149.47 | 149.77 | 150.00 |     0.4% |
| `Circle()`                      | 150.0 | 150.00 | 150.00 | 150.00 | **0.0%** |

Only `Circle()` is exactly flat; the rest sit within 0.4% of it, which is the
Bézier approximation of a quarter circle rather than a difference in intent. On a
square, a rounded rect with a large enough radius **is** a circle — in both
`.circular` and `.continuous`.

Compare the CSS row from the other investigation: `superellipse(1.6)` at `50%`
bulges **12.5%**. That is the difference between degrading and not.

## 4. `Circle()` is not `RoundedRectangle(huge)`

In a 400×200 frame:

| shape                           |        bounds | origin       | fills frame |
| ------------------------------- | ------------: | ------------ | ----------- |
| `RoundedRect(1e4, .circular)`   |     400 × 200 | (0, 0)       | yes         |
| `RoundedRect(1e4, .continuous)` |     400 × 200 | (0, 0)       | yes         |
| `Capsule(.circular)`            |     400 × 200 | (0, 0)       | yes         |
| `Capsule(.continuous)`          |     400 × 200 | (0, 0)       | yes         |
| `Circle()`                      | **200 × 200** | **(100, 0)** | **no**      |
| `Ellipse()`                     |     400 × 200 | (0, 0)       | yes         |

`Circle()` insets to the largest circle that fits and centres it; everything else
fills. So the three shapes are not three spellings of one — and on a non-square
frame a large radius gives a capsule, never a circle. That last part is not
Apple-specific: `border-radius: 9999px` on a non-square box is a pill in CSS too.
A circle needs a square box on both platforms.

`Capsule(style:)` is also not a no-op, though nearly: measured from the end cap's
own centre, `.circular` deviates 0.4% from a true semicircle and `.continuous`
1.4%, and the deviation is asymmetric. At capsule radius the corner treatment
spans the entire short axis, so a continuous capsule has no straight top edge at
all — the caps and the sides blend into one curve.

## 5. `RoundedCornerStyle` and `CALayerCornerCurve` are the same two curves

Cross-checked with a second instrument on a different code path: a `CALayer`
rendered into a bitmap at 4× and thresholded, rather than a path queried for
containment.

| r   | CALayer `.circ` | SwiftUI `.circ` |    Δ | CALayer `.cont` | SwiftUI `.cont` |    Δ |
| --- | --------------: | --------------: | ---: | --------------: | --------------: | ---: |
| 30  |           12.37 |           12.78 | 0.40 |           12.37 |           12.66 | 0.28 |
| 60  |           24.75 |           25.21 | 0.46 |           24.75 |           24.74 | 0.01 |
| 90  |           37.48 |           37.28 | 0.20 |           37.12 |           37.10 | 0.02 |
| 120 |           49.85 |           50.14 | 0.29 |           49.50 |           49.89 | 0.39 |
| 150 |           62.23 |           62.13 | 0.09 |           61.87 |           62.36 | 0.49 |

Agreement within half a pixel, so neither table is an artefact of how it was
measured, and the UIKit/AppKit property API and the SwiftUI type API are drawing
the same geometry.

Depth only, deliberately. A raster cannot locate the tangent point where the curve
rejoins the straight edge: the boundary approaches it quadratically, so the answer
you get is set by pixel size rather than by the shape — at 4× it reads 1.30 where
the true ratio is 1.52. Depth is a transverse crossing and survives
rasterisation. This is the reason the primary instrument queries the path.

## Against CSS

|                         | edge extent / r | corner depth / r | compensation                  |
| ----------------------- | --------------- | ---------------- | ----------------------------- |
| arc, both platforms     | 1.000           | 0.4202           | —                             |
| iOS `.continuous`       | **1.520**       | 0.4123           | **none** — depth ratio 1.019  |
| CSS `superellipse(1.6)` | 1.000           | 0.2891           | **1.433** — depth ratio 1.433 |

One table, two design philosophies. Apple's corner treatment is a _budget
consumer_: it takes edge length, so it can preserve apparent size, and it must
negotiate when the budget runs out. CSS's is a _budget-free_ algebraic curve: it
never negotiates, so it never needs to know the box, and the cost lands on
apparent size and on the shapes it cannot express.

The practical consequence for our own component: the `cornerSmoothing` prop needs a
documented "not for circles and pills" caveat that SwiftUI does not, because
SwiftUI's construction cannot produce a wrong-shaped circle and ours can.

## Reproducing

```bash
xcrun swift probe.swift
xcrun swiftc -parse-as-library demo.swift -o demo && ./demo --png __screenshots__/shapes.png
```

`probe.swift` prints all eight sections. `demo.swift` draws the overlay in
`__screenshots__/shapes.png`, committed through Git LFS: the two curves at one
radius with ticks at `r` and `1.52r`, the collapse as the radius approaches the
clamp, and `Circle()` failing to fill its frame.
