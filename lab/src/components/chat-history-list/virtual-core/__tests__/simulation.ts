/**
 * Test-only stand-ins for the browser: a seeded random source, a critically damped spring, and
 * a simulated viewport that mounts, measures and compensates the way the real list will.
 */

import { seededRandom } from '../../seeded-random.js';
import { createVirtualCore, type VirtualCore, type VirtualOverscan, type VirtualRange } from '../virtual-core.js';

export { seededRandom };

export function messageKeys(from: number, to: number) {
  return Array.from({ length: to - from }, (_, index) => `m${from + index}`);
}

/** True rendered heights, in quarter pixels so fractional layout is always exercised. */
export function trueHeights(keys: readonly string[], seed: number, min = 24, max = 420) {
  const random = seededRandom(seed);
  return new Map(keys.map((key) => [key, Math.round((min + random() * (max - min)) * 4) / 4]));
}

export interface SpringState {
  position: number;
  velocity: number;
}

/**
 * Exact critically damped step (ζ = 1) toward `target`. Closed form rather than integration,
 * so splitting a step into smaller ones gives the same result and retargeting mid-flight
 * only changes the reference point.
 */
export function stepCriticallyDamped(state: SpringState, target: number, omega: number, dt: number): SpringState {
  const offset = state.position - target;
  const decay = Math.exp(-omega * dt);
  const drift = state.velocity + omega * offset;
  return {
    position: target + (offset + drift * dt) * decay,
    velocity: (state.velocity - omega * drift * dt) * decay,
  };
}

/** How far the anchor moved on screen, or null when it could not be held (clamped or gone). */
export function anchorDrift(result: LayoutResult) {
  if (!result.anchor || result.clamped) return null;
  return result.anchor.screenTopAfter - result.anchor.screenTopBefore;
}

export interface LayoutResult {
  passes: number;
  /** The scroll position had to be clamped, so the anchor could not keep its place. */
  clamped: boolean;
  anchor: { key: string; screenTopBefore: number; screenTopAfter: number } | null;
}

interface SimulationOptions {
  keys: readonly string[];
  heights: ReadonlyMap<string, number>;
  estimate?: number;
  viewportHeight?: number;
  /** Pixels on each side, or any overscan strategy. Defaults to 400 pixels. */
  overscan?: number | VirtualOverscan;
  paddingStart?: number;
  paddingEnd?: number;
  maxPasses?: number;
}

/**
 * One scroll container. `layout()` stands for one frame of browser work: mount the range
 * around the viewport, measure what mounted, and keep the first visible item where it was.
 */
export class ListSimulation {
  readonly core: VirtualCore;
  readonly heights: ReadonlyMap<string, number>;
  readonly viewportHeight: number;
  readonly maxPasses: number;
  scrollTop = 0;
  mounted: VirtualRange | null = null;

  constructor(options: SimulationOptions) {
    const estimate = options.estimate ?? 80;
    this.heights = options.heights;
    this.viewportHeight = options.viewportHeight ?? 800;
    this.maxPasses = options.maxPasses ?? 32;
    this.core = createVirtualCore({
      estimateSize: () => estimate,
      paddingStart: options.paddingStart ?? 0,
      paddingEnd: options.paddingEnd ?? 0,
      overscan:
        typeof options.overscan === 'object'
          ? options.overscan
          : { kind: 'pixels', before: options.overscan ?? 400, after: options.overscan ?? 400 },
    });
    this.core.setKeys(options.keys);
    this.core.setViewport({ offset: 0, size: this.viewportHeight });
  }

  get maxScrollTop() {
    return Math.max(0, this.core.totalSize() - this.viewportHeight);
  }

  /** Write a scroll position the way the browser would: clamped to the scrollable range. */
  write(top: number) {
    const clamped = Math.min(this.maxScrollTop, Math.max(0, top));
    this.scrollTop = clamped;
    this.core.setViewport({ offset: clamped, size: this.viewportHeight });
    return clamped !== top;
  }

  visibleRange() {
    return this.core.visibleRange();
  }

  /** First item intersecting the viewport, with its position relative to the viewport top. */
  private readAnchor() {
    const range = this.visibleRange();
    if (!range) return null;
    const item = this.core.item(range.startIndex);
    return { key: item.key, screenTop: item.start - this.scrollTop };
  }

  layout(): LayoutResult {
    const anchor = this.readAnchor();
    let clamped = false;
    for (let pass = 1; pass <= this.maxPasses; pass++) {
      const range = this.core.renderRange();
      this.mounted = range;
      let changed = false;
      if (range) {
        for (const item of this.core.items(range)) {
          changed = this.core.measure(item.key, this.heights.get(item.key)!) || changed;
        }
      }
      const anchorTop = anchor ? this.core.offsetOf(anchor.key) : undefined;
      if (anchor && anchorTop !== undefined) {
        clamped = this.write(anchorTop - anchor.screenTop) || clamped;
      } else {
        clamped = this.write(this.scrollTop) || clamped;
      }
      if (!changed) {
        const after = anchor ? this.core.offsetOf(anchor.key) : undefined;
        return {
          passes: pass,
          clamped,
          anchor:
            anchor && after !== undefined
              ? { key: anchor.key, screenTopBefore: anchor.screenTop, screenTopAfter: after - this.scrollTop }
              : null,
        };
      }
    }
    throw new Error(`Layout did not settle within ${this.maxPasses} passes.`);
  }

  scrollTo(top: number) {
    this.write(top);
    return this.layout();
  }

  /** True when every pixel of the visible viewport belongs to a measured item or padding. */
  viewportIsMeasured() {
    const range = this.visibleRange();
    if (!range) return true;
    return this.core.items(range).every((item) => item.measured);
  }

  /**
   * Drive the scroll position with a critically damped spring toward `target()`, re-reading the
   * target every frame. Layout compensation moves the spring with the content, keeping velocity.
   */
  animate(target: () => number, { omega = 15, dt = 1 / 60, maxFrames = 600, restDelta = 0.1, restSpeed = 1 } = {}) {
    let state: SpringState = { position: this.scrollTop, velocity: 0 };
    const frames: { scrollTop: number; target: number; velocity: number; passes: number }[] = [];
    for (let frame = 0; frame < maxFrames; frame++) {
      const goal = Math.min(this.maxScrollTop, Math.max(0, target()));
      state = stepCriticallyDamped(state, goal, omega, dt);
      this.write(state.position);
      const { passes } = this.layout();
      state = { position: this.scrollTop, velocity: state.velocity };
      frames.push({ scrollTop: this.scrollTop, target: goal, velocity: state.velocity, passes });
      const settledGoal = Math.min(this.maxScrollTop, Math.max(0, target()));
      if (Math.abs(this.scrollTop - settledGoal) <= restDelta && Math.abs(state.velocity) <= restSpeed) {
        this.write(settledGoal);
        this.layout();
        return frames;
      }
    }
    throw new Error(`Spring did not settle within ${maxFrames} frames.`);
  }
}
