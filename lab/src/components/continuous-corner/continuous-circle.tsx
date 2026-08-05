import { cn } from '@monorepo/utils';
import { FC } from 'react';

import { ContinuousShapeCommonProps } from './shape-css.js';
import { ContinuousShapeShell } from './shape-shell.js';

export interface ContinuousCircleProps extends ContinuousShapeCommonProps {
  /**
   * Let the box be non-square, giving an ellipse rather than a circle. Off by
   * default: a component called `Circle` that quietly renders an ellipse whenever its
   * parent is not square is a trap, so `aspect-ratio: 1` is enforced unless asked
   * otherwise.
   */
  allowEllipse?: boolean;
}

/**
 * A true circle.
 *
 * The one shape in this family that is **not** the squircle generator, and the reason
 * it exists as its own component rather than `ContinuousCorner` with a large radius.
 * At maximum radius the continuous rounded rectangle is not quite round: it undulates
 * 0.62%, bulging toward the four diagonals, which is why a large one reads very
 * slightly squarish. SwiftUI has exactly this split — measured radially its `Circle()`
 * is flat to 0.00% while `RoundedRectangle(.infinity, .continuous)` is not — and it is
 * the real reason Apple ships them as separate types. See `SPEC.md`.
 *
 * So this draws a real circle, which in CSS is `border-radius: 50%`: exact, and free.
 * No measurement, no `ResizeObserver`, no SVG, no path to regenerate — and because
 * outlines follow `border-radius`, all three border alignments still work.
 *
 * It differs from SwiftUI's `Circle()` in one way, deliberately. SwiftUI insets to the
 * largest circle that fits a non-square frame and leaves the rest empty; that needs a
 * second box in CSS and makes the element's own size stop meaning what it says.
 * `aspect-ratio: 1` is used instead, so the box *is* the circle. Pass `allowEllipse`
 * for the `border-radius: 50%`-on-any-box behaviour.
 *
 * @example
 * ```tsx
 * <ContinuousCircle className="size-12" surfaceClassName="bg-white" />
 * ```
 */
export const ContinuousCircle: FC<ContinuousCircleProps> = ({ allowEllipse = false, className, ...rest }) => (
  <ContinuousShapeShell
    {...rest}
    className={cn(!allowEllipse && 'aspect-square', className)}
    // No `corner-shape` at all: the default `round` at 50% is a circle exactly, and
    // any superellipse here would be the 0.62% undulation this component exists to
    // avoid.
    shape={{ kind: 'css', style: { borderRadius: '50%' } }}
    shapeKind="circle"
  />
);
