import { CSSProperties, HTMLAttributes, ReactNode, RefObject, useLayoutEffect, useRef, useState } from 'react';
import { CornerRadii } from './squircle-path.js';

/**
 * The `superellipse(k)` that best fits Apple's curve, and the radius scale it needs.
 * Fitted in `archive/2026-08-corner-shape-vs-apple` to **0.0031r** — 0.07px at
 * `r = 24`. Note that `k` is 1.3844 rather than the 1.6 usually quoted, and the
 * scale is 1.2409 rather than the 1.4330 that matches corner *depth*: fitting a
 * whole curve and fitting its apex are different objectives.
 */
export const CSS_SHAPE_K = 1.3844;
export const CSS_SHAPE_RADIUS_SCALE = 1.2409;

export interface ContinuousShapeBorder {
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

export interface Size {
  width: number;
  height: number;
}

/** Everything the three shapes have in common — that is, everything but the shape. */
export interface ContinuousShapeCommonProps extends HTMLAttributes<HTMLElement> {
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
  border?: ContinuousShapeBorder;
  asChild?: boolean;
  children?: ReactNode;
}

export type ShapeStyle = CSSProperties & {
  '--continuous-corner-shape'?: string;
  '--continuous-corner-radius-compensation'?: number;
  '--continuous-corner-radius-scale'?: number;
};

/**
 * Measures the border box. `contentRect` is the wrong box here — the outline spans
 * the whole element, padding and border included — so `borderBoxSize` is read
 * first and `offsetWidth` is only the fallback.
 */
export const useBorderBoxSize = (enabled: boolean): [RefObject<HTMLDivElement | null>, Size | null] => {
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

/**
 * The CSS-only shape, used as the pre-measurement baseline, as `css` mode, and as
 * the whole implementation of `ContinuousCircle`.
 *
 * Unsmoothed it is a plain `border-radius` at the radius asked for, which is
 * **0.0138r** from Apple's curve — 0.33px at `r = 24` — and, far more usefully,
 * **exact at the clamp**: `border-radius` clamps to a true pill or circle on its
 * own, which is precisely where Apple's curve is the arc.
 *
 * Smoothed, it adds the fitted `superellipse` and scales the radius to match. The
 * scale is emitted as `calc()` against a custom property that only an
 * `@supports (corner-shape: …)` rule sets, never as a plain multiplication. Without
 * `corner-shape` a baked-in scale would draw a plain circular arc **24% too large**;
 * gated, the same declaration degrades exactly onto the unsmoothed baseline.
 */
export const cssShapeStyle = (radii: CornerRadii, smoothed: boolean, simulateNoCornerShape = false): ShapeStyle => {
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
export const OUTLINE_OFFSET = {
  inner: (width: number) => -width,
  center: (width: number) => -width / 2,
  outer: () => 0,
} as const;

/**
 * A shape resolved to something drawable: either an exact SVG path, which needs the
 * box, or a CSS shape, which does not.
 */
export type ResolvedShape = { kind: 'path'; path: string; size: Size } | { kind: 'css'; style: ShapeStyle };
