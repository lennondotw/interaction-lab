/**
 * The box-shaped half of the beacon layout-observation instrumentation.
 *
 * The subject is `useBeaconAnchor`'s observation cascade: five sources wired to one
 * `measure()` (self `ResizeObserver`, an ancestor RO cascade, a capture-phase window
 * `scroll` listener, a window `resize` listener, and the `IntersectionObserver`
 * layout-shift trick). The question each probe asks is which of them actually
 * catches which kind of layout change.
 *
 * The generic half — sampling, verdicts, the tracer — moved to
 * `#src/utils/observation-trace.js` once a second subject needed it. Everything left
 * here is specific to comparing two rectangles, which is what a beacon's error *is*;
 * a subject whose error is not a box supplies its own reading and reuses that
 * harness unchanged.
 *
 * Two measurement choices are load-bearing:
 *
 * - The beacon box is read from the **store entry's raw MotionValues**, not from the
 *   follower's painted rect. The follower runs springs; sampling it would turn
 *   spring easing into apparent observation lag and make every row of every table
 *   meaningless.
 * - The target box is read from `getBoundingClientRect`, differenced against the
 *   container — deliberately *not* the `offsetParent` walk the hook itself uses. An
 *   independent instrument can disagree with the subject, which is the only way a
 *   measurement bug can show up as a number rather than as agreement between two
 *   copies of the same mistake.
 */

import { fmt } from '#src/utils/observation-trace.js';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * `offsetLeft` / `offsetTop` are integers while `getBoundingClientRect` is not, so a
 * target sitting on a half pixel reports a permanent sub-pixel delta. One pixel is
 * the floor of what this instrument can resolve; anything at or below it counts as
 * agreement.
 *
 * This is the `epsilon` argument `verdictOf` takes, and it is a property of *this*
 * subject rather than a universal constant — a contour traced by marching squares
 * has a different floor, set by interpolation error over one cell.
 */
export const MATCH_EPSILON = 1;

export const boxDelta = (a: Box, b: Box): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w), Math.abs(a.h - b.h));

export const boxText = (b: Box): string => `${fmt(b.x)},${fmt(b.y)} ${fmt(b.w)}×${fmt(b.h)}`;
