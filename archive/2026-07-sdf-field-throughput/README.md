# What the field costs as shapes multiply, and what is left to squeeze

**Date:** 2026-07 · **Outcome:** the cost is quadratic in shape count, one exact
early-out recovers up to 1.6×, and the larger win is blocked by smin not being
commutative · **Applies to:** `sdf-edge-trace` / `MetaSurface` as of 2026-07, Node 24 / V8

## The question

[2026-07-sdf-vs-density-traversal](../2026-07-sdf-vs-density-traversal/README.md)
established the cost per _cell_: a quadtree makes the walk O(perimeter) instead of
O(area), worth 55×, which is the whole argument for tracing a distance field. That
measurement held shape count at 4.

DOM-seeded fields do not have four shapes. A toolbar has eight, a card grid has thirty.
So: how does cost scale with the number of primitives, and is anything left on the table?

## The cost is quadratic in shape count

| shapes | packed row | ns/eval | spread grid | ns/eval |
| -----: | ---------: | ------: | ----------: | ------: |
|      2 |    0.075ms |    35.1 |     0.100ms |    34.7 |
|      4 |    0.219ms |    51.2 |     0.313ms |    54.1 |
|      8 |    0.734ms |    85.5 |     0.800ms |    72.4 |
|     16 |    2.732ms |   158.6 |     2.870ms |   125.0 |
|     32 |    8.743ms |   253.4 |     8.891ms |   201.9 |
|     64 |   33.631ms |   486.3 |    35.542ms |   393.5 |

`ns/eval` is the column that explains it. The smin folds _every_ shape for _every_
sample, so a sample is O(shapes) and a trace is O(perimeter × shapes) — and perimeter
grows with shape count as well. Two multiplying factors, hence 0.075ms → 33.6ms for 32×
the shapes: **a factor of 450**.

Per-eval cost is flat across cell size, which confirms where it comes from:

| cell |    ms | ns/eval |  evals |
| ---: | ----: | ------: | -----: |
|    8 | 0.131 |    76.7 |  1,714 |
|    4 | 0.312 |    78.0 |  3,994 |
|    2 | 0.671 |    78.2 |  8,590 |
|    1 | 1.450 |    78.0 | 18,591 |

Cell size buys evals; shape count buys cost per eval. They are independent knobs and only
one of them was ever measured.

## Shipped: an exact early-out worth up to 1.6×

In the quadratic smin, `h = max(k - |d - di|, 0) / k` reaches 0 once a shape is further
than `k` from the running minimum, and the fold degenerates to `d = min(d, di) = d`. Such
a shape contributes **nothing**, so skipping it is exact rather than approximate — verified
bit-identical at Δ = 0.

Testing it needs a lower bound on the box distance cheaper than the distance:
`max(|dx| - hw, |dy| - hh)`, the Chebyshev reading, no sqrt.

What it is worth depends on how densely packed the shapes are relative to `blend`, not on
how many there are — near the contour the running `d` is close to 0, so the test reduces
to "is this shape more than `blend` away":

| shapes | spread over a page | packed into a row |
| -----: | -----------------: | ----------------: |
|      4 |              ×1.09 |             ×0.83 |
|      9 |              ×1.26 |       ×0.95 (n=8) |
|     36 |              ×1.53 |      ×1.17 (n=32) |
|     64 |              ×1.60 |             ×1.17 |

Cards spread over a page are what it helps. A packed row is the case where the neighbours
genuinely _are_ within `blend` and genuinely do contribute — nothing can be skipped and
the bound is pure overhead. Hence the threshold at 8 shapes: by then the worst packed
regression is ~5% while the spread win is already 26%, and the 4-ball ring every archived
timing was taken on stays off the path entirely.

## Not shipped, and the reason is the interesting part

The early-out is weak because `d` starts at `1e9`: the first shape is always computed in
full, and the bound only bites once `d` is small. Reach a tight `d` immediately — fold the
shape that was nearest for the previous sample first, which spatially coherent traversal
makes almost always right — and a micro-benchmark gives:

| shapes | canonical | + bound | + bound + hint |   speedup |
| -----: | --------: | ------: | -------------: | --------: |
|      8 |    0.0300 |  0.0236 |         0.0138 |     ×2.18 |
|     32 |    0.1335 |  0.0929 |         0.0329 |     ×4.06 |
|    128 |    0.5862 |  0.3549 |         0.0970 | **×6.04** |

It cannot be done. **The iterated quadratic smin is not commutative:**

| case                     |       min |       max |      spread | order-free |
| :----------------------- | --------: | --------: | ----------: | :--------- |
| three within k           |  3.168966 |  3.633463 |     4.64e-1 | NO         |
| four overlapping         | -5.716152 | -4.574701 | **1.14e+0** | NO         |
| two close, one far       | -0.653846 | -0.653846 |     0.00e+0 | yes        |
| all further apart than k |  0.000000 |  0.000000 |     0.00e+0 | yes        |

Four overlapping shapes give answers spread over **1.14px** depending on fold order. Since
corners are memoised and shared between adjacent cells, a reordered fold would make a
corner's value depend on _when it was computed_ — two leaves sharing a corner would
disagree, and the dense-vs-sparse agreement the whole codebase rests on would break.

Worth recording how nearly this shipped: the first micro-benchmark reported Δ = 0 against
the canonical fold and looked safe. That was luck. A packed row never puts a sample within
`k` of three shapes at once, and two-shape folds are trivially symmetric — the benchmark
had no case that could expose it.

## Directions, with what each is worth

Ordered by expected payoff. Nothing below is built.

**1. Hierarchical shape culling — the structural fix.** Carry a per-node shape subset down
the quadtree: high nodes hold every shape, leaves hold one or two. Leaf folds stop being
O(shapes) and `ns/eval` goes flat, turning the quadratic into roughly linear. Sound despite
the corner cache, and this is the subtle part: a shape excluded because it cannot affect
the smin _anywhere in the node_ is excluded from every node sharing that corner, so shared
corners still agree. The test needs care — keep shape `i` when its lower-bound distance to
the node is within `k` of the smallest upper bound over all shapes. Expected the largest
win of anything here, at real complexity.

**2. A commutative blend.** Swapping the quadratic smin for an exponential one,
`-log(Σ exp(-k·dᵢ))/k`, is order-free, which unblocks the ×6 hint above _and_ makes the
field trivially parallel. It changes the shape — every archived number and every story
screenshot moves — and costs an `exp` per shape per sample, which may eat the win outright.
Worth measuring before believing.

**3. Attack the string, not the field.** At 8 shapes the `d` build is 45–51% of the trace
on top of it, and the browser's reparse is extra again:

| cell | trace ms |  d ms | d / trace | sum ms | d chars |
| ---: | -------: | ----: | --------: | -----: | ------: |
|    4 |    0.306 | 0.157 |       51% |  0.464 |  10,765 |
|    2 |    0.655 | 0.322 |       49% |  0.977 |  22,381 |
|    1 |    1.404 | 0.632 |       45% |  2.036 |  44,077 |

Past the early-out, further field work optimises the smaller half. `L` instead of `Q`
halves the string and the polyline is already sub-pixel at cell 2 — the cheapest
remaining win in the whole system, and it is not in the field at all.

**4. A worker, which the earlier archive retired for the wrong case.**
[2026-07-metaball-contour-cost](../2026-07-metaball-contour-cost/README.md) rejected one
because a `postMessage` round-trip would land the contour a frame late while dragging.
That reasoning is about _per-frame_ tracing. A DOM surface traces on layout change, where
one frame of latency is invisible, and the numbers above show 30+ shapes exceeding a frame
on the main thread. The conclusion should be revisited on those terms rather than
inherited.

**5. Kill the closures in `cellSegments`.** It allocates four arrow functions per cell
(`top`, `bottom`, `left`, `right`) to defer edge-vertex creation. At ~1,900 leaves × 2
levels that is ~15,000 allocations per trace. V8 may sink them; unmeasured either way, and
it is the inner loop.

**6. Cheaper coordinate formatting.** `toFixed` is a known-slow path. Manual integer
scaling might beat it, and this is inside the string build that item 3 says is half the
cost.

**7. One-sided sqrt in the box distance.** Near a straight edge only one axis is outside,
so the `sqrt` reduces to the non-zero term. Micro-benchmarked at a few percent on top of
the bound — real but small, and it adds a branch to the hottest line in the system.

**8. Incremental retracing.** When one rect moves, only nearby subtrees changed. Re-tracing
just those would be a large win for the common single-item case, and needs the traversal to
become resumable — the biggest change here for the narrowest benefit.

## What this means in practice

At the sizes the stories actually run — 3 to 8 rects — the field costs 0.3–0.8ms and the
whole thing is comfortable. Measured in the browser on a continuously animating layout:
**~69–85 traces/s at a median 0.300ms**, a few percent of one core.

The cliff is at roughly 16 shapes, where a trace crosses a 60Hz frame. Anyone putting 30
merged elements in one surface needs item 1.

One second-order effect worth knowing, measured in the `RectField` story rather than here:
an expensive trace does not only cost more, it **traces less often**. Forcing a degenerate
configuration took the median to 7.2ms and the rate from 69/s to 34/s, because more layout
changes coalesce into each frame. Slowness converts into staleness, and the surface visibly
lags its own layout.

## Reproducing

```bash
cd apps-web/app-storybook
npx vite-node ../../archive/2026-07-sdf-field-throughput/probe.mjs
```

Run from the storybook package so the TypeScript sources resolve. Part 2 of the probe
measures the shipped configuration; the early-out-disabled column was taken by raising
`SKIP_MIN_SHAPES` in `field.ts` out of reach and re-running. Absolute times track the
machine; the ratios and the `ns/eval` trend are what the decisions rest on.
