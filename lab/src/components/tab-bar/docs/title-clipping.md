# Title clipping and overflow mask

Overflowing titles are clipped directly, with no ellipsis. A fade at the title viewport's right edge
indicates clipped content while preserving the close button's separate geometry.

## Padding belongs inside the clipped viewport

[TabTitle](../tab-title.tsx) renders an outer block viewport with `overflow-clip whitespace-nowrap`
and an inner `inline-block px-3` containing the text. The default 12 px padding on each side belongs
to that inner content, so the viewport's clipping and mask extend to its actual edge next to the
separator. Putting padding on the outer viewport would inset the clipping edge and visibly cut the
title too early.

The title button is also `overflow-hidden` and can shrink to zero. No `text-overflow: ellipsis` or
`truncate` class inserts a three-dot marker. Full text remains available through the select button's
`aria-label` and native `title` attribute.

## Measure overflow as rendered content

A layout effect compares the inner content rectangle width, including its padding, with the viewport
rectangle width. It sets the boolean `data-overflow` attribute only when the content is wider.
ResizeObserver watches both content and viewport; changing the title reinstalls observation and runs
an initial measurement. Content/font and animated viewport changes can therefore refresh overflow.

This observation belongs to presentation. It reads current animated geometry to decide whether visible
text overflows, but never feeds a width back into the tab sizing controller. It is distinct from the
story's size/space labels, which classify final destinations.

## Conditional 20 px alpha ramp

Only `[data-overflow]` activates these Tailwind mask utilities:

```text
data-overflow:mask-r-from-[calc(100%-20px)]
data-overflow:mask-r-to-100%
data-overflow:mask-r-to-black/50
```

The last 20 px fade from fully opaque on the inward side to 50% opacity at the right edge. Content
beyond the viewport is clipped. Without overflow, no mask is applied. The mask changes title pixels
without painting a background-colored overlay, so it works with the existing wireframe surface.

The mask is scoped to the title viewport; it does not fade the separator, outer stroke, close icon,
or focus outline. Extremely narrow viewports clip the ramp along with the content; there is no special
minimum title width.

Verification is currently browser-based: compare long and short titles, inspect `data-overflow`, and
resize through the threshold while checking that padding and the clipping edge stay inside the title
slot. See the [verification guide](./verification.md) for the evidence boundary.

[Architecture index](../README.md)
