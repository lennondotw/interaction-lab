# Which field to trace, and whether hierarchical culling pays

**Date:** 2026-07 · **Outcome:** a real SDF plus a quadtree — 1.7× more
expensive per sample, 55× cheaper overall · **Applies to:** `sdf-edge-trace` as
of 2026-07, Node 24 / V8 14

## The question

[2026-07-metaball-contour-cost](../2026-07-metaball-contour-cost/README.md)
establishes that the metaball's density field can be reconstructed analytically
and traced in about 1.5ms. But density is not the only field that describes this
shape. A quadratic smooth-min of circle distance fields describes a very
similar one, and answers a different question at each point.

- **density** — how much ink is here. Saturates at 1. Iso surface at 0.4.
- **sdf** — how far away the nearest edge is. Unbounded. Iso surface at 0.

Distance is strictly more information, and it costs more to compute. Is it
worth it?

## Why the distinction decides the traversal

It buys a cull test. A quadtree node is wholly inside or wholly outside the
shape when

```
|f(centre)| > halfDiagonal
```

because no point in the node can be closer to the surface than that. Such a node
can be discarded along with its entire subtree, which turns the walk from
O(area) into O(perimeter) — the contour is a 1D curve in a 2D domain, and only
the cells it passes through need to be visited.

Density cannot do this at all. `f = 0` means "no ink here", not "the nearest edge
is N px away"; the field is flat across the whole exterior and flat again in the
saturated interior, so there is nothing to compare a half-diagonal against.
Density's fastest honest traversal is the bounding box of the balls.

The caveat that shows up in practice: quadratic smin is Lipschitz-bounded but
**not eikonal**. `|∇f|` can exceed 1 near a blend, so the exact half-diagonal
test occasionally culls a node that does contain the surface, punching a hole in
the contour. A 1.1 safety margin on the comparison buys that back, and is where
that constant in `field.ts` comes from.

## Measured

1024×1024 for every row so the numbers are comparable, and a power of two so
the quadtree subdivides cleanly. 4 balls, moving.

| field   | traversal  | cell | ms        | field evals |
| ------- | ---------- | ---- | --------- | ----------- |
| density | dense      | 4    | 1.647     | 66,049      |
| density | dense      | 2    | 5.826     | 263,169     |
| density | dense      | 1    | 23.096    | 1,050,625   |
| sdf     | dense      | 4    | 2.551     | 66,049      |
| sdf     | dense      | 2    | 9.911     | 263,169     |
| sdf     | dense      | 1    | 38.921    | 1,050,625   |
| sdf     | **sparse** | 4    | **0.184** | **3,387**   |
| sdf     | **sparse** | 2    | **0.350** | **6,794**   |
| sdf     | **sparse** | 1    | **0.711** | **13,624**  |
| sdf     | **sparse** | 0.5  | **1.424** | **27,328**  |

Two things to read off it.

**SDF is the more expensive field.** Same eval count, 38.921 against 23.096 at
cell=1 — about **1.7×** per sample. It has no early-out: density can stop the
moment the sum saturates past the threshold, while smooth-min has to fold in
every ball because any one of them might pull the minimum down.

**And it is 55× faster anyway.** 0.711ms against 38.921ms at cell=1 — **54.7×**
— and still 32.5× against the cheaper density field's dense walk. The win is
entirely in how many samples get taken: 13,624 against 1,050,625, a factor of
**77**.

The scaling is the whole argument. Read the eval column down each traversal as
the cell halves:

| traversal | evals per halving | complexity   |
| --------- | ----------------- | ------------ |
| dense     | **×3.98**         | O(area)      |
| sparse    | **×2.01**         | O(perimeter) |

Dense quadruples, sparse doubles, and the gap compounds with every refinement.
Sparse at cell=0.5 — a quarter-pixel grid on a 1024² domain, 4.2 million cells
if walked densely — costs 1.4ms, less than the dense walk at cell=4.

## Topology agreement

Speed that changes the output is not speed. Within one field, every traversal
must return the identical contour:

| configuration        | loops | points   |
| -------------------- | ----- | -------- |
| density dense cell=2 | 4     | 1022     |
| sdf dense cell=2     | 4     | **958**  |
| sdf sparse cell=2    | 4     | **958**  |
| sdf dense cell=1     | 4     | **1920** |
| sdf sparse cell=1    | 4     | **1920** |

Sparse matches dense exactly, at both cell sizes — same loop count, same vertex
count. The 1.1 safety margin is doing its job.

The two **fields** do not agree with each other, and should not be expected to:
958 against 1022 points. They blend on different terms, so they describe
slightly different shapes. Density is the one that matches what `sdf-effect`
paints today; SDF is the one that can be traced cheaply. That is a real
trade-off, not a bug, and it is why the story ships both rather than picking one.

## Decision

Trace the SDF with a quadtree. Keep density selectable, because it is the
ground truth for what the original component renders, and let it fall back to a
bounded walk with the reason stated in the UI rather than silently reporting a
duplicate configuration.

This is also what retires the Worker and Rust questions from the previous entry.
The dense walk at cell=1 was 39ms — genuinely over budget, the point where
offloading starts to look necessary. The same output at 0.711ms is 4% of a frame.
The algorithm was the lever; the language and the thread were not.

Retires them on asymptotic grounds, which stop applying once this algorithm is
the one shipped.
[2026-07-wasm-kernel-headroom](../2026-07-wasm-kernel-headroom/README.md) asks the
Rust question again from that position and answers it on the kernel's own terms.

## Reproducing

```bash
node archive/2026-07-sdf-vs-density-traversal/probe.mjs
```

No dependencies. The shipped `field.ts` is this probe productionised — same two
fields, same cull test, same 1.1 margin — and the story's benchmark panel runs
the equivalent sweep in-browser with the same dense-reference cross-check.
