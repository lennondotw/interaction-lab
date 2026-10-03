# Close-button geometry

Ordinary compression should shrink the title first, then shrink the close slot while keeping the X
centered. Entrance and exit should reveal or clip a fixed close slot, rather than run that centering
logic against each temporary animated width.

## Ordinary compression uses flex

The title button uses `flex-1 min-w-0 overflow-hidden`. The close button uses `basis-7 shrink min-w-0`
with centered flex alignment. Its declared basis is 28 px at the default spacing scale. Together they
produce these stages without a JavaScript width threshold:

| Available tab width   | Title slot                | Close slot                          |
| --------------------- | ------------------------- | ----------------------------------- |
| Above the close basis | Takes the remaining width | Holds its basis.                    |
| At the close basis    | Reaches zero              | Holds its basis.                    |
| Below the close basis | Remains zero              | Shrinks to the available tab width. |

The X SVG is 14 px, `shrink-0`, with stroke width 1.5. It stays centered in the shrinking slot. Below
the icon width, the tab's outer overflow clips it symmetrically rather than shrinking the icon or
leaving it aligned to the old slot edge. Neither title nor close slot has an implicit min-content floor.

The explicit flex basis remains readable even when a new tab's outer footprint is zero. A fixed
`width` that gets measured only after shrinking would lose this distinction between declared capacity
and current geometry.

## Entrance freezes the destination slot

[useTabCloseLayout](../use-tab-close-layout.ts) reads the close button's computed basis on mount. While
the tab is entering, each layout target freezes the slot at `min(basis, finalTabWidth)` and sets
`flex-shrink: 0`. A very compressed new tab therefore gets its final small close capacity from the
start, even though its animated outer width is still zero.

The outer footprint reveals that fixed slot as it grows. The X does not begin centered in the current
zero/tiny animated width and then slide as that width expands. A retarget during entrance updates the
frozen slot from the new final destination. Width-animation completion clears the inline basis/shrink
overrides and returns ownership to ordinary flex compression; gap completion is not a prerequisite.

Immediate mount, reduced-motion, and resize updates also finish the entry phase and clear overrides.
A zero/no-animation destination can finish without waiting for an animation-complete event.

## Returning to centered compression is a lifetime transition

| Situation                                                 | Close-slot owner                           | Return to ordinary flex                                                          |
| --------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| Present tab compresses or expands                         | Ordinary flex throughout                   | Already active; no width-animation completion gate.                              |
| Entering width crosses 28 px or the icon width            | Fixed destination capacity, right anchored | Crossing a size threshold does not release the slot.                             |
| Entering width spring completes                           | Fixed capacity until that completion       | Clear basis/shrink overrides, even if the leading gap is still moving.           |
| Resize, initial mount, or reduced-motion immediate update | Final geometry                             | Release entrance overrides immediately.                                          |
| Entering value is inactive and already equals its target  | Final geometry with no width spring needed | Release without waiting for a nonexistent completion event.                      |
| Exiting tab collapses                                     | Captured actual capacity, right anchored   | Keep the snapshot until removal; an obsolete entry completion cannot release it. |
| Retained exiting ID becomes present again                 | Ordinary flex                              | Release exit overrides on the presence transition.                               |

The 28 px default basis describes ordinary flex capacity, not a timer or an entrance-phase switch.
After a genuine width completion, a destination below that basis uses the shrinking close capacity
and centered X immediately. Gap completion only affects footprint removal during exit, not this entry
handoff. [Completion ownership](./spring-lifecycle.md) keeps old width completions from releasing a
replacement animation's slot prematurely.

## Exit freezes the current slot

When presence becomes false, the hook measures the close slot's actual rectangle once and freezes
that width, including an already compressed slot smaller than 28 px. The tab's outer width then
collapses and clips this slot instead of repeatedly shrinking/recentering it during exit.

This snapshot is current rendered close-slot geometry, unlike the destination widths used to budget
surviving tabs. If an entering tab closes, its current fixed slot becomes the exit slot. Entry completion
must not release an exiting slot, so the hook tracks `entering`, `present`, and `exiting` phases.
If the same retained ID becomes present again, ordinary flex ownership is restored. Unmount cleanup
unsubscribes completion listeners and removes overrides.

The close button stays in normal flow. This requires no absolute overlay, second X, per-frame React
state, or duplicated pixel basis in JavaScript.

## The fixed slot remains anchored on the right

Freezing width is insufficient: with default flex-start alignment, the close slot follows the tab's
right edge only while the title has positive width. Once the title reaches zero and the tab becomes
narrower than the frozen close slot, that slot would stay at the tab's left edge instead.

The outer tab therefore uses `justify-end`. When flex items fit, the expanding title consumes the
remaining space and the layout is unchanged. When a frozen slot overflows, flex-end applies the
negative free space on the left, keeping the close slot's right edge equal to the tab's right edge.
Outer clipping removes the portion extending beyond the left boundary. The X retains its inset from
that moving right edge through the entire entrance or exit; “anchored” is relative to the tab, not a
fixed page coordinate. Ordinary compression still shrinks the slot to fit and centers X normally.

This avoids a second behavior switch at the close-basis threshold and needs no negative-width title,
per-frame margin calculation, or transform correction. Browser samples crossing 28 px during exit
and a roughly 9.91 px tiny entrance confirmed zero close-slot right-edge offset in the sampled frames.

Implementation: [AnimatedTab](../animated-tab.tsx), [close-layout hook](../use-tab-close-layout.ts), and
[footprint dispatch](../use-tab-footprint.ts). Current evidence for actual flex geometry and fixed
entry/exit slots is browser probing, not a dedicated automated hook test; see
[verification](./verification.md).

[Architecture index](../README.md)
