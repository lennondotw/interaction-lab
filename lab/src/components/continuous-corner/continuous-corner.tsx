import { FC, useMemo } from 'react';
import {
  ContinuousShapeBorder,
  ContinuousShapeCommonProps,
  cssShapeStyle,
  ResolvedShape,
  useBorderBoxSize,
} from './shape-css.js';
import { ContinuousShapeShell } from './shape-shell.js';
import { RadiusInput, resolveRadii, squirclePath } from './squircle-path.js';

/** Kept as an alias so existing callers of the border type do not have to move. */
export type ContinuousCornerBorder = ContinuousShapeBorder;

export interface ContinuousCornerProps extends ContinuousShapeCommonProps {
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
   * and panels, and `ContinuousCapsule` or `ContinuousCircle` for the clamped shapes.
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
}

/**
 * A rounded rectangle whose corners are Apple's continuous curve, drawn from its own
 * control points rather than approximated.
 *
 * The counterpart of SwiftUI's `RoundedRectangle(cornerRadius:style:.continuous)`.
 * For the two shapes where the radius is not a free parameter, use
 * `ContinuousCapsule` and `ContinuousCircle` — they are not just this with a large
 * radius, and `ContinuousCircle` in particular is a different curve. See `SPEC.md`.
 *
 * @example
 * ```tsx
 * <ContinuousCorner radius={24} border={{ width: 1, color: 'rgb(0 0 0 / 0.1)' }} />
 * ```
 */
export const ContinuousCorner: FC<ContinuousCornerProps> = ({
  debugForceCssBaseline = false,
  debugSimulateNoCornerShapeSupport = false,
  mode = 'path',
  radius = 0,
  size,
  ...rest
}) => {
  // `css` mode never measures, and neither does the pinned baseline.
  const wantsPath = mode === 'path' && !debugForceCssBaseline;
  const observed = size === undefined;
  const [ref, measured] = useBorderBoxSize(wantsPath && observed);
  const box = wantsPath ? (size ?? measured) : null;

  const radii = useMemo(() => resolveRadii(radius), [radius]);
  const smoothed = mode === 'css' && !debugForceCssBaseline;

  const shape: ResolvedShape = useMemo(
    () =>
      box
        ? { kind: 'path', path: squirclePath({ width: box.width, height: box.height, radii }), size: box }
        : { kind: 'css', style: cssShapeStyle(radii, smoothed, debugSimulateNoCornerShapeSupport) },
    [box, radii, smoothed, debugSimulateNoCornerShapeSupport]
  );

  return (
    <ContinuousShapeShell
      {...rest}
      rootRef={ref}
      shape={shape}
      shapeKind={shape.kind === 'path' ? 'path' : smoothed && !debugSimulateNoCornerShapeSupport ? 'css' : 'baseline'}
      sizing={observed ? 'observed' : 'fixed'}
    />
  );
};
