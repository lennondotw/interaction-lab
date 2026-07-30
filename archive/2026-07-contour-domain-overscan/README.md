# How far past the frame the contour has to be traced

**Date:** 2026-07 · **Outcome:** sample a 128px overscan margin on every side —
free for the quadtree, 2.25× for the dense strawman · **Applies to:**
`sdf-edge-trace` as of 2026-07, Node 24 / V8 14

## The symptom

Drag two balls onto the right edge with `sdf` + `quadtree` and the contour stops
being a contour: a straight vertical line runs down the frame, the fill spills
across it, and one of the two balls disappears from the shape entirely.

The cause is a mismatch nobody had to think about while the balls stayed in the
middle. Ball centres are clamped to the 512px box, and the same 512px box is
what gets sampled — but the _shape_ around a centre is not clamped. A centre
parked on the frame has most of its lobe outside the sampled grid, marching
squares hands back an open chain rather than a loop, and `buildPath` calls
`closePath()` on everything it is given. An open chain closed by `closePath()` is
exactly a straight chord between its two loose ends, with the fill bounded by
that chord.

So the fix is not in the renderer. Nothing downstream can tell a truncated chain
from a real loop; the grid has to be wide enough that the truncation never
happens.

## How wide

The quantity that matters is **reach**: the largest distance from the nearest
ball centre to any point inside the shape. If every centre is inside box `B`,
the shape is inside `B` grown by `reach`, so `reach` _is_ the overscan.

There is a bound per field, and it is the same expression already used to size
the `bounded` traversal's box:

- **density** — exact. Past `radius + 3σ` every blurred disc contributes exactly
  0, so the sum cannot reach the 0.4 iso no matter how many balls pile up.
  `60 + 36 = 96`.
- **sdf** — a bound, not the maximum. Each quadratic-smin fold subtracts at most
  `k/4`, and folding `n` coincident balls accumulates
  `u_{n+1} = u_n + (1-u_n)²/4` of `k` — which converges on `k` from below but
  never reaches it. `60 + 40 = 100`.

Measured against those, by ray-casting outward from every centre over ring,
cluster, scattered and random layouts:

| layout                      |   n |  sdf reach | density reach |
| --------------------------- | --: | ---------: | ------------: |
| ring spread=110             |   4 |     60.139 |        63.951 |
| ring spread=140 (autoplay)  |  12 |     71.105 |        72.472 |
| scattered extent=180        |  12 |     73.432 |        73.644 |
| cluster jitter=20           |  12 |     82.974 |        78.567 |
| **coincident (worst case)** |  12 | **90.328** |    **84.274** |
| bound                       |     |    **100** |        **96** |

Two things worth noting. Reach is maximised by **stacking balls on one point**,
not by spreading them — every extra ball at the same place folds another
`h²k/4` of bulge in, so the demo's worst case is a 12-ball pile at a corner, not
its default ring. And `density`'s reach exceeds `radius` even for a _single_
ball (63.87 at n=1), because the iso is 0.4 rather than 0.5, so the threshold
sits outside the disc edge.

The margin therefore needs to clear 100. **128** is that rounded up to a power
of two, which is what keeps the quadtree working — see below. The remaining 38px
over the measured worst case is slack for cell alignment and for `k`/`σ` being
turned up later.

## What it costs

Almost nothing, for the traversals anyone actually runs. 4 balls, `sdf`:

| traversal   | cell |     512 |     768 |      1024 |  768 vs 512 |
| ----------- | ---: | ------: | ------: | --------: | ----------: |
| **sparse**  |    1 |   9,389 |   9,397 |     9,405 | **1.0008×** |
| **bounded** |    1 | 164,025 | 164,025 |   164,025 |  **1.000×** |
| dense       |    1 | 263,169 | 591,361 | 1,050,625 |   **2.25×** |
| **sparse**  |    4 |   2,157 |   2,165 |     2,173 |  **1.004×** |
| dense       |    4 |  16,641 |  37,249 |    66,049 |   **2.24×** |

`sparse` pays 8 evals — one per new root, all of them culled on the spot.
`bounded` pays nothing, because it was already clipping to the balls rather than
to the domain. Only `dense` pays, and it pays 2.25× for area it cannot even
show you, which is the O(area) argument from
[2026-07-sdf-vs-density-traversal](../2026-07-sdf-vs-density-traversal/README.md)
restating itself. Buffers go from 14.3 MB to 21.8 MB at `minCell=1`.

Sampling 1024 instead — a single power-of-two root, a smaller diff — costs 4×
and 32.3 MB to buy margin that is already 28px more than needed. Not worth it.

## The quadtree needs a forest

A quadtree root has to be a power of two to halve cleanly down to one cell, and
`512 + 2 × 128 = 768` is not one. The walk therefore starts from a forest: the
largest power-of-two tile that divides the grid, found with `nx & -nx`, which
gives 3×3 tiles of 256 at every cell size the story offers (768/1, 384/2, 192/4,
96/8 → 256, 128, 64, 32). Seeding the stack with 9 roots instead of 1 is the
whole change, and it drops the old requirement that the sampled domain be a
power of two — only `traced % cell === 0` is left.

## Why not the alternatives

**Shrink the box the centres live in** instead of growing the grid: free, two
lines. But the draggable area goes from 512 to 296 wide, and the balls can no
longer be pushed into the corners at all — a real interaction loss to fix a
rendering bug.

**Close open chains along the domain boundary** (clipped marching squares):
also free, and correct. But the fill and the stroke then need different paths —
the wall segments belong to the fill and not to the outline — and the result is
a shape clipped at the frame, which is what the overscan produces anyway.

## Verification

`field.test.ts` asserts the invariant directly rather than the fix: every chain
the tracer returns must be a _cycle_, checked geometrically, because consecutive
marching-squares vertices sit on two edges of one cell and so can never be more
than a cell diagonal apart. Balls are parked on edges, on corners, and 12-deep
on one corner, across both fields and three cell sizes. `overscanTooSmall` runs
the same check against a tracer built with `overscan: 0` and asserts the gap
_is_ there, so the test cannot silently stop testing anything.

In the browser, reading the canvas's last pixel column with two balls clamped to
the right edge:

| overscan | longest stroke run at the frame | fill pixels |
| -------- | ------------------------------: | ----------: |
| 0        |                          **68** |           1 |
| 128      |                          3 (AA) |     **206** |

68 contiguous stroke pixels down the frame is the chord. At 128 there is no
stroke at the frame at all — just fill running off the edge, clipped by the
canvas, which is what a shape continuing past the view is supposed to look like.

## Reproducing

```bash
node archive/2026-07-contour-domain-overscan/probe.mjs
```

No dependencies. Sections 1–3 measure reach, 4–5 the cost of each candidate
domain size.
