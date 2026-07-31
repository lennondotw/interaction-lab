/**
 * The shape every story in this folder traces, and the domain it lives in.
 *
 * Shared so the renderers are the only thing that differs between them: if the
 * SVG story used a different radius or blend than the canvas story, "does the
 * contour survive the move" would be unanswerable.
 */

import { Ball } from './field.js';

/** The visible, interactive box. Power of two so the quadtree tiles it cleanly. */
export const VIEW = 512;
export const MIN_CELL = 1;
export const CELL_SIZES = [8, 4, 2, 1] as const;
export const RADIUS = 60;
export const SIGMA = 12;
export const BLEND = 40;

/**
 * Sampled beyond every side of the view. Ball centres are clamped to the view,
 * but the shape around a centre is not — it reaches `RADIUS + max(BLEND, 3 *
 * SIGMA)` = 100px further out — so a ball parked on the frame would have its
 * contour cut off there and come back as an open chain. 128 is that 100px bound
 * rounded up to a power of two, which keeps the 768px sampled domain tiling into
 * 256px quadtree roots.
 *
 * archive/2026-07-contour-domain-overscan measures both halves of that: 90.3px
 * is the worst reach any arrangement of 12 balls achieves against the 100px
 * bound, and the margin costs `sparse` 0.1% and `bounded` nothing. Only `dense`
 * pays for it, 2.25x, which is the O(area) tax showing up again.
 */
export const OVERSCAN = 128;
export const TRACED = VIEW + 2 * OVERSCAN;
export const MAX_BALLS = 12;

/** Evenly spaced around a circle, which gives every count a symmetric start. */
export const createBalls = (count: number): Ball[] =>
  Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    return {
      x: VIEW / 2 + Math.cos(angle) * 110,
      y: VIEW / 2 + Math.sin(angle) * 110,
    };
  });

export type Arrangement = 'ring' | 'neck';

/**
 * Two balls close enough for the blend to bridge them, leaving a waist much
 * thinner than either lobe.
 *
 * The arrangement exists to separate the two ways of drawing an inner border. A
 * stroke clipped to the shape follows the outline through the waist whatever its
 * width, because it is the outline pushed inward. A true iso offset stops
 * existing there once the inset exceeds half the waist — measured at inset 26 for
 * this spacing, where one surface loop becomes two inner loops. Same shape, same
 * requested width, genuinely different answer, and only one of them is what
 * "16px in from the edge" actually means.
 */
export const createNeckedBalls = (): Ball[] => [
  { x: VIEW / 2 - 65, y: VIEW / 2 },
  { x: VIEW / 2 + 65, y: VIEW / 2 },
];

export const createArrangement = (arrangement: Arrangement, count: number): Ball[] =>
  arrangement === 'neck' ? createNeckedBalls() : createBalls(count);

/**
 * Drives the balls along lissajous-ish orbits that repeatedly merge and split
 * them. Mutates in place — the caller owns the array, and this runs per frame.
 *
 * Merging is the point rather than decoration: a topology change is where loop
 * identity breaks, and anything downstream that assumes a stable loop count or
 * a stable vertex order fails exactly here.
 */
export const orbitBalls = (balls: readonly Ball[], timeMs: number): void => {
  for (let index = 0; index < balls.length; index++) {
    const ball = balls[index];
    if (!ball) continue;
    const phase = timeMs / 1000 + (index * Math.PI * 2) / balls.length;
    ball.x = VIEW / 2 + Math.cos(phase * 0.7) * (95 + 45 * Math.sin(phase * 0.9));
    ball.y = VIEW / 2 + Math.sin(phase * 0.8) * (95 + 45 * Math.cos(phase * 1.1));
  }
};

export const median = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

/**
 * Keeps a rolling window of samples and reports the median. Timing one frame of
 * anything at this scale is mostly noise; the median over ~1.5s of frames is
 * what moves when a real cost changes.
 */
export class RollingMedian {
  private readonly samples: number[] = [];

  constructor(private readonly window: number) {}

  push(value: number): void {
    this.samples.push(value);
    if (this.samples.length > this.window) this.samples.shift();
  }

  get value(): number {
    return median(this.samples);
  }
}
