import { cn } from '@monorepo/utils';
import { Slot } from 'radix-ui';
import type { CSSProperties, FC, HTMLAttributes } from 'react';

/** The squircle the corners are cut with when `cornerSmoothing` is on. */
const CORNER_SHAPE = 'superellipse(1.6)';
/**
 * How much the radius is inflated to compensate for the superellipse, which reads
 * visibly tighter than the circular arc of the same nominal radius because it
 * spends less of the corner at full curvature. `radius={16}` should look like the
 * same size of corner whether it is smoothed or not.
 *
 * The factor lives in CSS rather than here, in an `@supports` variant on the
 * class list, and the radius is emitted as `calc()` against it. That is what ties
 * the compensation to the thing it compensates for: a browser without
 * `corner-shape` drops the superellipse but would otherwise keep the inflated
 * radius, leaving a plain circular corner 50% larger than the one asked for. The
 * `var()` fallback of `1` means the two can only fail together.
 */
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
          supports-[corner-shape:superellipse(1.6)]:[--rounded-outlined-container-radius-scale:1.5]
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
};

const getCornerStyle = ({
  cornerSmoothing,
  radius,
}: {
  cornerSmoothing: boolean;
  radius?: CSSProperties['borderRadius'];
}): CornerStyle | undefined => {
  // Left unset when smoothing is off: `corner-shape: var(--…)` with no value
  // behind it is invalid at computed-value time, which falls back to `round`.
  const shape = cornerSmoothing ? { '--rounded-outlined-container-corner-shape': CORNER_SHAPE } : undefined;

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
