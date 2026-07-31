# Taking the traced contour out of canvas

**Date:** 2026-07 · **Outcome:** the `d` string is the whole bill, the clip is not
· **Applies to:** `sdf-edge-trace` as of 2026-07, headless Chromium via Playwright

## The question

[2026-07-sdf-vs-density-traversal](../2026-07-sdf-vs-density-traversal/README.md)
leaves the contour extractable in a fraction of a millisecond and drawn to a 2D
canvas. Canvas is not where most of this would be used. So: what does it cost to
put the same curve in an SVG `<path>`, use it as a `clip-path` over real DOM
content, and stroke an inner border with it — and which of those costs actually
matter?

Four things were suspected of being expensive. One is, one is not, and two are
worth knowing precisely.

## The contour does not change, so hold it still

Both renderers walk the same vertices through one emitter (`contour-path.ts`),
which is what makes the comparison meaningful: `Path2D` and SVG's `d` accept the
same commands, so the only difference is the destination. The sweep traces once
per cell size and holds that geometry while both builders run against it, so
neither is charged for the trace.

4-ball ring, `sdf` + quadtree, median of 7 batches:

| cell | cmd | trace ms | Path2D ms |      d ms |    d/P2D |  chars | bytes/vertex | round-off |
| ---: | :-- | -------: | --------: | --------: | -------: | -----: | -----------: | --------: |
|    2 | Q   |    0.330 |     0.044 | **0.285** | **6.4×** | 23,262 |         23.8 |     0.050 |
|    2 | L   |    0.352 |     0.040 |     0.161 |     4.1× | 11,610 |         11.9 |     0.050 |
|    1 | Q   |    0.709 |     0.087 |     0.600 |     6.9× | 46,094 |         23.8 |     0.050 |
|    1 | L   |    0.657 |     0.072 |     0.290 |     4.0× | 23,026 |         11.9 |     0.050 |

Precision 1 throughout; the full 32-row sweep is in the probe output.

**Expressing vertices as a string costs 5.7–6.9× what expressing them as a
`Path2D` costs** (3.7–4.4× for a polyline). At the shipped configuration the
string is 0.285ms against a 0.330ms trace — it very nearly doubles the per-frame
cost of having a contour at all, and it is the single largest line item the DOM
route adds. And that is only the _building_: the browser then reparses those
23KB, which lands in paint where no in-page timer can see it.

Two columns are exactly as clean as they look. `bytes/vertex` is 23.8 for `Q` and
11.9 for `L` — a quadratic carries two coordinate pairs to a line's one, so the
string is exactly twice as long — and each extra decimal adds 4 bytes per vertex
for `Q`, 2 for `L`. `round-off` is `0.5 × 10⁻ᵈ` in domain units regardless of cell
size, because it is a property of the formatter, not the sampling.

So precision 1 is the pick: 0.05 domain units of error, well inside a device pixel
at any zoom this renders at, for a third off the string versus precision 3.

## The inset contour: free in samples, not in work

A distance field's inset is the iso level `-w`, so the second contour re-reads the
first one's samples. That is true, and it is not the same as free — which the
first draft of this got wrong in both directions.

4-ball ring, inset 16:

| traversal | cell |    ms | ms +inset | ms ×   |   evals | evals +inset | evals ×    |
| :-------- | ---: | ----: | --------: | :----- | ------: | -----------: | :--------- |
| dense     |    1 |  19.7 |      24.6 | 1.249× | 591,361 |      591,361 | **1.000×** |
| bounded   |    1 |  5.95 |      7.55 | 1.269× | 177,241 |      177,241 | **1.000×** |
| sparse    |    8 | 0.085 |     0.130 | 1.522× |   1,705 |        2,241 | 1.314×     |
| sparse    |    4 | 0.173 |     0.295 | 1.710× |   3,457 |        5,409 | 1.565×     |
| sparse    |    2 | 0.355 |     0.643 | 1.811× |   6,929 |       11,585 | 1.672×     |
| sparse    |    1 | 0.722 |      1.30 | 1.800× |  14,145 |       24,305 | 1.718×     |

Two separate readings, and conflating them is the mistake:

**In samples**, a grid walk gets the second level for nothing — `1.000×`, exactly,
because it visits the same cells either way and reads corner values the row
buffers already hold. **In time** the same rows cost `1.25–1.35×`, because
marching squares and loop linking still run again over every cell. "The samples
are shared" reads like "it is free" and is not: sharing removes the field
evaluations, not the work.

**A quadtree pays in samples too**, because its cost follows the length of what it
finds and two contours is two perimeters: `1.31×` at cell 8 climbing to `1.72×` at
cell 1. It stays under 2× because both levels share ancestor nodes until the tree
is fine enough to separate them, and climbs toward 2× as the cell shrinks because
that shared prefix is a fixed number of tree levels while the leaf count keeps
doubling.

The exact ratio is a property of the shape — how much inner perimeter it has for
its outer perimeter. Two bridged lobes give `1.42×` to `1.70×` over the same cell
range. Read the trend, not the number.

Even at the top of that range `sparse` + inset is 1.30ms against `bounded`'s
7.55ms and `dense`'s 24.6ms for the identical pair of contours.

## Where the inset stops being the same shape

This is the half of the inner-border question that has nothing to do with cost. A
stroke of `2w` clipped to the shape and a contour traced at `-w` are not two
renderings of one curve; past some width they are different curves.

| inset | ring: surface / inner | neck: surface / inner |
| ----: | :-------------------- | :-------------------- |
|     4 | 4 / 4                 | 1 / 1                 |
|     6 | 4 / 4                 | **1 / 2** — split     |
|    16 | 4 / 4                 | 1 / 2                 |
|    44 | 4 / 4                 | 1 / 2                 |

Two lobes bridged by a thin waist split at **inset 6** and stay split out to 44.
The separated ring never splits at any width in the range, which is the control:
the divergence is a property of the waist, not of the technique being unstable.

A clipped stroke cannot report this. It is the outline pushed inward, so it
returns one continuous band at every width, including widths at which there is
genuinely nothing left in the middle of the waist to draw a band through. Only
the iso offset answers "w px in from the edge" as asked.

Neither is a bug, and the choice is real:

- **`stroke + clip`** — one trace, exact uniform width, topology preserved by
  construction. Needs `stroke-linejoin: round`: the path is thousands of short
  marching-squares segments, and a mitered wide stroke spikes on every sharp turn,
  which reads as a row of notches exactly through the tight curvature the
  technique is most often judged on.
- **`second iso`** — the true offset, at the costs in the table above, and it will
  change topology on you.

## The clip is not the problem

The suspicion worth retiring. A `clip-path` rewritten every frame ought to force
the subtree under it to re-raster, and the cost ought to scale with how expensive
that subtree is to paint. It does not show up.

| box px | content  | p50 clip on | p50 clip off | Δ     |
| -----: | :------- | ----------: | -----------: | :---- |
|    520 | gradient |        16.6 |         16.7 | −0.10 |
|    520 | filter   |        16.7 |         16.7 | 0.00  |
|   1040 | filter   |        16.7 |         16.7 | 0.00  |
|   1400 | gradient |        16.7 |         16.7 | 0.00  |
|   1400 | text     |        16.7 |         16.7 | 0.00  |
|   1400 | filter   |        16.6 |         16.7 | −0.10 |

Three subjects spanning paint cost — one gradient pass, a page of text, a blurred
surface behind its own render surface — at three sizes, and every Δ is at or below
the clock granularity. p95 tracks the same way.

**This is a bound, not a zero.** Headless Chromium composites at 60Hz here, so
every row has 16.7ms of budget and the instrument cannot resolve what the clip
costs _within_ it — only that it does not exceed it up to 1400px square with a
filter behind it. That is enough to answer the question that was actually asked,
which was whether to worry.

## Decision

Ship the DOM route, and budget for the string.

The `d` string is the cost — roughly a second trace's worth per frame, plus a
reparse that does not appear in these numbers. `L` instead of `Q` halves it and
the polyline it exposes is already sub-pixel at cell 2, so that is the first lever
if it ever matters. Precision 1 is the second.

Do not budget for the clip, and do not reach for `contain: layout`: none of `d`,
`clip-path` or `stroke-width` is layout-affecting, so there was never a layout cost
to contain, and the stage after it came up empty too.

## Reproducing

Needs a running Storybook and Playwright's chromium:

```bash
pnpm --filter @monorepo/app-storybook dev        # in another shell
pnpm exec playwright install chromium
node archive/2026-07-contour-to-dom/probe.mjs
```

`STORYBOOK_URL` overrides the default `http://localhost:6009`.

This is a browser probe and drives the **real stories** — `runPathSweep` and
`runInsetSweep` are the modules the panels ship, so the tables cannot drift from
what the app does. Absolute times track the machine and the headless-vs-headed
refresh rate; the ratios are what the decisions rest on.
