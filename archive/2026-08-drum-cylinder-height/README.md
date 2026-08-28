# How tall is a drum?

**Date:** 2026-08 · **Status:** measured, shipped in `Components/Time wheel picker` ·
**Applies to:** Chromium

A flat wheel's box is `itemHeight * rows`: a flat row is `itemHeight` tall and there are
`rows` of them. A drum's rows are set around an axis instead, so its height is a property
of the cylinder and has nothing to do with the row count. The component used the same
expression for both, and the default angle happened to make that almost exactly right,
which is why it looked fine and was not.

## Measured

```sh
pnpm exec playwright install chromium               # once
pnpm --filter @monorepo/lab dev                     # STORYBOOK_URL to override the port
node archive/2026-08-drum-cylinder-height/probe.mjs
```

The angle alone moves the drum's height by 4×. `box` is what the component now gives it;
`model` is the closed form; `inner` is the inscribed cylinder for comparison.

| angle |     model | inner |  measured | box | rows visible |
| ----: | --------: | ----: | --------: | --: | -----------: |
|    8° |     435.7 | 434.6 |     449.0 | 436 |           23 |
|   10° |     366.7 | 365.3 |     374.0 | 367 |           17 |
|   14° |     279.1 | 277.0 |     281.8 | 279 |           13 |
|   20° | **206.4** | 203.3 | **206.4** | 206 |            9 |
|   28° |     154.5 | 150.1 |     151.3 | 154 |            7 |
|   34° |     130.8 | 125.4 |     131.2 | 131 |            5 |
|   40° |     114.1 | 107.7 |     111.5 | 114 |            5 |

Against the old fixed box of `itemHeight * rows` = 200 for all of them: at 8° the drum was
cut roughly in half, at 40° it left 43px of dead space on each side, and `rows` stopped
meaning "rows you can see" — 23 of them were visible in a box sized for 5. Only the default
20° landed close enough to look deliberate.

## The closed form

```
r      = itemHeight / anglePerItem_rad          apothem, where translateZ(r) puts a row
R      = hypot(r, itemHeight / 2)               circumradius, through the rows' corners
height = 2 · R · perspective / (perspective + r)
```

At the defaults that is 206.4, and the rendered drum measures 206.4.

The `perspective / (perspective + r)` term is the projection divide, taken at the angle
where a point is highest — its `z` is back at the axis there, because the row transform is
`translateZ(-r) rotateX(θ) translateZ(r)` and the outer `-r` is what puts the axis at the
plane the box lives in.

## It is a prism, so there are three heights

The rows are flat rectangles, not arcs, so in cross-section the drum is a **prism**: the
rows are its faces and they meet at edges. A prism lies between two cylinders, and the
prism's own extent at rest is a third value between them.

|                        | radius                        | height at defaults |
| ---------------------- | ----------------------------- | -----------------: |
| inscribed cylinder     | `r`, the apothem              |              203.3 |
| the prism at rest      | depends on the rotation phase |             206.41 |
| circumscribed cylinder | `R`, through the corners      |              206.4 |

At rest and circumscribed agree here, and not by luck: with `rows = 5` and 20° per item,
the outermost rendered row sits at 80° and its own corner is a further
`atan((itemHeight/2) / r)` = 9.9° round, landing at 89.9° — an edge essentially exactly at
the top.

**The at-rest value is the wrong one to build on.** Sampled while turning:

```
  at rest        206.41
  turning min    206.23
  turning max    207.39
  wobble           1.16
  over rest by     0.97   <- a box measured at a detent clips here
```

Both cylinders are rotation-invariant, which is the property a height needs. A height read
at a detent is not, and would clip by about a pixel during a scroll.

Two caveats on that wobble. The measured 1.16px is smaller than the ~3px an idealised
prism predicts, because the rendered rows are discrete — none sits exactly at 90° — and
`sin ψ` is stationary there, so a row sweeping past 90° barely changes its projected
height. And `getBoundingClientRect` reads a little high on a 3D-transformed quad, which is
the same instrument error that puts `measured` above `model` at the small angles in the
table.

## Decided

The auto height is the **circumscribed** cylinder: rotation-invariant, and it cannot clip.
The inscribed one is 1.5% shorter at the defaults, which is why choosing between them is
not a design decision — whereas the fixed `itemHeight * rows` box was.

`height` overrides it, and the override is unguarded on purpose, because both directions
are things a caller means:

| case                        | box | drum | reading                 |
| --------------------------- | --: | ---: | ----------------------- |
| `anglePerItem: 10`, auto    | 367 |  374 | exact fit               |
| default, auto               | 206 |  206 | exact fit               |
| `anglePerItem: 34`, auto    | 131 |  131 | exact fit               |
| `height: auto + 60`         | 266 |  206 | padded, 30px each side  |
| `height: auto - itemHeight` | 166 |  206 | clipped, 20px each side |

The clip is usually the point. A full drum's outermost rows are turned so far from the
viewer that they are edge-on slivers a pixel or two tall — geometrically present, not worth
the space — so `Components/Time wheel picker` → `Flat and drum` trims one row's worth, half
from each end, which is what a real use wants. `Drum height` shows all five cases above
with the box drawn.
