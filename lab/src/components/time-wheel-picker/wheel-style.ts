/**
 * The wireframe language, in one place because four levels of it have to stay in
 * a legible relationship to each other.
 *
 * ## Why `outline` and not `border`
 *
 * `itemHeight` is load-bearing: the viewport is `itemHeight * rows` tall, the snap
 * detents are its multiples, and the `:` separator is a box exactly that tall. A
 * `border` on every row would add two pixels to each of them, so the row pitch
 * would stop being `itemHeight` and every one of those derivations would drift by
 * a compounding amount. `outline` contributes nothing to the box model, so the
 * wireframe is free.
 *
 * `-outline-offset-1` then pulls the stroke inside the element's own box, which
 * keeps it from being clipped away by the container's `overflow: hidden` and from
 * sharing a line with the neighbouring row's stroke.
 *
 * ## Why the band is dashed
 *
 * With the rows outlined *and* the selection band outlined, the band's stroke and
 * the selected row's stroke land within a pixel or two of each other at the centre
 * line. Two nearly-coincident semi-transparent hairlines read as a rendering
 * fault, and their alphas compound so the centre also reads darker. Dashing the
 * band — which is how the `buffered-split-layout` demos already mark a measured
 * guide as opposed to a real box — makes the overlap read as two layers instead of
 * one dirty line. Spanning the band across all the columns does the rest: its
 * verticals then sit clearly outside the rows' verticals, and only the horizontals
 * coincide.
 *
 * The alpha ladder is 15 / 20 / 40 so the hierarchy is item < frame < band, using
 * `neutral-500` with an alpha because that is what the rest of this Storybook uses
 * to be legible on both the light and the dark canvas without a `dark:` variant.
 *
 * Square corners throughout. Nothing here is rounded, so there is no concentric
 * radius to derive for the nested boxes and no corner arc for a stroke to trace.
 */

/** The picker's outer frame, and each column's. */
export const WIREFRAME_FRAME = 'outline-1 -outline-offset-1 outline-neutral-500/20';

/** Every row, including the `:` separator's row — which is the point of outlining it. */
export const WIREFRAME_ITEM = 'outline-1 -outline-offset-1 outline-neutral-500/15';

/** The selection band. Dashed, and drawn across the full width of the picker. */
export const WIREFRAME_BAND = 'outline-1 -outline-offset-1 outline-neutral-500/40 outline-dashed';

/**
 * Focus, expressed by brightening the wireframe rather than adding a ring.
 *
 * A second outline is not available — a column already spends its `outline` on
 * being a wireframe, and the UA's own `:focus-visible` ring loses to any author
 * outline, so without this a focused column would look identical to an unfocused
 * one. Changing the colour of the stroke that is already there is the only move
 * that does not either double the geometry or shift the layout.
 */
export const WIREFRAME_FOCUS = 'focus-visible:outline-neutral-500/70';
