# Tracing the sdf-effect metaball in real time

**Date:** 2026-07 · **Outcome:** feasible, and neither a Worker nor Rust is
warranted · **Applies to:** `sdf-effect` as of 2026-07, Node 24 / V8 14

## The question

`sdf-effect` paints four draggable circles through an SVG filter — a
`feGaussianBlur` plus an `feColorMatrix` that thresholds alpha — so the merged
blob is a raster effect with no geometry behind it. Can a real, drawable curve
be extracted from it every frame, and if so, does that need a Web Worker or a
native implementation?

## The shape is not an SDF, but the field is reconstructible

Worth stating plainly, because the component's name suggests otherwise: there
is no distance field here. The filter is `blur → threshold`, and the alpha row
`0 0 0 20 -8` means `a' = clamp(20a - 8)`, so the iso value is 8/20 = 0.4.

Reading pixels back is the obvious route and the wrong one. `getImageData` on
the rasterised filter output forces a sync GPU readback every frame.

It is not necessary, because blur is linear and

```
indicator(A ∪ B) = 1_A + 1_B − 1_{A∩B}
```

so while the discs are disjoint, `blur(union) ≡ Σ blur(disc_i)` exactly — and
disjoint-but-close is precisely the regime where metaballs bridge. Overlap only
costs the shape a little mass deep inside, where the field has saturated past
the threshold and the contour does not care. So the field can be evaluated
analytically at any point, at any resolution, with no canvas involved: a sum of
blurred-disc profiles, `0.5·erfc((d−R)/(σ√2))`, which smootherstep approximates
to within a percent without an `exp()`.

## Measured

600×600 domain, R=60, σ=12, iso 0.4 — the shipped configuration. Balls move
every iteration, so the saturation early-out and the branch predictor are not
being flattered by a static shape. `cell` is the marching-squares grid step.

| configuration          | ms/frame  | % of a 60fps frame |
| ---------------------- | --------- | ------------------ |
| 4 balls, cell=8        | **0.127** | 0.8%               |
| 4 balls, cell=4        | **0.412** | 2.5%               |
| 4 balls, cell=2        | **1.463** | 8.8%               |
| 4 balls, cell=1 (600²) | 5.616     | 34%                |
| 16 balls, cell=4       | 0.685     | 4.1%               |
| 64 balls, cell=4       | 1.696     | 10%                |
| 64 balls, cell=2       | 6.467     | 39%                |

cell=2 is already sub-pixel at the size this renders and costs under 9% of the
frame. Ball count is close to linear and never the problem — the field's
per-ball early-out at `d² ≥ (R+3σ)²` means a ball outside its own influence
radius costs one compare.

## Topology, checked before timing

A traversal that silently drops half the contour is trivially fast, so the
probe asserts the loop count first:

| case              | loops | expected |
| ----------------- | ----- | -------- |
| 1 ball            | 1     | 1        |
| 2 balls far apart | 2     | 2        |
| 2 balls merged    | 1     | 1        |
| 4 balls apart     | 4     | 4        |

This is where the one real bug was. Marching squares must emit **complementary
cases in opposite directions** — case 1 as `L→T` and case 14 as `T→L`. With
both wound the same way the segments do not chain head-to-tail, and the linking
step reports 12, 22, or 37 fragments for a four-ball shape depending on cell
size. The timings above are meaningless without it, which is why the assertions
run first and print.

The probe also bisects for where the contour actually sits: **63.87px** for a
lone ball against a geometric R of 60. The iso value is below 0.5, so the curve
lands outside the circle. Anything overlaying the traced path on the source
circles needs to expect that.

## Decision: no Worker

The job is 1.5ms. A worker would add a `postMessage` round-trip, which means
the contour arrives a frame late and visibly trails the balls while dragging —
paying latency to fix a cost that is not there. Transferable `ArrayBuffer`s
remove the copy, not the round-trip.

The one case that would change this is a resolution high enough to blow the
frame budget (cell=1 with 64 balls, 6.5ms, is on the way). The next entry
removes that pressure a different way.

## Decision: no Rust

Tempting for a tight numeric kernel, and it would win — V8 is maybe 2–3× off
native on this shape of code. It is still the wrong lever, because the cost
here is asymptotic, not constant-factor: the dense walk is O(area), and
switching to a distance field with hierarchical culling makes it O(perimeter),
worth ~55× at cell=1. That is measured in
[2026-07-sdf-vs-density-traversal](../2026-07-sdf-vs-density-traversal/README.md).

A 3× language win applied to the wrong algorithm loses to the right algorithm
in JavaScript, and costs a toolchain, a build step, and a WASM payload. Revisit
only if the right algorithm in JS stops being enough.

That "maybe 2–3× off native" is an assumption, and this entry never measured it.
Once the right algorithm shipped, the question came back without the asymptotic
argument to lean on, so the kernel was measured directly against its own hardware
floor in
[2026-07-wasm-kernel-headroom](../2026-07-wasm-kernel-headroom/README.md). The
answer is still no, for a sharper reason: the 2.5× is in the shape of the loop,
not in the language.

## Reproducing

```bash
node archive/2026-07-metaball-contour-cost/probe.mjs
```

No dependencies — plain Node, no browser. Absolute times track the machine;
the ratios between rows are what the decisions rest on.
