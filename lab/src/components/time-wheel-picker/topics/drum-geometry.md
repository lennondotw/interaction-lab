# Drum geometry

**Status:** settled · **Touches:** `wheel-geometry.ts`, `wheel-column.tsx` ·
**Measured in:** `archive/2026-08-drum-cylinder-height`

## It is a prism, not a cylinder

A drum looks like a cylinder and is not one. Its rows are flat rectangles set around an
axis, so each row is a **chord** rather than an arc, and in cross-section the solid is a
regular prism: the rows are its faces and they meet at edges.

That matters for one reason and is a curiosity for another.

The reason: a prism's extent depends on its rotation phase, so "how tall is it" has three
answers rather than one. The curiosity: `drumRadius` uses `r = itemHeight / a` — the
radius at which one item's **arc** is `itemHeight` — while faces that tiled edge to edge
would want `r = itemHeight / (2·sin(a/2))`. At 20° per item those differ by 0.55%, so
adjacent rows interpenetrate very slightly at the edges. Invisible, and worth knowing
before someone "fixes" the radius.

## Three heights, two of them usable

|                        | radius                                                          | at the defaults |
| ---------------------- | --------------------------------------------------------------- | --------------: |
| inscribed cylinder     | `r`, the apothem — where `translateZ(r)` puts each row's centre |           203.3 |
| the prism at rest      | depends on the rotation phase                                   |          206.41 |
| circumscribed cylinder | `R = hypot(r, itemHeight/2)`, through the rows' corners         |           206.4 |

The at-rest value is the one to avoid, and measurably so: sampled while turning, the extent
reaches 207.39 against 206.41 at rest, so a box sized from a detent clips by about a pixel
during a scroll. Both cylinders are rotation-invariant, which is the property a height
needs — the circumscribed one is precisely the surface the prism's edges sweep, so
"considering the motion, it is a cylinder after all".

**The auto height is the circumscribed cylinder**, projected:

```
r      = itemHeight / anglePerItem_rad
height = 2 · hypot(r, itemHeight / 2) · P / (P + r)
```

206.4 at the defaults, and the rendered drum measures 206.4. The inscribed cylinder is
1.5% shorter, which is why choosing between the two is not a design decision. What _was_
one is the box this replaced: `itemHeight * rows`, which is a flat wheel's height and has
nothing to do with a drum. Across the angles the stories offer, the drum's own height spans
4×; at 8° per item the old box cut it roughly in half, and at 40° it left 43px of dead space
on each side. Only the default 20° landed close enough to look deliberate.

## Angle and height are shape and window, not alternatives

The two look like rival ways to say the same thing and are not:

- `anglePerItem` is the drum's **shape**. It sets the radius, and so the drum's own height
  and how many rows fit in the arc.
- `height` is the **window** onto it. Larger than the drum is padding above and below;
  smaller is a clip.

They need no priority between them beyond the one quantity they both touch — the box — and
`resolveColumnHeight` decides that: `height` wins when given, otherwise a drum measures
itself and a flat wheel is `rows` items tall. Neither direction of disagreement is guarded
against, because both are things a caller means. **The clip is usually the point**: a full
drum's outermost rows are turned so far from the viewer that they are edge-on slivers a
pixel or two tall, so most uses want the legible middle and nothing else.

Making the pair mutually exclusive was considered. It would mean deriving the angle from the
height — invertible, via a quadratic in `r` — and it would remove trimming, since a smaller
height would then produce a tighter arc rather than a clipped drum. The exclusivity landed
on `rows` instead, where the props genuinely conflict.

## `rows` is not a drum concept

A drum ignores `rows`, and provably. Its slots run to wherever a row turns edge-on:

```
drumSlots = 1 - ceil(90 / anglePerItem)  …  ceil(90 / anglePerItem)
```

That used to be spelled as the flat slot set plus an overscan derived from `rows`, and the
algebra cancelled — the lower bound `-half - (ceil(90/a) - half - 1)` loses its `half`.
Measured, a drum at 20° rendered the identical ten slots at every row count from 1 to 9.
So `rows` was a prop that silently did nothing, and `WheelColumnProps` is now a union
discriminated on `variant` that refuses it.

## Two traps in the transform

**Order and count.** The row transform is
`translateZ(-r) rotateX(θ) translateZ(r)`, built with `useMotionTemplate` rather than from
Motion's `rotateX` and `z`, because Motion's transform order is fixed and it emits
`translateZ` _before_ `rotateX` — which pushes an already-rotated row along the global Z
and leaves every row stacked at the centre. The outer `translateZ(-r)` is not a refinement
either: without it the whole drum sits `r` closer to the viewer and the perspective divide
scales the centre row up by `P / (P - r)`, 15% at the defaults, so the centre row no longer
matches the selection band it is supposed to sit inside.

**Invisible is not untouchable.** `drumRow` dims a row by `cos θ` clamped at zero, which
culls the back face and shades the front in one expression — `backface-visibility` would do
only the culling. But a row at zero opacity is still laid out, and the arc carries it back
_inside_ the column's box, where it wins a hit-test and sends a tap five rows away. Rows
drop `pointer-events` along with their opacity.

## See also

- `archive/2026-08-drum-cylinder-height` — the numbers, and where the instrument reads high.
- `topics/scrolling-without-a-scroller.md` — the motion the drum redistributes.
- `topics/tap-or-drag.md` — why a tap is resolved by hit-testing rather than by inverting
  this projection.
