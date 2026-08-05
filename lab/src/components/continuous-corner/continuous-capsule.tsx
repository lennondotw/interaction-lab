import { FC } from 'react';

import { ContinuousCorner } from './continuous-corner.js';
import { ContinuousShapeCommonProps } from './shape-css.js';

/**
 * Larger than any real box, so the generator's `min(r, halfX, halfY)` clamp always
 * resolves it to half the short side. Kept finite rather than `Infinity` because the
 * baseline emits it as a `px` length.
 */
const CAPSULE_RADIUS = 1e6;

export interface ContinuousCapsuleProps extends ContinuousShapeCommonProps {
  /** Declare the box instead of measuring it. See `ContinuousCorner`. */
  size?: { width: number; height: number };
}

/**
 * A pill: Apple's continuous corner at the maximum radius the box allows.
 *
 * Deliberately takes no radius. A capsule's radius is not a free parameter — it is
 * half the short side by definition — and offering one would only invite values that
 * silently clamp to the same shape.
 *
 * This is exactly SwiftUI's `Capsule(style: .continuous)`, and it needs no geometry
 * of its own: `Capsule(.continuous)` and `RoundedRectangle(1e4, .continuous)` measure
 * point-for-point identical, so the shape is just this component's generator at the
 * clamp. What it does add is refusing `mode="css"`, which at the clamp is not an
 * approximation but a different shape — `corner-shape` has no edge budget to run out
 * of, so it keeps bulging where Apple flattens onto an arc, and the end caps come out
 * 12.5% wrong.
 *
 * Its pre-measurement baseline is a plain `border-radius`, which clamps to a *true*
 * pill — semicircular caps, exact. Apple's continuous capsule is 1.4% fuller at the
 * cap diagonals than that, so the first frame is very slightly rounder than the
 * upgrade. Both are correct pills; only the cap fullness differs.
 *
 * @example
 * ```tsx
 * <ContinuousCapsule className="h-10 px-4" surfaceClassName="bg-white" />
 * ```
 */
export const ContinuousCapsule: FC<ContinuousCapsuleProps> = (props) => (
  <ContinuousCorner {...props} radius={CAPSULE_RADIUS} mode="path" />
);
