import { SAMPLE_COUNT } from '../constants.js';
import type { BubbleState } from '../physics/bubble-state.js';
import { bubbleWarpRadius } from './bubble-warp.js';

const TWO_PI = Math.PI * 2;

// Trace the bubble's deformed silhouette into the canvas's current sub-path.
// Caller is responsible for clipping/stroking. Uses straight `lineTo` segments,
// which is fine here — but for a different reason than Nyquist, which this
// comment used to cite.
//
// Resolving the radius function and drawing a smooth outline are separate
// questions. 48 samples do capture the 4th harmonic with room to spare, and a
// perfect circle has no harmonic content at all above order 0 — yet a 48-gon of
// a large circle still reads as a 48-gon. What decides it is the chord error,
// which is set by segment length against local curvature, so it grows with the
// bubble.
//
// Measured on the widest harmonic amplitudes `bubble-harmonics.ts` generates:
//
//   radius  chord error   turn per vertex
//       45      0.096px            10.66°
//    57.5      0.123px            10.66°
//    66.1      0.142px            10.66°   (MAX_R at SELECTED_SCALE)
//
// So it holds because these bubbles are *small*: MIN_R 45 to MAX_R 57.5, times
// SELECTED_SCALE, tops out at 66px and a seventh of a pixel — invisible under a
// half-alpha 1px rim. The turn is scale-invariant at 10.66° and the error is
// linear in radius, so the conclusion would not survive a much bigger bubble:
// at r=160 it is 0.51px. Revisit this if MAX_R or SELECTED_SCALE grows.
//
// Catmull-Rom would still be the wrong trade at this size: ~3× the path work,
// every frame, for all 20 bubbles.
export function traceDeformedPath(
  ctx: CanvasRenderingContext2D,
  bubble: BubbleState,
  cx: number,
  cy: number,
  radius: number,
  time: number
): void {
  ctx.beginPath();
  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    const theta = (i / SAMPLE_COUNT) * TWO_PI;
    const r = bubbleWarpRadius(bubble, theta, time, radius);
    const x = cx + Math.cos(theta) * r;
    const y = cy + Math.sin(theta) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}
