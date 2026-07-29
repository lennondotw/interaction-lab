import { SAMPLE_COUNT } from '../constants.js';
import type { BubbleState } from '../physics/bubble-state.js';
import { bubbleWarpRadius } from './bubble-warp.js';

const TWO_PI = Math.PI * 2;

// Trace the bubble's deformed silhouette into the canvas's current sub-path.
// Caller is responsible for clipping/stroking. Uses straight `lineTo`
// segments — at 48 samples the highest content frequency (4th harmonic) is
// well below the Nyquist limit of 24, so a smoother Catmull-Rom Bezier
// would buy no visible quality at this bubble size and would cost ~3× the
// per-frame path work.
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
