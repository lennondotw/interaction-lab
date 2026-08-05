import { cn } from '@monorepo/utils';
import { Slot } from 'radix-ui';
import type { CSSProperties, FC, HTMLAttributes } from 'react';

/**
 * `corner-shape`'s parameter is the *log* of the curve's exponent: the corner is
 * `|x/r|ⁿ + |y/r|ⁿ = 1` with `n = 2ᵏ`. So `k = 1` is `n = 2`, an ordinary circular
 * arc — which is why Chrome reports plain `round` as `superellipse(1)` — `k = 0` is
 * `n = 1`, a straight bevel, and `k` below zero scoops the corner inward. `1.6`
 * puts `n` at ≈3.03, the usual approximation of the Apple squircle.
 */
const CORNER_SHAPE_K = 1.6;
const CORNER_SHAPE = `superellipse(${CORNER_SHAPE_K})`;

/**
 * How deep a corner of exponent `n` bites toward the sharp corner, in units of the
 * radius. Setting `x = y` in `|x/r|ⁿ + |y/r|ⁿ = 1` puts the apex of the curve at
 * `r·(1 − 2^(−1/n))` on each axis; the extra `√2` of the diagonal is common to
 * every `n` and cancels out of the ratio below.
 */
const cornerDepth = (n: number): number => 1 - 2 ** (-1 / n);

/**
 * How much the radius is inflated so a smoothed corner reads at the size that was
 * asked for.
 *
 * The superellipse is confined to the same `r × r` corner box as the arc it
 * replaces, and buys its curvature continuity by hugging the sharp corner instead
 * of spreading along the edges the way Apple's and Figma's smoothing do. At
 * `n ≈ 3.03` it bites only `0.204r` deep against the arc's `0.293r`, so the same
 * `radius` reads as a visibly *smaller* corner and has to be paid back — which is
 * the whole reason this constant exists.
 *
 * Derived rather than written down. It comes to ≈1.4334, where the 1.5 this was
 * ported with overshot by ~4.6%; deriving it also means moving `CORNER_SHAPE_K`
 * cannot leave behind a compensation belonging to a curve that is no longer drawn.
 * Confirmed against the rendered geometry — hit-testing the diagonal in Chrome at
 * `r = 100` finds the boundary at 40.72px for the arc and 28.21px for the
 * superellipse, a ratio of 1.443 against the predicted 1.4334.
 *
 * See `archive/2026-07-corner-shape-superellipse`.
 */
const CORNER_RADIUS_COMPENSATION = cornerDepth(2) / cornerDepth(2 ** CORNER_SHAPE_K);

/**
 * The compensation is carried as a custom property and applied by CSS, not by the
 * arithmetic above. JS owns the number; an `@supports` variant on the class list
 * owns whether it is used at all, and the radius is emitted as `calc()` against
 * the result.
 *
 * That split is what ties the compensation to the thing it compensates for. A
 * browser without `corner-shape` drops the superellipse but would happily keep an
 * inflated radius, leaving a plain circular corner 43% larger than the one asked
 * for — so the factor has to be gated by the same condition that decides whether
 * the superellipse is drawn, and that condition only exists in CSS. The `var()`
 * fallback of `1` is the unsupported path: no shape, no compensation.
 */
const COMPENSATION_VAR = '--rounded-outlined-container-radius-compensation';
const RADIUS_SCALE_VAR = '--rounded-outlined-container-radius-scale';

export interface RoundedOutlinedContainerProps extends HTMLAttributes<HTMLElement> {
  /**
   * Merge the container's classes and corner styles onto the single child
   * element instead of wrapping it in a `div`. Use it when the child already is
   * the right element — a `section`, `button`, `article` — so the surface does
   * not cost an extra node.
   */
  asChild?: boolean;
  /**
   * Cut the corners as a superellipse rather than a circular arc, and scale
   * `radius` so the corner still reads at the size that was asked for.
   *
   * Not compatible with a circle or a pill, and not by omission: a superellipse of
   * exponent `n ≠ 2` is not a circle, so once `radius` is large enough to consume
   * the straight edges the whole outline becomes the curve and the shape is a
   * squircle. Leave this off for `50%` and `9999px`.
   */
  cornerSmoothing?: boolean;
  /**
   * Any `border-radius` value, including the multi-corner shorthands:
   * `24`, `'50%'`, `'9999px'`, `'48px 8px 32px 4px'`. Omit it and the corners
   * are square unless `className` sets its own `rounded-*`.
   */
  radius?: CSSProperties['borderRadius'];
}

/**
 * A rounded surface in three layers: fill at the back, content in the middle,
 * hairline edge on top.
 *
 * Those layers are the element's own paint steps rather than three nodes. CSS
 * paints an element's background first, then all of its descendants, then its
 * own outline last — so `background` and `outline` on this one element already
 * *are* the back and top layers, with the children sandwiched between them.
 * `isolation: isolate` makes the surface a stacking context, which is what turns
 * "the outline paints above the content" from usually-true into guaranteed: a
 * child cannot escape upward with a `z-index` of its own.
 *
 * That is worth the explanation because the obvious alternative — an
 * `absolute inset-0` overlay carrying the border, the way a non-scrolling
 * surface can afford to — breaks the moment this container scrolls. An absolutely
 * positioned child of a scroll container is part of its scrollable content and
 * slides away on the first wheel tick. The element's own outline is fixed to its
 * border box and is not clipped by its own `overflow`, so it survives being a
 * scroller. An overlay is also a second place for the radius to be declared, and
 * a second place for it to disagree.
 *
 * The edge is an `outline` with a negative offset rather than a `border` for the
 * same reason: a `border` occupies layout, so adding one shifts every child by a
 * pixel and has to be paid back out of the padding. The outline paints in that
 * same pixel and costs no layout at all.
 *
 * @example
 * ```tsx
 * <RoundedOutlinedContainer cornerSmoothing radius={24} className="size-40" />
 * ```
 */
export const RoundedOutlinedContainer: FC<RoundedOutlinedContainerProps> = ({
  asChild = false,
  children,
  className,
  cornerSmoothing = false,
  radius,
  style,
  ...props
}) => {
  const Component = asChild ? Slot.Root : 'div';

  return (
    <Component
      className={cn(
        `
          relative isolate bg-white outline-1 -outline-offset-1 outline-black/10
          [corner-shape:var(--rounded-outlined-container-corner-shape)]
          supports-[corner-shape:superellipse(1.6)]:[--rounded-outlined-container-radius-scale:var(--rounded-outlined-container-radius-compensation)]
          dark:bg-white/10 dark:outline-white/20
        `,
        className
      )}
      data-slot="rounded-outlined-container"
      style={{ ...style, ...getCornerStyle({ cornerSmoothing, radius }) }}
      {...props}
    >
      {children}
    </Component>
  );
};

type CornerStyle = CSSProperties & {
  '--rounded-outlined-container-corner-shape'?: string;
  '--rounded-outlined-container-radius-compensation'?: number;
};

const getCornerStyle = ({
  cornerSmoothing,
  radius,
}: {
  cornerSmoothing: boolean;
  radius?: CSSProperties['borderRadius'];
}): CornerStyle | undefined => {
  // Both left unset when smoothing is off. `corner-shape: var(--…)` with nothing
  // behind it is invalid at computed-value time, which falls back to `round`; and
  // an unset compensation makes the scale variable resolve to its `1` fallback,
  // so an unsmoothed radius cannot pick up a factor meant for a curve it is not
  // being drawn with.
  const shape = cornerSmoothing
    ? {
        [COMPENSATION_VAR]: CORNER_RADIUS_COMPENSATION,
        '--rounded-outlined-container-corner-shape': CORNER_SHAPE,
      }
    : undefined;

  if (radius === undefined) return shape;

  const normalized = normalizeRadius(radius);

  return { ...shape, borderRadius: cornerSmoothing ? scaleCornerRadius(normalized) : normalized };
};

const BARE_NUMBER = /^-?\d*\.?\d+$/;

/**
 * A unitless number means px, matching what React does for a numeric
 * `borderRadius`. Handing back the number rather than the string is what gets it
 * that treatment: `'24'` on its own is not a length and CSS drops the
 * declaration, which is easy to hit from a text field.
 */
const normalizeRadius = (radius: CSSProperties['borderRadius']): CSSProperties['borderRadius'] => {
  if (typeof radius !== 'string') return radius;
  const trimmed = radius.trim();
  return BARE_NUMBER.test(trimmed) ? Number(trimmed) : radius;
};

/** Absolute lengths scale; anything else is returned untouched. */
const SCALABLE_LENGTH = /^(-?\d*\.?\d+)(px|rem|em)$/;

/** Multiplies one length by the scale factor, deferring the factor to CSS. */
const scaled = (length: string): string => `calc(${length} * var(${RADIUS_SCALE_VAR}, 1))`;

/**
 * Scales every length in a `border-radius`, including the multi-corner
 * shorthands — `8px 24px`, `48px 8px 32px 4px`, `10px 20px / 30px 40px`. The
 * `/` separator and any token that is not an absolute length fall through
 * unchanged, which is what keeps `50%` a circle: it already means "half of this
 * box", and scaling it past 50% would stop resolving to one.
 */
const scaleCornerRadius = (radius: CSSProperties['borderRadius']): CSSProperties['borderRadius'] => {
  if (typeof radius === 'number') return scaled(`${radius}px`);
  if (typeof radius !== 'string') return radius;

  return radius
    .trim()
    .split(/\s+/)
    .map((token) => (SCALABLE_LENGTH.test(token) ? scaled(token) : token))
    .join(' ');
};
