# Close-button geometry

Ordinary compression shrinks the title first, then the close capacity with a centered X. Entry and
exit instead reveal/clip a fixed capacity anchored to the tab's right edge. The refactor makes this
capacity explicit while preserving the settled and presence layout rules.

## Ordinary compression

[createTabCloseCapacity](../tab-close-capacity.ts) derives `min(CSS close basis, current tab width)`.
The title is `flex-1 min-w-0 overflow-hidden`; the close presentation is centered and `shrink-0` with
that numeric width. These two values reproduce the former flex-shrink allocation:

| Available width | Title           | Close capacity      |
| --------------- | --------------- | ------------------- |
| Above basis     | Remaining width | Basis               |
| At basis        | Zero            | Basis               |
| Below basis     | Zero            | Available tab width |

The basis is measured from the sizing row's `basis-7` probe, normally 28 px. The X stays 14 px and
`shrink-0`, with a 1.5 px stroke. Below 14 px it is clipped symmetrically by the outer tab rather than
deformed. Neither title nor close capacity introduces a min-content floor. The title still uses flex
for remaining space; numeric capacity replaces implicit close-slot shrink so geometry is available
to input without measuring a partially animated button.

## Entry owns destination capacity

An entering tab keeps `min(basis, final tab width)`, even when its footprint is zero. Retargeting entry
updates that frozen capacity from the new destination. Width completion restores ordinary capacity;
crossing the basis/icon threshold or completing the gap does not. Immediate mount, resize, and
reduced-motion dispatch also end entry. An inactive width already at its destination needs no
completion event. Obsolete spring completions cannot release the current owner.

## Exit owns current capacity

Logical removal freezes the current **numeric capacity**, including ordinary compression below the
basis or a still-frozen entering slot. No close DOM measurement or inline flex override is needed.
The width/gap springs collapse while the capacity remains fixed until unmount. An entry completion
cannot release it once phase is exiting. A retained ID becoming present again returns to ordinary
capacity. Effect cleanup removes width/completion subscriptions.

| Transition                   | Result                              |
| ---------------------------- | ----------------------------------- |
| Present width changes        | Derive capacity from current width  |
| Entering destination changes | Freeze the new destination capacity |
| Entering width completes     | Resume ordinary capacity            |
| Immediate layout             | End entry and use final capacity    |
| Presence becomes false       | Freeze current capacity             |
| Retained ID returns          | Resume ordinary capacity            |

## The right edge stays anchored

The outer tab uses `justify-end`. While a title has positive width it consumes remaining space.
After title width reaches zero, a fixed capacity larger than the outer width overflows **left**;
its right edge remains equal to the tab's right edge. Clipping removes the left overflow throughout
entry/exit. This avoids switching to left-edge anchoring halfway through a collapse. “Anchored” is
relative to the moving tab, not to a fixed page coordinate.

Ordinary capacity fits the tab and keeps X centered. Entry returns to this centered behavior only
at its lifecycle handoff, not at a pixel threshold. No close spring, transform correction, or
per-frame React geometry state is added. Both final semantic close width and the painted input alias
use [the numeric model](./numeric-geometry.md); the alias is clipped, not the full frozen slot.

Evidence: [capacity tests](../__tests__/tab-close-capacity.test.ts) cover entry retarget, owned
completion, tiny exit, entry-to-exit, immediate resize, zero entry, and revived identity.
[Geometry tests](../__tests__/tab-geometry.test.ts) cover the clipped input bounds.
October 8 browser probes found a 10.25 px ordinary tab with title width zero and zero X-center offset;
its exit retained 10.25 px capacity at a 9.40 px footprint with zero right-edge offset. A tiny entrance
had 10.25 px target capacity at a 0.95 px footprint, also right anchored. See
[verification](./verification.md) for repeatable checks and evidence limits.

[Architecture index](../README.md)
