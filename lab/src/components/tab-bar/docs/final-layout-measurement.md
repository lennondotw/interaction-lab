# Final layout measurement

All affected tabs need their destinations before any of them starts moving. Measuring the visible
animated row would make a new zero-width tab or an exiting tab change the next measurement, creating
feedback between animation and layout.

## An independent CSS destination

[TabSizingRow](../tab-sizing-row.tsx) contains one placeholder per logical tab and a final add-button
placeholder. It is invisible, absolute, noninteractive, and hidden from accessibility. It occupies the
same available width as the visible row but excludes tabs retained only for exit by AnimatePresence.

The CSS tokens are intentional:

| Element                | Declaration                   | Default CSS pixels              |
| ---------------------- | ----------------------------- | ------------------------------- |
| Tab placeholder        | `basis-44 shrink min-w-0 h-9` | 176 px base width, 36 px height |
| Inter-item gap         | `gap-1`                       | 4 px                            |
| Add-button placeholder | `size-9 shrink-0`             | 36 × 36 px                      |
| Outer fieldset padding | `p-1`                         | 4 px per side                   |

These are CSS sizing contracts, not title measurements. Long and short titles have the same tab base
width. Explicit `min-w-0` permits tabs to shrink below the close-button basis; fixed gaps and the add
button do not shrink. Defaults above assume the repository's current spacing scale. The controller
reads computed sizes rather than duplicating those pixel constants in JavaScript.

For `n > 0`, equal-base flex sizing is approximately
`min(base, (available - addWidth - n * gap) / n)`. The browser determines actual fractional widths;
the formula explains the budget, not a replacement layout implementation. There are `n - 1` gaps
between tabs and one before the add button. An empty row has only the add button and no leading gap.
At widths below the fixed gap/add budget, this component has no special scrolling or overflow policy.

## Read destinations, then update footprints

[readTabTargets](../tab-layout-measurement.ts) reads the row width, column gap, and every placeholder's
computed width. [useTabLayout](../use-tab-layout.ts) resolves held-width caps and publishes all width/gap
targets in the same layout pass. Changed springs start together in the next Motion `preRender` phase,
after existing animations update to that frame. Existing tabs can therefore compress while the new tab grows directly
toward its final compressed destination, without first growing to 176 px.

Child layout effects register new footprints before the parent measures. The parent measures on each
React commit and observes the independent target row with ResizeObserver. It does not observe animated
footprints to compute destinations. Initial and immediate updates also write DOM widths/margins before
paint instead of waiting for Motion's scheduled render. Frame updates use MotionValues rather than
React state.

This is an O(n) measurement/dispatch pass over mounted tabs, not a virtualized or constant-cost layout.
Repeated notifications with unchanged destinations do not restart springs; actual width changes follow
the [resize interruption policy](./animation-intent.md).

## Held widths are caps

[resolveTabWidths](../tab-target-layout.ts) takes the smaller of a natural flex destination and its held
width. New IDs inherit the first width in the held snapshot. This preserves compression when middle
closes leave free room, while still permitting every tab to compress further when another addition
fills that room. A natural-size hold can produce a natural-size new tab; insertion does not itself mean
`compressed`. An empty snapshot falls back to natural destinations.

Resize does not mutate the held snapshot. Shrinking can temporarily require smaller widths; enlarging
can recover up to the held caps until release clears them. “Natural layout” means the ordinary flex
destination under current constraints; “natural size” in the story means approximately the base width.
A naturally laid-out row can therefore be size `compressed`.

Verification: [held target-width tests](../__tests__/tab-target-layout.test.ts), including compressed
holding with available space, repeated additions, further compression, natural-size holding, and
addition after the final held tab closes. Browser measurement checks are listed in the
[verification guide](./verification.md).

[Architecture index](../README.md)
