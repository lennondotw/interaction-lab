# 2026-08-displacement-map-reuse

**Question.** A displacement map costs 12–65ms to rasterise, which is far past a frame. So when
can one be _reused_? Specifically: does a `liquid-square`-style transform invalidate it, and what
happens to the answer once two glasses merge into one?

**Answer.** A transform does not invalidate it — measured, `backdrop-filter` evaluates in the
element's own pre-transform space, so a cached map survives any affine transform applied to an
ancestor. `liquid-square` emits nothing but `translate` and `scale`, so **one map covers its
entire interaction**. A merge does invalidate it, and no amount of locality rescues the SVG-filter
route: the right cached artefact for a merging group is an **SDF**, not a displacement field,
because an SDF composes under `smin` and a displacement field does not.

## The transform case

`probe-transform.mjs` settles the only part that could not be reasoned out. A uniform map — a
constant +40 unit offset — over a hard step edge, once with no ancestor transform and once inside
`scaleX(2)`:

|                                | step lands at | shift    |
| ------------------------------ | ------------- | -------- |
| backdrop, untouched            | 400           | —        |
| through unscaled glass         | 360           | 40px     |
| through a `scaleX(2)` ancestor | 320           | **80px** |

The shift doubles with the ancestor's scale, which means the filter ran in local space and the
transform was applied to its result. So the refraction is solved in geometry that never changed
and the whole picture is then deformed as a unit. Translate, scale — uniform or not — and rotate
are all safe.

`use-liquid-stretch.ts` returns `translateX/Y` and `scaleX/scaleY` and nothing else, and
`liquid-div.tsx` puts them on the element while the glass layers are its children. So the drag and
the spring squash both land on an ancestor of the filter, and the local geometry is untouched for
the whole gesture.

Two things to accept rather than discover later:

- A non-uniform scale gives a **stretched picture of the glass** — the rim thickens on one axis.
  For a squash-and-stretch that is arguably the point, since the glass itself is deforming. If
  what you wanted was a rim that stays a constant pixel width while the box scales, that is a
  rebuild and there is no way around it.
- `feDisplacementMap` has **no matrix parameter**, so the decoded offset vector cannot be
  transformed. Rotating a cached map rotates the sampling positions but leaves R/G pointing along
  the old axes, which is wrong. It only works because the filter sits _inside_ the rotated space.
  Apple's `GlassBackgroundUniforms` has a `displacement_mat` (float4, so 2×2) which looks like
  exactly this hook — that reading is inferred from the field's name and type and has not been
  verified.

## The merge case

Two merged glasses are one glass: one boundary, one rim, and the rim through the neck belongs to
neither shape. So they cannot be computed separately and composited, and the group is the correct
unit. The question is only whether a move dirties a _small_ part of that unit.

`sdf-edge-trace`'s quadratic `smin` says it should. With
`h = max(k − |d₁ − d₂|, 0) / k` and `d = min(d₁, d₂) − h²k/4`, the result is **exactly** `min`
wherever the two distances differ by `k` or more, so the blend cannot reach further than that.
`probe.mjs` measures how much that comes to, for two R=60 discs with a 26px bevel:

```
   k   gap   rim%ofgroup   blend%ofrim   dirtybox%ofgroup
  20   -20          24.3          13.6                4.3
  20     0          24.3           7.8                2.5
  20    15          22.9           0.9                0.9
  20    30          21.9           0.0                0.0
  40   -20          24.9          31.6               11.9
  40     0          25.0          22.4                8.2
  40    15          24.1          14.0                5.8
  40    30          21.9           2.8                3.3
```

`gap` is centre separation minus 2R, so 0 is touching. Three readings:

1. **Only ~a quarter of the group carries a displacement at all.** The offset is zero outside the
   bevel, so three quarters of any group texture is neutral grey and never needs recomputing.
2. **The blend's reach is small and it switches off entirely.** At `k=20` it touches 7.8% of the
   rim when the shapes touch and 0% once the gap passes ~30px; its dirty bounding box is 2.5–4.3%
   of the group. Even at `k=40` it is ~12% at worst.
3. **And that is the wrong thing to optimise.** A shape that moves dirties _its own_ rim, which is
   ~half the group's rim at N=2 — an order of magnitude more than the blend band. Exploiting blend
   locality saves the _other_ shape's rim, so the win is roughly `1/N`: real, but a constant
   factor, not the order of magnitude the frame budget is short by.

## What this decides

**Stay with a cached map for anything that only transforms.** `liquid-square` is exactly that
case and needs no rebuild at all.

**Do not try to make SVG filters survive a merging group.** One 400px map is 12–65ms against an
8.3ms frame, halving it by locality still misses, and the handoff has its own ceiling: an object
URL never finishes loading in `feImage` at frame rate, a data URL pays for base64, and the whole
pipeline tops out around 21 MPix/s (`demos/bitmap-handoff-cost`).

**Cache an SDF instead, and derive refraction in a shader.** This is what Apple does, and the
reason is structural rather than a performance trick: an SDF is composable under `smin` where a
displacement field is not, it is one smooth scalar channel so it tolerates coarse resolution, and
the per-pixel refraction it feeds is free on a GPU, which leaves nothing worth caching downstream.
The evidence is in `2026-08-liquid-glass-internals`: `CASDFLayer` / `CASDFElementLayer` /
`CASDFOutputEffect` turn shape layers into "backdrop-compatible SDF textures",
`glass_background_sdf_*` are the shader variants that consume `SdfFragmentUniforms`, and
`NSGlassEffectContainerView.spacing` is the proximity-merge knob for exactly this grouping.
`feDisplacementMap` cannot participate — it takes an encoded offset field and has no way to read
an SDF and derive a normal from it.

**One prerequisite if we ever do partial updates.** `refraction-map.ts` picks
`scale = 2 × maxOffset`, which is a _global_ normalisation: a local change that moves the peak
re-scales the whole encoding and invalidates every untouched pixel. The peak offset was measured
to be shape-independent — it is set by bevel, thickness, depth and IOR, not by the outline — so the
scale can be fixed up front from those, and only then is a sub-rect update meaningful.

## Open

- Cost of a partial re-rasterisation plus compositing into an existing texture. The locality is
  established; whether the bookkeeping is cheaper than redrawing the rim is not.
- `displacement_mat`'s actual semantics, which is currently a guess from a field name.
- The blend numbers are for two discs. A concave pair, or three shapes meeting, will have a wider
  band, and nothing here bounds that.
