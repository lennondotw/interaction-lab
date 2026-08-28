/**
 * One walk over the traced contour, two destinations.
 *
 * `Path2D` and SVG's `d` attribute accept the same commands, so the geometry
 * step has no business being written twice — a divergence between the canvas
 * curve and the SVG curve would be a bug that only showed up as a visual
 * mismatch, which is the worst way to find one. `PathSink` is the handful of
 * methods the walk needs, `Path2D` already implements it verbatim, and
 * `DataPathSink` is the same interface accumulating a string.
 *
 * So the two renderers are guaranteed to agree on geometry by construction. The
 * one thing that can still differ is how many digits survive the trip through a
 * string, which `DataPathSink` measures rather than leaves to trust.
 */

import { ContourTracer } from './field.js';

/** The subset of `Path2D` that contour emission uses. `Path2D` satisfies it as-is. */
export interface PathSink {
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  quadraticCurveTo: (cpx: number, cpy: number, x: number, y: number) => void;
  closePath: () => void;
}

export interface EmitOptions {
  /**
   * Round the corners by running a quadratic through edge midpoints — cheap, and
   * closer to how the blurred original looks. Without it you see the raw
   * marching-squares polyline, which is the honest picture of what a given cell
   * size buys you.
   */
  smooth: boolean;
  /** Only emit loops at this iso level. Omit for every level in one path. */
  level?: number;
}

/**
 * Walks every loop of the trace into `sink` and returns how many it emitted.
 *
 * Each loop is closed, so the smooth variant can start at the midpoint of the
 * first edge and run a quadratic per vertex all the way around without a special
 * case at either end.
 */
export function emitContour(tracer: ContourTracer, sink: PathSink, options: EmitOptions): number {
  const { ordered, pointXY } = tracer;
  let emitted = 0;

  for (const loop of tracer.loops) {
    if (loop.count < 3) continue;
    if (options.level !== undefined && loop.level !== options.level) continue;

    const px = (k: number): number => {
      const index = ordered[loop.start + (k % loop.count)] ?? 0;
      return pointXY[index * 2] ?? 0;
    };
    const py = (k: number): number => {
      const index = ordered[loop.start + (k % loop.count)] ?? 0;
      return pointXY[index * 2 + 1] ?? 0;
    };

    if (options.smooth) {
      sink.moveTo((px(0) + px(1)) * 0.5, (py(0) + py(1)) * 0.5);
      for (let k = 1; k <= loop.count; k++) {
        sink.quadraticCurveTo(px(k), py(k), (px(k) + px(k + 1)) * 0.5, (py(k) + py(k + 1)) * 0.5);
      }
    } else {
      sink.moveTo(px(0), py(0));
      for (let k = 1; k < loop.count; k++) sink.lineTo(px(k), py(k));
    }

    sink.closePath();
    emitted++;
  }

  return emitted;
}

/** Builds one `Path2D` covering the requested levels. */
export function buildPath2D(tracer: ContourTracer, options: EmitOptions): Path2D {
  const path = new Path2D();
  emitContour(tracer, path, options);
  return path;
}

export interface DataPathOptions {
  /**
   * Decimal places kept per coordinate. The contour is sub-pixel at the cell
   * sizes this runs at, so this trades string length — which is the whole cost
   * of the SVG route — against a quantisation error that `maxError` reports.
   */
  precision: number;
  /**
   * Multiplies every coordinate. 1 leaves the path in domain units, for a
   * `viewBox` that matches. `1 / view` normalises it to the 0..1 that
   * `clipPathUnits="objectBoundingBox"` wants, which is what makes the path
   * resolution-independent and a resize free.
   */
  scale?: number;
}

/**
 * A `PathSink` that accumulates an SVG `d` string.
 *
 * Coordinates are joined with a single space and commands are emitted bare, both
 * because the grammar allows it and because string length is the cost being
 * measured. `maxError` is the largest distance any single coordinate moved when
 * it was rounded — the honest answer to "is this precision enough", in the same
 * units the path is in.
 */
export class DataPathSink implements PathSink {
  /** Largest absolute rounding error applied to any coordinate, in output units. */
  maxError = 0;

  private readonly parts: string[] = [];
  private readonly precision: number;
  private readonly scale: number;

  constructor(options: DataPathOptions) {
    this.precision = options.precision;
    this.scale = options.scale ?? 1;
  }

  moveTo(x: number, y: number): void {
    this.parts.push(`M${this.n(x)} ${this.n(y)}`);
  }

  lineTo(x: number, y: number): void {
    this.parts.push(`L${this.n(x)} ${this.n(y)}`);
  }

  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {
    this.parts.push(`Q${this.n(cpx)} ${this.n(cpy)} ${this.n(x)} ${this.n(y)}`);
  }

  closePath(): void {
    this.parts.push('Z');
  }

  toString(): string {
    return this.parts.join('');
  }

  private n(value: number): string {
    const scaled = value * this.scale;
    const text = scaled.toFixed(this.precision);
    const error = Math.abs(Number(text) - scaled);
    if (error > this.maxError) this.maxError = error;
    return text;
  }
}

export interface ContourData {
  d: string;
  /** Largest coordinate rounding error, in the same units as `d`. */
  maxError: number;
  loops: number;
}

/** Builds an SVG `d` string covering the requested levels. */
export function buildPathData(tracer: ContourTracer, options: EmitOptions & DataPathOptions): ContourData {
  const sink = new DataPathSink(options);
  const loops = emitContour(tracer, sink, options);
  return { d: sink.toString(), maxError: sink.maxError, loops };
}
