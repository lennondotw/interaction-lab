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

## Shape and window are two things, and only one of them is a prop pair

A drum is sized by two independent quantities, and keeping them apart is most of the API:

- **shape** — how much arc one item occupies. `drumAnglePerItem`. It sets the radius, and so
  the drum's own height and how many rows fit in the arc.
- **window** — the box you view it through. `drumViewportHeight`. Larger than the drum pads
  above and below; smaller clips the ends of the arc.

`resolveColumnHeight` decides the only quantity they both touch, the box: the window wins
when given, otherwise the drum measures itself. Neither direction of disagreement is guarded
against, because both are things a caller means. **The clip is usually the point**: a full
drum's outermost rows are turned so far from the viewer that they are edge-on slivers a pixel
or two tall, so most uses want the legible middle and nothing else.

### Sizing to a height is the inverse, not a second prop

"Make the drum itself 240px" is the shape said as a length, so it is one quantity with the
angle rather than a second input:

```tsx
drumAnglePerItem={drumAngleForHeight({ itemHeight, drumHeight: 240 })}
```

`drumAngleForHeight` inverts the projection — a quadratic in the radius with one physical
root — and is round-trip tested against `drumHeight` across the whole usable range. A prop
for it as well would need a rule for being handed both spellings at once, and the only
honest rules are "throw" or "silently ignore one".

#### The shortest drum is not one row tall

Read as a limit, the forward function tends to `itemHeight` — one row seen face-on — as the
angle grows without bound. So `drumAngleForHeight` guarded its lower bound there, and that
was wrong, because **the angle cannot grow without bound**. It stops at 90°, where a row is
edge-on to its neighbour. The shortest drum that exists is the one at that angle, a little
over 1.5 × `itemHeight`: `drumRadius` is arc-length based, `h / θ`, so a quarter turn puts
the apothem at `2h/π` rather than at the `h/2` a chord reading would suggest.

Between one row and that floor is a band of heights that look reasonable and have no drum. A
41px target at a 40px pitch inverted to **114° per item** — a finite, plausible number — and
the throw arrived later and somewhere else, from `drumSlots`, naming an angle the caller
never wrote. `drumHeightRange` now reports both ends, `drumAngleForHeight` guards against
them, and 90° is spelled once as `MAX_DRUM_ANGLE_PER_ITEM` instead of being a literal in the
assertion.

The floor scales with the pitch, which is the part that makes a hand-written constant
unsafe: 38px at a 24px pitch, 63px at 40, 111px at 72. The story that found this had been
clamping to `itemHeight + 1` and crashed anyway; a fixed slider minimum of 80px would have
been comfortable at the default pitch and below the floor at the largest one.

The window was nearly made relative instead — a `drumTrim` in pixels — and the composer is
what ruled it out. `TimeWheelPicker` resolves the box **once** and hands the same number to
the drum columns, the `:` separator and the selection band; that shared value is why all
three sit on one centre line. A relative trim would have made the composer compute the
drum's height itself and then derive the box a second time, turning one number that must
agree into two that must be kept agreeing.

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

The prefixing is deliberately asymmetric: the drum's props carry a `drum` prefix, `rows`
does not. `anglePerItem` and especially `height` are ambiguous bare — on a component that
also takes `className`, `height` reads as CSS — they are optional, and they reach the
component through a composer's spread, where a mistyped name is silently inert rather than a
type error. `rows` has none of those problems, is the unmarked branch, and shares its
vocabulary with `rowSlots`, `rowTop`, `rowFade` and `halfRows`. So the prefix itself carries
information: it marks a prop that exists only on the marked branch.

`assertDrumAngle` guards the angle, and that guard is not tidiness. `anglePerItem: 0` gives
`ceil(90 / 0) === Infinity`, so `drumSlots` begins its loop at `1 - Infinity` where `slot++`
cannot advance — an unbounded push that hangs the tab. A negative angle reverses the range
and renders a blank column with no error at all.

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
