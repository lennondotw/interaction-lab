# Scrolling without a scroller

**Status:** settled · **Touches:** `wheel-geometry.ts`, `use-wheel.ts`,
`pointer-velocity.ts`, `wheel-column.tsx`

The wheel has no scroll container. Everything it does comes from one scalar — `offset`, a
distance in pixels, where `offset / itemHeight` is the fractional index sitting on the
centre line. Snapping is rounding it. Which item a row shows is a modulo of it. There is no
`scrollTop`, and no seam.

## Why not native scroll

Native scroll gives momentum, snapping, touch drag and keyboard support for free, and the
only reason to give all of that up is the endless loop.

Making a native list endless means a tall container whose `scrollTop` is rewritten by one
lap as it approaches either end. That write has to happen **during momentum**, which on iOS
Safari either cancels the fling or jumps a frame, and under `scroll-snap-type: mandatory` can
provoke a second snap. Growing the buffer to a thousand laps defers the problem rather than
removing it, and it trades a seam for a precision drift.

The same re-basing exists here — `rebaseOffset` — but it is **provably invisible**, which is
what makes it safe. Subtracting a whole number of laps changes `base` by a multiple of
`count`, and `base` only ever reaches the screen through `wrapIndex(base + slot, count)`;
`frac` is untouched, so every row's position is untouched too. So it can wait for a moment
when nothing is animating, which is the whole difference: the same trick, done at rest.
Verified in the browser — six consecutive flings later, the rows still sit on exact multiples
of the pitch.

A 3D drum would also be impossible on a scroller, since every row needs a transform derived
from the scroll position anyway. Having taken the offset into our own hands, that comes free.

## Drag, fling and snap are one animation

Motion's `inertia` decelerates from a release velocity, and `modifyTarget` bends where it
comes to rest. Handing it `nearestDetentOffset` makes the natural resting point the nearest
item, and because `inertia` recomputes its amplitude when `modifyTarget` moves the target,
the curve still starts at the release velocity and lands exactly on the detent. One
animation, so none of the two-stage feel of a fling that visibly stops and is then tugged
into place.

Two things about that call are not obvious, and both cost a round:

**It is passed a target it appears to ignore.** `inertia` reads `keyframes[0]` and computes
its own destination, so the target looks redundant — but Motion's `canAnimate` skips an
animation whose keyframes have not changed unless the type is a spring or a generator
function, and `'inertia'` is neither. Passing `offset.get()` produces a silent no-op and no
fling at all. The explicit target is the same projection `inertia` performs internally, so
the two cannot disagree.

**The velocity does not come from `MotionValue.getVelocity()`.** That derives velocity from
two samples — `current - prevFrameValue` over `updatedAt - prevUpdatedAt` — so one jittery
final `pointermove` sets the whole fling, which reads as the wheel occasionally spinning
forty rows from a flick meant to move three. `pointer-velocity.ts` averages over a window
instead, and treats a pause before release as a deliberate stop.

Whether one window suits both a finger and a mouse is still open —
`topics/release-velocity-across-input-devices.md`.

## Everything else that moves the wheel

| input             | how it settles                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------ |
| drag release      | `inertia` with `modifyTarget`, from the measured velocity                                  |
| tap               | spring to the tapped row                                                                   |
| arrow key         | spring one detent, counting from the last commanded target so fast presses do not collapse |
| wheel / trackpad  | accumulate deltas, then spring to the nearest detent 140ms after they stop                 |
| typing            | spring to the matched row                                                                  |
| controlled change | spring, taking the short way round a loop                                                  |
| `pointercancel`   | spring to the nearest detent, discarding the velocity — an invalidation is not a release   |

The scroll wheel needs a non-passive listener, which is why `useWheel` installs its own
rather than taking a React `onWheel` prop: React registers `wheel` passively on the root, so
`preventDefault` from a prop is ignored and the page scrolls behind the picker.

## Rows are a ring, and the ring must not tear

`rows + 1` slots are rendered — one more than the viewport holds, the extra one at the
bottom, which falls out of the arithmetic rather than out of caution. Each row's **label**
and its **transform** are both `useTransform` outputs, and that is load-bearing rather than
stylistic.

When `floor(offset)` increments, every row's label shifts up by one _and_ every row's
position drops by a full `itemHeight`. The two cancel exactly. Split them across two frames
— by deriving the label from React state, say — and the whole column visibly jumps one row
height and back, on **every** detent crossed. There is no edge of the viewport to hide that
in. Motion recomputes a derived value in the frame's `preRender` step and writes a
`MotionValue` child straight to `textContent` in the same pass, so neither can land on a
different frame from the other. Confirmed by reading Motion's source rather than assumed.

React learns the selected index through one `useMotionValueEvent`, and nothing on screen
depends on that, so the re-render cannot tear the rows.

## There is no non-looping path

Every column loops, including the two-item meridiem. No clamping, no rubber-band, no
end-of-list state — `wrapIndex` is the whole story, and the absence of those branches is
deliberate rather than unfinished. The cost is visible and accepted: a two-item wheel shows
`AM PM AM PM AM`, because a viewport taller than the item count has nothing else to show.

## See also

- `topics/drum-geometry.md` — how the same offset is redistributed around an arc.
- `topics/tap-or-drag.md` — how a gesture becomes a drag in the first place.
