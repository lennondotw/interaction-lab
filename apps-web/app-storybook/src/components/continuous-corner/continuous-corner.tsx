import { cn } from '@monorepo/utils';
import { Slot } from 'radix-ui';
import {
  CSSProperties,
  FC,
  HTMLAttributes,
  ReactNode,
  RefObject,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { RadiusInput, resolveRadii, squirclePath } from './squircle-path.js';

export interface ContinuousCornerBorder {
  width: number;
  color: string;
  /**
   * Where the stroke sits relative to the outline. All three are exact: an inner
   * border of width `w` is a `2w` stroke clipped to the path, not a second path
   * offset inward — see `SPEC.md` on why the offset curve of a squircle is not
   * another squircle.
   */
  align?: 'inner' | 'center' | 'outer';
}

export interface ContinuousCornerProps extends HTMLAttributes<HTMLElement> {
  /** A single radius, or any subset of the four corners. */
  radius?: RadiusInput;
  /**
   * Declare the box instead of measuring it. The path is then known during
   * render, so there is no first-paint gap and no `ResizeObserver` — at the cost
   * of the caller having to keep this in step with the real layout.
   *
   * Leave it off and the surface measures itself, which is the mode that behaves
   * like a plain `div`.
   */
  size?: { width: number; height: number };
  /**
   * Clip children to the outline. Costs one box around them, because clipping
   * needs something to clip and the root has to stay unclipped for the border
   * overlay to draw outside the outline.
   *
   * That box is forced to fill the root, since the clip path is in the root's
   * coordinates and would land in the wrong place on a box of any other size. So
   * layout for the children — `flex`, `padding`, alignment — belongs on
   * `contentClassName`, not on `className`.
   */
  clipContent?: boolean;
  contentClassName?: string;
  /**
   * Where `background`, `backdrop-filter` and any inset shadow go. **Not**
   * `className` — the root is deliberately unclipped so the border can draw
   * outside the outline, so a background there would paint as a square. This is
   * the layer the outline actually clips.
   */
  surfaceClassName?: string;
  border?: ContinuousCornerBorder;
  asChild?: boolean;
  children?: ReactNode;
}

interface Size {
  width: number;
  height: number;
}

/**
 * Measures the border box. `contentRect` is the wrong box here — the outline spans
 * the whole element, padding and border included — so `borderBoxSize` is read
 * first and `getBoundingClientRect` is only the fallback.
 */
const useBorderBoxSize = (enabled: boolean): [RefObject<HTMLDivElement | null>, Size | null] => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;

    const read = (entry?: ResizeObserverEntry) => {
      const box = entry?.borderBoxSize[0];
      const next = box
        ? { width: box.inlineSize, height: box.blockSize }
        : { width: element.offsetWidth, height: element.offsetHeight };
      // A no-op write would still re-render every observation, and resize fires
      // per frame while a drag is in flight.
      setSize((current) =>
        current && current.width === next.width && current.height === next.height ? current : next
      );
    };

    read();
    const observer = new ResizeObserver((entries) => read(entries[0]));
    observer.observe(element, { box: 'border-box' });
    return () => observer.disconnect();
  }, [enabled]);

  return [ref, size];
};

const Edge: FC<{ size: Size; path: string; border: ContinuousCornerBorder }> = ({ size, path, border }) => {
  const id = useId();
  const align = border.align ?? 'inner';
  // An inner or outer border of width w is the inside or outside half of a 2w
  // stroke laid on the outline itself. Exact for any width, and it never needs an
  // offset curve.
  const strokeWidth = align === 'center' ? border.width : border.width * 2;
  // Anything but a purely inward stroke paints outside the element's box, and the
  // SVG viewport would clip it there — visibly, as flat chords across the corners.
  const bleed = align === 'inner' ? 0 : align === 'center' ? border.width / 2 : border.width;
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
 * A surface whose corners are Apple's continuous curve, drawn from its own control
 * points rather than approximated with `corner-shape`.
 *
 * Three layers, and each is where it is for a reason. The **fill** is a
 * `clip-path`ed child rather than an SVG `<path fill>` because `backdrop-filter`
 * cannot be applied to an SVG path — putting the shape on a real element is what
 * keeps `background`, `backdrop-filter` and `box-shadow: inset` all following the
 * outline for free. The **border** is SVG, because no CSS border can take this
 * shape. The **root** stays a pure layout box: unclipped, so the border can draw
 * outside the outline, and never the scroller — an `absolute inset-0` layer is part
 * of a scroll container's content and would slide away, so nest a scroller inside
 * rather than putting `overflow` here.
 *
 * The path is absolute pixels, so it has to be regenerated whenever the box
 * changes; a squircle corner cannot be scaled non-uniformly and stay one, which is
 * why there is no `viewBox` shortcut and why `size` exists as an escape from
 * measuring.
 *
 * ⚠️ **Do not put padding on the root.** The path is measured from the root's
 * border box, while the fill layer's `inset-0` and the content wrapper both resolve
 * against its padding box — so padding here offsets the outline from the shape it
 * is supposed to be. Put padding on `contentClassName` instead, which is also where
 * it wants to be for a scroller.
 *
 * @example
 * ```tsx
 * <ContinuousCorner radius={24} border={{ width: 1, color: 'rgb(0 0 0 / 0.1)' }}>
 *   …
 * </ContinuousCorner>
 * ```
 */
export const ContinuousCorner: FC<ContinuousCornerProps> = ({
  asChild = false,
  border,
  children,
  className,
  clipContent = true,
  contentClassName,
  radius = 0,
  size,
  style,
  surfaceClassName,
  ...props
}) => {
  const observed = size === undefined;
  const [ref, measured] = useBorderBoxSize(observed);
  const resolved = size ?? measured;

  const radii = useMemo(() => resolveRadii(radius), [radius]);
  const path = useMemo(
    () => (resolved ? squirclePath({ width: resolved.width, height: resolved.height, radii }) : ''),
    [resolved, radii]
  );

  const clip: CSSProperties = path ? { clipPath: `path("${path}")` } : {};
  const Component = asChild ? Slot.Root : 'div';

  return (
    <Component
      ref={ref}
      className={cn('relative isolate', className)}
      data-slot="continuous-corner"
      data-sizing={observed ? 'observed' : 'fixed'}
      style={style}
      {...props}
    >
      <div
        aria-hidden="true"
        className={cn('absolute inset-0 -z-10', surfaceClassName)}
        style={clip}
        data-slot="fill"
      />
      {clipContent ? (
        // `size-full` is load-bearing: the clip path is expressed in the root's
        // coordinates, so a wrapper that shrink-wrapped its children would apply
        // the right shape at the wrong offset and cut into the content. Against an
        // auto-height root `height: 100%` resolves to `auto`, so this fills a
        // definite root and still grows with content in an indefinite one.
        <div className={cn('size-full', contentClassName)} style={clip} data-slot="content">
          {children}
        </div>
      ) : (
        children
      )}
      {border && resolved && path ? <Edge size={resolved} path={path} border={border} /> : null}
    </Component>
  );
};
