import { cn } from '@monorepo/utils';
import { Slot } from 'radix-ui';
import { CSSProperties, FC, Ref, useId } from 'react';
import { ContinuousShapeBorder, ContinuousShapeCommonProps, OUTLINE_OFFSET, ResolvedShape, Size } from './shape-css.js';

const Edge: FC<{ size: Size; path: string; border: ContinuousShapeBorder }> = ({ size, path, border }) => {
  const id = useId();
  const align = border.align ?? 'inner';
  // An inner or outer border of width w is the inside or outside half of a 2w
  // stroke laid on the outline itself. Exact for any width, and it never needs an
  // offset curve.
  const strokeWidth = align === 'center' ? border.width : border.width * 2;
  // Anything but a purely inward stroke paints outside the element's box, and the
  // SVG viewport would clip it there — visibly, as flat chords across the corners.
  const reach = align === 'inner' ? 0 : align === 'center' ? border.width / 2 : border.width;
  // Plus a pixel. At exactly `reach` the stroke's outermost antialiased row lands on
  // the viewport boundary and gets sliced, which reads as the border being shaved
  // flat down the left and right sides.
  const bleed = reach > 0 ? Math.ceil(reach) + 1 : 0;
  const viewWidth = size.width + bleed * 2;
  const viewHeight = size.height + bleed * 2;

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={{ inset: -bleed }}
      width={viewWidth}
      height={viewHeight}
      viewBox={`${-bleed} ${-bleed} ${viewWidth} ${viewHeight}`}
      shapeRendering="geometricPrecision"
    >
      {align === 'inner' && (
        <clipPath id={`${id}-inside`}>
          <path d={path} />
        </clipPath>
      )}
      {align === 'outer' && (
        <mask id={`${id}-outside`}>
          <rect x={-bleed} y={-bleed} width={viewWidth} height={viewHeight} fill="white" />
          <path d={path} fill="black" />
        </mask>
      )}
      <path
        d={path}
        fill="none"
        stroke={border.color}
        strokeWidth={strokeWidth}
        clipPath={align === 'inner' ? `url(#${id}-inside)` : undefined}
        mask={align === 'outer' ? `url(#${id}-outside)` : undefined}
      />
    </svg>
  );
};

/**
 * The layered surface every continuous shape is built from. The three public
 * components differ only in how they resolve their shape; everything below — the
 * layer order, the border alignments, the clip, `asChild` — is here once.
 *
 * The **fill** is a shaped element rather than an SVG `<path fill>` because
 * `backdrop-filter` cannot be applied to an SVG path; putting the shape on a real
 * element is what keeps `background`, `backdrop-filter` and `box-shadow: inset` all
 * following the outline for free. The **border** is SVG when there is a path,
 * because no CSS border can take that shape, and an `outline` with a negative offset
 * when the shape is CSS, because outlines follow `border-radius` and `corner-shape`.
 * The **root** stays a pure layout box: unclipped, so the border can draw outside
 * the outline, and never the scroller — an `absolute inset-0` layer is part of a
 * scroll container's content and would slide away, so nest a scroller inside rather
 * than putting `overflow` here.
 *
 * ⚠️ **Do not put padding on the root.** A path is measured from the root's border
 * box, while the fill layer's `inset-0` and the content wrapper both resolve against
 * its padding box — so padding here offsets the outline from the shape it is
 * supposed to be. Put padding on `contentClassName`.
 */
export const ContinuousShapeShell: FC<
  ContinuousShapeCommonProps & {
    shape: ResolvedShape;
    /** Reported as `data-shape`, so a probe can tell which route rendered. */
    shapeKind: string;
    sizing?: 'observed' | 'fixed' | 'none';
    rootRef?: Ref<HTMLDivElement | null>;
  }
> = ({
  asChild = false,
  border,
  children,
  className,
  clipContent = true,
  contentClassName,
  rootRef,
  shape,
  shapeKind,
  sizing = 'none',
  style,
  surfaceClassName,
  ...props
}) => {
  const usingPath = shape.kind === 'path';
  const shapeStyle: CSSProperties = usingPath ? { clipPath: `path("${shape.path}")` } : shape.style;

  const cssBorder: CSSProperties =
    !usingPath && border
      ? {
          outline: `${border.width}px solid ${border.color}`,
          outlineOffset: OUTLINE_OFFSET[border.align ?? 'inner'](border.width),
        }
      : {};

  const Component = asChild ? Slot.Root : 'div';

  return (
    <Component
      ref={rootRef}
      className={cn(
        `
          relative isolate [corner-shape:var(--continuous-corner-shape)]
          supports-[corner-shape:squircle]:[--continuous-corner-radius-scale:var(--continuous-corner-radius-compensation)]
        `,
        className
      )}
      data-slot="continuous-corner"
      data-shape={shapeKind}
      data-sizing={sizing}
      // The root carries a CSS radius only to give the outline something to follow;
      // it never clips, so the border can still paint outside the outline.
      style={{ ...style, ...(usingPath ? {} : shapeStyle), ...cssBorder }}
      {...props}
    >
      <div
        aria-hidden="true"
        className={cn(`absolute inset-0 -z-10 [corner-shape:var(--continuous-corner-shape)]`, surfaceClassName)}
        style={shapeStyle}
        data-slot="fill"
      />
      {clipContent ? (
        // `size-full` is load-bearing: the clip path is expressed in the root's
        // coordinates, so a wrapper that shrink-wrapped its children would apply the
        // right shape at the wrong offset and cut into the content. Against an
        // auto-height root `height: 100%` resolves to `auto`, so this fills a
        // definite root and still grows with content in an indefinite one.
        //
        // A CSS shape needs `overflow-hidden` to clip at all; a `clip-path` already
        // does, and adding overflow there would make the content box a scroll
        // container for no reason.
        <div
          className={cn(
            `size-full [corner-shape:var(--continuous-corner-shape)]`,
            !usingPath && 'overflow-hidden',
            contentClassName
          )}
          style={shapeStyle}
          data-slot="content"
        >
          {children}
        </div>
      ) : (
        children
      )}
      {border && shape.kind === 'path' ? <Edge size={shape.size} path={shape.path} border={border} /> : null}
    </Component>
  );
};
