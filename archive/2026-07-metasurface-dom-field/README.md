# Seeding the field from laid-out DOM rects

**Date:** 2026-07 · **Outcome:** the shape work was nearly free; the cost was all in
the DOM integration, and one trap there is a 35× cliff · **Applies to:**
`MetaSurface` and `sdf-edge-trace` as of 2026-07

## The question

[2026-07-contour-to-dom](../2026-07-contour-to-dom/README.md) leaves a metaball
contour paintable as an SVG path, usable as a `clip-path`, and strokeable as an inner
border — but the _shapes_ are still abstract ball centres in a fixed 512 box. The
thing anyone would actually want is the opposite arrangement: ordinary `<div>`s that
keep their own layout, merging into one shape.

So: what does it take to make the field's primitives be real laid-out rects, and where
is the difficulty actually located?

Estimated at 2–3 days with the risk in one place. That was roughly right, and the risk
was in the place predicted.

## The shape work was the easy half

A disc is not a special case of a rounded box — it _is_ one, with the half-extents
equal to the corner radius. Substituting `hw = hh = r = R` into

```
q = |p - c| - halfExtent + r
d = min(max(q.x, q.y), 0) + length(max(q, 0)) - r
```

collapses it to `length(p - c) - R` exactly, because `max(q.x, q.y) ≥ 0` makes the
first term vanish. So both live on one code path with no branch for correctness, and
the box distance is _better_ behaved than the smooth-min that combines them: exact
rather than bounded, `|∇d| = 1` almost everywhere.

The evidence that the collapse is exact rather than approximate: **all 35 existing
tracer tests passed unchanged on the first run.** Every archived timing, overscan
figure and topology count would have moved otherwise.

`FieldShape.hw/hh` are half-extents of the _whole_ box, corners included, so a DOM rect
maps on with a division and nothing else — no adjustment for the radius, no reasoning
about which corner.

## The trap: never derive the domain from the element

`traverseSparse` roots its forest at `nx & -nx`, the largest power of two dividing the
grid width, because a quadtree has to subdivide evenly. Choose the domain and this is
invisible. _Derive_ it from a measured element size and it fails silently:

| region | fitted domain |  nx |  tile |       roots | padded view | tile | roots | fitted verdict |
| -----: | ------------: | --: | ----: | ----------: | ----------: | ---: | ----: | :------------- |
|    500 |           756 | 378 |     2 |      35,721 |         512 |  128 |     9 | shallow        |
|    640 |           896 | 448 |    64 |          49 |         768 |  512 |     1 | ok             |
|    734 |           990 | 495 | **1** | **245,025** |         768 |  512 |     1 | **DEGENERATE** |
|    863 |          1119 | 560 |    16 |       1,225 |        1024 |  128 |    25 | ok             |
|    990 |          1246 | 623 | **1** | **388,129** |        1024 |  128 |    25 | **DEGENERATE** |
|   1024 |          1280 | 640 |   128 |          25 |        1024 |  128 |    25 | ok             |
|   1200 |          1456 | 728 |     8 |       8,281 |        1280 |  256 |     9 | shallow        |

A root of size 1 makes every root a leaf, so the walk becomes a flat scan of the entire
domain _plus_ a wasted centre probe per cell — strictly worse than `dense`. Timed on
three rounded rectangles at cell 2:

| region  | fitted domain      | padded          | penalty |
| :------ | :----------------- | :-------------- | :------ |
| 734×220 | 9.477ms / 246,699  | 0.522ms / 5,619 | **18×** |
| 990×260 | 17.560ms / 389,895 | 0.498ms / 5,791 | **35×** |
| 500×500 | 2.729ms / 39,880   | 0.333ms / 6,228 | 8×      |
| 640×200 | 0.626ms / 5,557    | 0.585ms / 5,549 | 1.07×   |

17.5ms is over a 60Hz frame, for three rounded rectangles, from a tracer that does four
merged blobs in 0.35ms. The 640 row is the control that says what this is: padding is
not a speedup, it is the absence of a cliff — where a fitted domain happens to root well
the two are equal.

`quadtreeSafeView` pads to a multiple of 256 instead, and `quadtreeTileFor` exposes the
root size so the failure is assertable rather than silent. A unit test fits a domain on
purpose to prove the check can see the bug.

The `Animations/SdfEdgeTrace/RectField` story reproduces it live: pin `Width` to 990,
toggle `fit domain`, and `root` drops to 1 while `probes` goes from 4,517 to 388,129 and
the measured trace from 0.259ms to 11.1ms — 43x. Pinning the width is necessary because
the cliff is **width-dependent**, which is the whole reason it is a trap: at most sizes a
fitted domain roots acceptably and nothing looks wrong.

Two consequences worth stating:

- **A square domain over a non-square region costs nothing for the empty part.** The
  734×220 padded row is 5,619 evals for a 768² domain. Culling an empty quadrant is one
  probe, so one square tracer serves any aspect ratio.
- **Resizes are cheap.** Padding quantises to 256, so dragging a window across 200px of
  width reallocates no buffers.

## Decision: a layout anchor, not a visual rect

Items measure through the beacon's `offsetParent` walk plus `offsetWidth/offsetHeight`,
which is deliberately **transform-immune** — that is a documented contract of
`useBeaconAnchor`, not an oversight.

Chosen over following `getBoundingClientRect` because:

- It is event-driven. Transforms fire no observer, so visual-rect following would need
  `getBoundingClientRect` polled every frame — reintroducing exactly the per-frame cost
  this design otherwise avoids.
- The semantics are better for a _surface_. A card sliding on a transform keeps its lobe
  where its layout is, so the merged shape stays stable while something animates over it.

The cost, stated so nobody rediscovers it: `offsetWidth` is an integer, so the field
quantises to whole pixels. Invisible at rest; a smoothly animating width would step the
bridge by a pixel at a time. The rect source is a single function, so a visual-rect mode
is a contained addition if that ever matters.

## Decision: share the observation cascade, do not copy it

A surface derived from rects has the beacon's failure mode with a worse symptom. A
beacon that misses a change paints one element in the wrong place, which is obvious. A
surface that misses one participant reports the wrong **topology** — a lobe that is no
longer there, or a bridge between items that have moved apart — and a plausible-looking
blob is not self-evidently wrong.

[2026-07-beacon-layout-observation](../2026-07-beacon-layout-observation/README.md)
ablated the five sources and found four near-disjoint and **one dead**. That is evidence
the wiring is both load-bearing and capable of silently rotting, so a second copy would
rot independently — and the probe that caught the dead source only watches one of them.
`useLayoutObservation` is therefore extracted and shared, and `useBeaconAnchor` now
delegates to it.

Verified per source after the extraction, one beacon case each: C1 self resize Δ140px →
0, C3 sibling mount (the `IntersectionObserver` shift trick) Δ108px → 0, C5 ancestor
cascade Δ96px → 0, C7 capture-phase scroll never disagreed.

## The instrument, and the scalar that had to be invented

`layout-trace.ts` turned out to be ~85% generic over `read: () => number`, so it split:
the sampling, verdicts and tracer moved to `utils/observation-trace.ts`, and `Box`,
`boxDelta`, `MATCH_EPSILON` stayed with the beacon. `MATCH_EPSILON` became an argument
rather than a constant, because it was never universal.

A curve has no rect to compare, so the beacon's reading does not transfer. What a
contour has is a defining property: **every vertex sits on the field's zero level.** So
the error is `max |field(v)|` over the painted vertices with the field rebuilt from fresh
measurements — one number in px, non-zero if _any_ participant has gone stale. Strictly
stronger than one-box-against-one-box.

Independent on all three sides, which is the discipline this harness carries: rects via
`getBoundingClientRect` where the items use the `offsetParent` walk; the smooth-min
re-derived rather than imported; and the vertices parsed back out of the painted `d`
attribute rather than read from the tracer's buffers, which makes the check end-to-end
through everything the browser was actually handed.

| case | mutation                              | baseline | max Δ | settled | recovery        | verdict |
| :--- | :------------------------------------ | -------: | ----: | ------: | :-------------- | :------ |
| S1   | a participant grows                   |      0px |  24px |     0px | 2 frames / 33ms | tracked |
| S2   | a participant mounts                  |      0px |   3px |     0px | 1 frame / 17ms  | tracked |
| S3   | the row re-distributes                |      0px | 120px |     0px | 2 frames / 33ms | tracked |
| S4   | the container gains padding           |      0px |   0px |     0px | never disagreed | tracked |
| S5   | a participant grows on the cross axis |      0px |  48px |     0px | 2 frames / 33ms | tracked |

A baseline of 0px means under 0.05px, the floor of the readout: the whole chain —
`offsetParent` walk, registry, field, quadtree, marching squares, path string, painted
attribute — agrees with an independent reading to better than a twentieth of a pixel.

It also says `ε = cell` is generous here. Interpolation error scales with curvature
across a cell, and a rounded box is mostly straight edge where interpolation along an
edge is exact; a disc-heavy shape sits nearer the 0.6px the unit tests pin at cell 1.

### The independence earned its keep immediately

The first run reported `MISSED` on all five cases with a **baseline** of 46.7px, before
any mutation. That is 33px on both axes — `33 × √2` — which is the stage wrapper's `p-8`
plus its border: the instrument was differencing rects against the wrapper while the
contour is in region coordinates.

An instrument that disagrees with its subject only tells you one of the two is wrong.
Finding out which is the work, and this time it was the instrument. Worth recording
because it is the failure mode of the technique, not an argument against it — a
_shared_ implementation would have agreed with itself and reported nothing.

## Decision: tier 2 stays unbuilt

The plan split the instrumentation. Tier 1 watches the cascade through one consumer;
tier 2 would ablate each of the five sources and re-run every case, which is what found
the beacon's dead source and is most of that harness's ~900 lines — comparable to the
entire primitive.

Deferred, because tier 1 reports no gaps and the beacon's probe already ablates the same
shared `useLayoutObservation`. Build it here if these cases start reporting misses, or if
a visual-rect mode ever lands — a _new_ cascade would have no proof behind it and would
need its own ablation.

## Three bugs the browser found that types and lint did not

- **`blend: 0` poisoned the entire field.** The smin fold divides by blend, so at exactly
  zero `max(blend - |d - di|, 0) / blend` is `0 / 0`; the first fold returned NaN, every
  sample followed, and the contour came back empty with no error raised. Clamped in the
  tracer, since "these should not merge" is a reasonable request.
- **The overlay needs an explicit negative z-index.** It is positioned and the items are
  static, and positioned-above-static painted it over its own content regardless of DOM
  order. `isolate` bounds the negative index to the surface's stacking context; the cost
  is that the container must not paint its own background.
- **Flex participants need `shrink-0`.** At a wide gap the gaps claimed the whole row and
  default `flex-shrink: 1` collapsed every item to zero width — which the surface
  faithfully rendered as nothing.

## Where the difficulty actually was

Predicted, and confirmed: not in the field. The rounded-box primitive is ~40 lines and
landed with every existing test green. What cost the time was the DOM integration — the
domain trap, the React Compiler's constraints on keeping `measure` identity-stable
(three separate contexts, not one bundled object, or the memo is refused), and building
an instrument for a subject whose error is not a rectangle.

## Reproducing

Part 1 is arithmetic and needs nothing. Part 2 drives the real story:

```bash
pnpm --filter @monorepo/app-storybook dev        # in another shell
pnpm exec playwright install chromium
node archive/2026-07-metasurface-dom-field/probe.mjs
```

`STORYBOOK_URL` overrides `http://localhost:6009`; part 2 skips itself if no server
answers. Absolute times track the machine; the ratios and the topology counts are what
the decisions rest on.
