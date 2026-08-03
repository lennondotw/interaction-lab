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
import { CornerRadii, RadiusInput, resolveRadii, squirclePath } from './squircle-path.js';

/**
 * The `superellipse(k)` that best fits Apple's curve, and the radius scale it needs.
 * Fitted in `archive/2026-08-corner-shape-vs-apple` to **0.0031r** — 0.07px at
 * `r = 24`. Note that `k` is 1.3844 rather than the 1.6 usually quoted, and the
 * scale is 1.2409 rather than the 1.4330 that matches corner *depth*: fitting a
 * whole curve and fitting its apex are different objectives.
 */
const CSS_SHAPE_K = 1.3844;
const CSS_SHAPE_RADIUS_SCALE = 1.2409;

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
  /**
   * How the shape is drawn.
   *
   * `path` (default) generates Apple's curve exactly and needs the box measured.
   * `css` uses `border-radius` plus `corner-shape` instead, which is **0.0031r**
   * from Apple's curve — 0.07px at `r = 24` — and costs no measurement, no extra
   * layer, and no per-frame path. It composes with the rest of CSS for free.
   *
   * `css` is only that close **below the clamp**. `corner-shape` has no edge budget
   * to run out of, so it never degrades: on a pill it keeps bulging where Apple
   * flattens onto an arc, and the gap becomes 12.5% of the radius. Use `css` when
   * the radius is comfortably under 65% of half the short side, which is most cards
   * and panels, and `path` for anything pill- or circle-shaped.
   */
  mode?: 'path' | 'css';
  /**
   * Hold the pre-measurement baseline instead of ever upgrading to the real path,
   * so the first frame can actually be looked at. Debug only.
   */
  debugForceCssBaseline?: boolean;
  /**
   * Render `css` mode as a browser without `corner-shape` would — Safari and
   * Firefox today. The radius scale is pinned to 1 and the superellipse dropped, so
   * the shape falls back onto the plain-`border-radius` baseline. Debug only.
   */
  debugSimulateNoCornerShapeSupport?: boolean;
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

type ShapeStyle = CSSProperties & {
  '--continuous-corner-shape'?: string;
  '--continuous-corner-radius-compensation'?: number;
  '--continuous-corner-radius-scale'?: number;
};

/**
 * The CSS-only shape, used both as the pre-measurement baseline and as `css` mode.
 *
 * Unsmoothed it is a plain `border-radius` at the radius asked for, which is
 * **0.0138r** from Apple's curve — 0.33px at `r = 24` — and, far more usefully,
 * **exact at the clamp**: `border-radius` clamps to a true pill or circle on its
 * own, which is precisely where Apple's curve is the arc. So the baseline is never
 * the wrong silhouette, only a slightly less smooth one, and it needs no knowledge
 * of the box to be safe. That is why the baseline does not use `corner-shape`, which
 * would be four times closer below the clamp and 12.5% wrong at it.
 *
 * Smoothed, it adds the fitted `superellipse` and scales the radius to match.
 *
 * The scale is emitted as `calc()` against a custom property that only an
 * `@supports (corner-shape: …)` rule sets, never as a plain multiplication. Without
 * `corner-shape` — Safari and Firefox today — a baked-in scale would draw a plain
 * circular arc **24% too large**, which is a worse corner than not trying. Gated,
 * the same declaration degrades exactly onto the unsmoothed baseline instead: the
 * radius that was asked for, 0.0138r from Apple. Compensation and the thing it
 * compensates for can only appear together.
 */
const cssShapeStyle = (radii: CornerRadii, smoothed: boolean, simulateNoCornerShape = false): ShapeStyle => {
  const scaled = (value: number) =>
    smoothed ? `calc(${value}px * var(--continuous-corner-radius-scale, 1))` : `${value}px`;
  return {
    borderRadius: [radii.topLeft, radii.topRight, radii.bottomRight, radii.bottomLeft].map(scaled).join(' '),
    // Written through custom properties because React will not set an unknown
    // longhand like `corner-shape` from a style object. JS owns both numbers; the
    // `@supports` rule on the class list owns whether the compensation applies.
    ...(smoothed && !simulateNoCornerShape
      ? {
          '--continuous-corner-shape': `superellipse(${CSS_SHAPE_K})`,
          '--continuous-corner-radius-compensation': CSS_SHAPE_RADIUS_SCALE,
        }
      : {}),
    // Inline beats the `@supports` class, so pinning the scale to 1 reproduces
    // exactly what a browser without `corner-shape` renders.
    ...(simulateNoCornerShape ? { '--continuous-corner-radius-scale': 1 } : {}),
  };
};

/** Where the stroke sits, as an `outline-offset`. Outlines follow `corner-shape`. */
const OUTLINE_OFFSET = {
  inner: (width: number) => -width,
  center: (width: number) => -width / 2,
  outer: () => 0,
} as const;

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
  debugForceCssBaseline = false,
  debugSimulateNoCornerShapeSupport = false,
  mode = 'path',
  radius = 0,
  size,
  style,
  surfaceClassName,
  ...props
}) => {
  // `css` mode never measures, and neither does the pinned baseline.
  const wantsPath = mode === 'path' && !debugForceCssBaseline;
  const observed = size === undefined;
  const [ref, measured] = useBorderBoxSize(wantsPath && observed);
  const resolved = wantsPath ? (size ?? measured) : null;

  const radii = useMemo(() => resolveRadii(radius), [radius]);
  const path = useMemo(
    () => (resolved ? squirclePath({ width: resolved.width, height: resolved.height, radii }) : ''),
    [resolved, radii]
  );

  // Until there is a path — first paint, `css` mode, or the pinned baseline — the
  // shape is CSS. Both fall out of the same helper; only `smoothed` differs.
  const usingPath = Boolean(path);
  const smoothed = mode === 'css' && !debugForceCssBaseline;
  const shape: ShapeStyle = usingPath
    ? { clipPath: `path("${path}")` }
    : cssShapeStyle(radii, smoothed, debugSimulateNoCornerShapeSupport);

  // A CSS shape carries its border as an `outline`, which follows `border-radius`
  // and `corner-shape` and costs no layout — so `css` mode needs no SVG at all, and
  // gets all three alignments from `outline-offset`.
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
      ref={ref}
      className={cn(
        `
          relative isolate
          [corner-shape:var(--continuous-corner-shape)]
          supports-[corner-shape:squircle]:[--continuous-corner-radius-scale:var(--continuous-corner-radius-compensation)]
        `,
        className
      )}
      data-slot="continuous-corner"
      data-shape={usingPath ? 'path' : smoothed && !debugSimulateNoCornerShapeSupport ? 'css' : 'baseline'}
      data-sizing={observed ? 'observed' : 'fixed'}
      // The root carries the radius only to give the outline something to follow;
      // it never clips, so the border can still paint outside the outline.
      style={{ ...style, ...(usingPath ? {} : shape), ...cssBorder }}
      {...props}
    >
      <div
        aria-hidden="true"
        className={cn(
          `
            absolute inset-0 -z-10
            [corner-shape:var(--continuous-corner-shape)]
          `,
          surfaceClassName
        )}
        style={shape}
        data-slot="fill"
      />
      {clipContent ? (
        // `size-full` is load-bearing: the clip path is expressed in the root's
        // coordinates, so a wrapper that shrink-wrapped its children would apply
        // the right shape at the wrong offset and cut into the content. Against an
        // auto-height root `height: 100%` resolves to `auto`, so this fills a
        // definite root and still grows with content in an indefinite one.
        //
        // A CSS shape needs `overflow-hidden` to clip at all; a `clip-path` already
        // does, and adding overflow there would make the content box a scroll
        // container for no reason.
        <div
          className={cn(
            `
              size-full
              [corner-shape:var(--continuous-corner-shape)]
            `,
            !usingPath && 'overflow-hidden',
            contentClassName
          )}
          style={shape}
          data-slot="content"
        >
          {children}
        </div>
      ) : (
        children
      )}
      {border && usingPath && resolved ? <Edge size={resolved} path={path} border={border} /> : null}
    </Component>
  );
};
