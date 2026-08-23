# Telling a tap from a drag

**Status:** settled · **Touches:** `use-wheel.ts`, `wheel-geometry.ts`
(`pastDragThreshold`, `tapTargetOffset`), `wheel-column.tsx` ·
**Published as:** the `tap-drag-threshold` skill

One surface has to accept two gestures: drag it to spin, or tap a row to select that row.
Every part of that is a decision, and three of them were wrong before they were measured.

## The threshold: 3px, 2D, and borrowed

Three pixels of Euclidean distance from where the pointer went down. Not chosen — matched
to Motion's `PanSession.distanceThreshold`, which is exactly `3` and exactly
`distance2D(info.offset, {x: 0, y: 0})`. A surface that decides at a different distance from
every other draggable thing on the page feels wrong for reasons nobody can name, so the
value is worth borrowing even where our own taste might differ.

Being 2D, sideways movement counts: a horizontal wobble can classify a gesture as a drag.
That is the conservative direction — a sloppy tap then does nothing and gets repeated,
rather than jumping the wheel somewhere unasked.

## Sticky, which is the part that matters

The test is _has this gesture ever crossed the threshold_, not _is it across now_. One
boolean, set once, never cleared until the pointer is released.

Re-evaluating at release looks equivalent because it agrees for every monotonic gesture —
which is most of them, and why the difference ships unnoticed. It diverges whenever the
pointer's **path** is longer than its **displacement**: drag out and come back, and the
release sits near the press point, so a re-evaluated test calls it a tap and the wheel jumps
to whatever row the pointer is resting on. Verified: out to 60px and back to 0 stays a drag.

Motion is sticky too — `isPanStarted` is `this.startEvent !== null`, assigned on the first
crossing and never cleared for the session.

## The threshold classifies; it does not gate the motion

Three strategies are available once a threshold exists, and they differ only inside the
first `T` pixels:

|                    | surface while under `T` | at the crossing | steady-state offset   |
| ------------------ | ----------------------- | --------------- | --------------------- |
| classify only      | tracks the pointer 1:1  | nothing happens | 0                     |
| gate with catch-up | still                   | steps by ≈`T`   | 0                     |
| gate with rebase   | still                   | nothing         | ≈`T` behind, for ever |

**We classify only.** The wheel follows from the first pixel, so three pixels of tap-slop do
move it three pixels and the tap then settles back onto the same detent — a fortieth of a
row, erased by the snap. The alternatives buy a pixel-exact tap and pay for it with either a
visible step as the drag begins or a permanent lag; on a surface that snaps, neither is worth
it. Motion itself is the middle row: it holds the element still and then applies the full
displacement from the press point, so the element steps ~3px into the drag.

## Which row was tapped: ask the DOM

Each row carries `data-wheel-slot`, and a tap reads the slot off
`event.target.closest(...)`. The obvious alternative — invert the pointer's `clientY` — is
right for a flat wheel and wrong for a drum, whose rows are spread around an arc and then
divided by a perspective, so recovering an angle from a `clientY` means solving an equation
rather than an `asin`.

The hit-test is also _stronger_ than arithmetic. `tapTargetOffset` uses the `base` from the
moment of the press, and that is the same `base` the tapped row used to choose the label it
was displaying, so the item that arrives at the centre is **by construction** the item that
was pointed at. There is no separate calculation that could be off by one. Measured on the
drum, a row rendered 15.4px tall selects correctly.

Both the slot and the offset are read at `pointerdown`, never at release: the wheel has been
following the pointer since its first pixel, so by the time a finger lifts the rows have
moved under it, and a drift across an integer would flip the `base`.

## The parts that only showed up on contact

**A cursor cannot be driven by `:active`.** It begins at `pointerdown`, which is before the
classification exists, so a grabbing hand hung off it closes for taps too — which is the one
thing the distinction is for. An attribute set at the crossing drives it instead:
`pointer` at rest, `grabbing` once it is a drag. And because the pointer is captured, `body`
gets the cursor as well, or the hand springs open over whatever it passes.

**`preventDefault` on `pointerdown` suppresses focus.** It is there to stop native text
selection and drag-and-drop, and it also suppresses the `mousedown` that would have moved
focus — so clicking a column and then pressing an arrow key did nothing until `focus()` was
called explicitly.

**A key this column consumed must stop propagating.** `preventDefault` speaks only to the
browser's default action; an ancestor listening for the same key still hears it. Storybook's
preview forwards every `keydown` to its manager unless the target is an input, and the
manager binds `1`, `2` and `3` to focusing panels — so typing any time starting with a `1`
handed the keyboard away after one digit. Consumed keys now call `stopPropagation` and
`stopImmediatePropagation`, the latter because React attaches at the root container and the
forwarder sits on `document`.

**Invisible rows are still hit-testable.** See `topics/drum-geometry.md`.

## See also

- `topics/scrolling-without-a-scroller.md` — what a drag does once it is one.
- `topics/release-velocity-across-input-devices.md` — the open question about how a drag
  _ends_, which this topic does not answer.
- The `pointer-drag-release` skill — the four ways a drag can end, and why
  `pointercancel` is not one of them.
