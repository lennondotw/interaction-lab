# 2026-08-backdrop-filter-corner-thread

**Question.** `navigation-stack`'s overlay header is a translucent blurred bar at the top of a
frame that is rounded with `border-radius` + `overflow: hidden`. Every layer inside that frame
is square. A **bright hairline traces both top corners** anyway — one device pixel, following
the curve, brightest where the curve meets the straight edge. Where does it come from, and
what removes it?

**Answer.** `backdrop-filter` promotes the bar to its own compositing layer, and the frame's
rounded clip is then rasterised **separately** for that layer, with coverage along the curve
that does not agree with the main layer's. A subpixel ring of the content underneath therefore
comes out _untinted_, which is the hairline. It is not a geometry problem and the frame is not
at fault: the fix is to make sure the layer carrying the **colour** is not the promoted one.
Splitting the bar into a tint layer with no filter and a blur layer with no background takes
the ring from **248 visibly-wrong pixels to 25**, out of 3600. What does _not_ work is giving
the filtered layer a radius: wider than the frame's removes the ring but paints a second,
visibly larger arc inside the corner, and a no-op `mask` on the frame flattens the clip but
makes the frame a backdrop root, so the blur clamps at its top edge instead.

## The measurement

`probe.mjs` builds the frame from scratch with `setContent` — none of the component's code is
involved, because the question is about what the compositor does with a rounded clip. Five
arrangements of the same bar, three content modes, and one control render per arrangement with
`backdrop-filter` removed.

The control is what makes the numbers mean anything. Over a **solid** colour a blur is a no-op,
so the no-filter render is a pixel-exact reference for what the corner should look like, and
diffing against it cancels the frame's own anti-aliasing. That cancellation is load-bearing: a
translucent layer at partial coverage is _marginally brighter than its own interior_, because
the tint's effective alpha falls with coverage faster than the content's contribution does. So
"the brightest pixel in the corner" has a nonzero floor in a perfectly correct render — the
first version of this probe measured exactly that floor and produced a table that disagreed
with its own screenshots.

|                 | threadMax | threadPx | arcStep | midVar | what it is                                           |
| --------------- | --------: | -------: | ------: | -----: | ---------------------------------------------------- |
| `single`        |      31.0 |  **248** |     0.9 |    0.0 | one layer: tint and blur together, overdrawn 1px     |
| `split`         |      19.6 |   **25** |     0.9 |    0.0 | tint alone (overdrawn) under blur alone, both square |
| `split-r16`     |       8.7 |    **2** |     0.9 |    0.0 | as `split`, blur radius = frame radius               |
| `split-r28`     |       4.7 |    **0** | **3.3** |    0.0 | as `split`, blur radius 12px wider than the frame    |
| `single-masked` |      22.6 |   **32** |     0.7 |    0.0 | `single` + a no-op `mask` on the frame               |
| _(no bar)_      |         — |        — | **1.0** |      — | the gradient alone — the `arcStep` floor             |

400px frame, 16px radius, 84px bar, 2× device pixels, luminance 0–255. The corner box is
30×30 CSS px = 3600 device px.

- **threadMax** — largest per-pixel luminance difference from the control, over solid content.
- **threadPx** — how many of those 3600 pixels differ by more than 8 luma, i.e. enough to see.
  This is the number that matters: a peak cannot tell a hairline tracing the whole curve from
  two pixels at the tangent point, and it is the ring that reads as a defect.
- **arcStep** — largest step between adjacent pixels along a line 6px below the top edge, over
  a smooth gradient. A blurred region's boundary is visible over non-uniform content even when
  the layer has no colour of its own, so this catches a second arc drawn inside the corner.
- **midVar** — stripe variance in the middle of the bar. The control for the control: 0.0
  everywhere means no arrangement scored well by quietly having stopped blurring.

## Reading the rows

**`single` is the shipped bug.** 248 pixels, and `__screenshots__/corner-single-solid.png`
shows why the number is that large — the ring is continuous along the whole curve, one device
pixel wide, and it is the colour of the untinted content rather than a blend.

**Removing only the filter removes it entirely.** Same box, same colour, same content behind
it — `corner-single-control.png` against `corner-single-solid.png` is the entire diagnosis in
two images. Nothing about the geometry changed.

**`split` is the fix, and it is about which layer carries colour.** A 10× reduction in ring
area from moving the translucent background off the filtered element onto a plain one. The 25
that remain are scattered near the tangent points rather than tracing the curve, and they are
not visible in the real component at 10× magnification.

**`split-r28` trades the ring for something worse.** Its `threadPx` is 0 — the blur layer
never reaches the curve, so it cannot disagree with anything there — but `arcStep` triples
against the floor, and `corner-split-r28-gradient.png` shows what that is: the blur layer's own
28px edge, a second arc with a visibly different radius sweeping inside the frame's 16px
corner. Two radii on one corner reads as a mistake far more loudly than a hairline does. This
was implemented, shown to a reader, and rejected on sight.

**`split-r16` measures best and was still not taken.** 2 pixels, no arc — because the layer
rounds itself with exactly the frame's radius, so the clip has nothing to trim and there is no
second curve to see. Checked in the real component against `split` with solid content, the two
are indistinguishable at 10×. It loses on maintenance rather than on pixels: the blur layer's
radius has to track the frame's `rounded-2xl` across two files, and `border-radius: inherit`
cannot carry it because the layer is not a child of the frame. 23 invisible pixels is not worth
a geometric coupling that has no way to fail loudly.

**`single-masked` is the tempting wrong answer.** A no-op `mask-image` on the frame forces the
subtree to be flattened into one buffer before the rounded clip is applied, which is exactly
the "one clip for everything" instinct — and it does remove the thread from a real render. But
a mask forms a **backdrop root**, so the blur can only sample what is painted inside the frame:
it clamps at the frame's top edge and bands over detailed content, which
`corner-single-masked-striped.png` shows against `corner-split-striped.png`. Its `threadPx` of
32 is no better than `split` either. `isolation: isolate` and `opacity < 1` have the same trap
for the same reason, and are worth knowing about together — every trick that flattens a subtree
also cuts the backdrop off from everything outside it.

## What this decides

**Split the material into tint and blur, and leave both square.** `navigation-header.tsx` paints
a blur layer (`backdrop-filter`, no background, `inset-0`) and then a tint layer (translucent
background, no filter, overdrawn `-1px` on the top and both sides), with the content in a
positioned layer above them. The tint is what the frame's clip cuts, and it is not promoted, so
its coverage agrees with the view's.

**Overdraw the tint, never the blur.** The 1px outset on the top and sides means the clip cuts
through tint rather than through the join between tint and the page behind the frame. The bottom
edge is not overdrawn: that is the edge `--nav-safe-top` is measured against.

**Keep both layers out of flow.** `useHeaderHeight` measures the header's box, and the 2px the
overdraw adds in each axis must not reach it. A negative margin would have overdrawn just as
well and taken the measured height with it.

**Do not reach for a radius on the filtered layer, a mask, or `isolate`.** All three are
recorded above with the number or the picture that rules them out.

## Open

- Chromium only, at 2×. Whether WebKit and Gecko split the clip the same way is untested, and
  `threadPx` is exactly the kind of number that is an implementation detail.
- The 25 remaining pixels in `split` are unexplained. The tint layer is not filtered, so it
  should not be promoted at all; overlap with the composited blur layer beneath it is the
  obvious suspect, and confirming that would need the compositing layer tree rather than pixels.
- `arcStep` only looks at one scan line. It is enough to catch a 28px arc, and it would miss an
  arc that happens to be tangent to that line.
- Nothing here measures cost. `single-masked` adds a full-frame buffer per paint and the split
  adds one layer; neither was profiled, because both were rejected or accepted on appearance.
