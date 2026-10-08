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

## Presentation title centering

The title presentation div uses `flex items-center`; the clipping span uses `w-full min-w-0` so it
can shrink without its inner padded text imposing a min-content width. Replacing the original native
button with a block div removed the browser's automatic vertical centering: a 24 px line sat 6 px
above center in a 36 px tab. A browser comparison with the base-commit component confirmed 0 px on
the original and -6 px on the first refactor. Explicit flex centering restored 0 px while preserving
the viewport width and overflow mask. Padding remains on the inner text span.

[Architecture index](../README.md)
