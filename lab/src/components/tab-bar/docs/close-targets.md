# Preserving close targets

Repeated pointer closes should leave the next close button near the same horizontal location. The
layout policy preserves tab right edges during a hover hold, subject to each tab's base-size cap.

## Close from intended destination widths

[useTabLayout](../use-tab-layout.ts) reads each footprint's `getTargetWidth()` before invoking the host's
`onClose`. It does not build the next budget from a partly entered or partly compressed animation
frame. This makes consecutive close decisions depend on intended layout rather than timing.

[closeTabWidths](../tab-close-layout.ts) handles the two geometries:

| Closing position            | Survivor destinations                                             | Result                                                                  |
| --------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| A tab with a right neighbor | Preserve every survivor's individual width                        | The neighbor moves into the closed tab's position.                      |
| Last tab, with survivors    | Redistribute the old tab-strip span equally, capped at base width | The last remaining tab retains the old tail edge while the cap permits. |
| Only tab                    | No survivor width                                                 | Collapse the tab and its gap; leave the add button.                     |

For equal-width tabs, a right neighbor's right edge lands at the closed tab's previous right edge.
Fractional flex rounding can make individual widths differ slightly; preserving those individual
widths is the contract, not subpixel equality for unequal neighbors.

## Tail redistribution includes internal gaps

Let `n` be the old count, `m = n - 1`, and `g` the gap. The old tab span is
`sum(widths) + (n - 1) * g`. For a nonempty survivor list, each tail-close destination is
`min(base, (oldSpan - (m - 1) * g) / m)`.

For example, eight 80 px tabs with 4 px gaps occupy 668 px. Closing the tail leaves seven 92 px tabs,
still occupying 668 px. Repeated tail closes preserve that span until the 176 px default base cap
prevents further expansion. The strip then becomes shorter; preserving the pointer location cannot
override the maximum base size.

The add button and its leading gap are excluded from the preserved tab span. They follow the tabs in
flow, with the add gap disappearing only when the logical tab count reaches zero.

## Holding determines whether to keep the budget

The close path stores the computed survivor widths only while the hover controller is `holding` or
`waiting`. In `natural`, it clears the held map and lets the post-close sizing row determine natural
destinations. A keyboard close outside the region therefore does not invent a cursor-preserving hold.

Later operations use the held destination budget, including a tail close after a middle close.
Available container space can still require smaller widths through the final held/natural minimum.
Rapid retargets preserve animation velocity, so this policy describes destinations rather than
promising that an intermediate moving edge remains exactly stationary at every frame.

Verification: [close-layout tests](../__tests__/tab-close-layout.test.ts) cover right-neighbor positions,
individual fractional widths, tail redistribution, repeated tail closes through the cap, mixed middle/
tail closes, and the final-tab case. [Target-width tests](../__tests__/tab-target-layout.test.ts) cover
adding into the space released by a held middle close.

[Architecture index](../README.md)
