/**
 * Test-only stand-ins for the browser: a seeded random source, a critically damped spring, and
 * a simulated viewport that mounts, measures and compensates the way the real list will.
 */

import { type AnchorSnapshot, captureAnchor, resolveAnchor } from '../../anchor/anchor.js';
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

/**
 * How far the anchor moved relative to the reference line, or null when it could not be held
 * (clamped or gone).
 */
export function anchorDrift(result: LayoutResult) {
  if (!result.anchor || result.clamped) return null;
  return result.anchor.fromLineAfter - result.anchor.fromLineBefore;
}

export interface LayoutResult {
  passes: number;
  /** The scroll position had to be clamped, so the anchor could not keep its place. */
  clamped: boolean;
  /**
   * The row that held the reading position, with its anchor point's distance below the
   * reference line before and after. Null when no candidate survived the change.
   */
  anchor: { key: string; fromLineBefore: number; fromLineAfter: number } | null;
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
  /** Where the reference line sits in the viewport, 0 (top) to 1 (bottom). Defaults to 0. */
  anchorRatio?: number;
}

/**
 * One scroll container. `layout()` stands for one frame of browser work: mount the range
 * around the viewport, measure what mounted, and hold the reading anchor. `change()` does the
 * same around a change to the window or the viewport, capturing the anchor just before it.
 */
export class ListSimulation {
  readonly core: VirtualCore;
  readonly heights: ReadonlyMap<string, number>;
  viewportHeight: number;
  anchorRatio: number;
  readonly maxPasses: number;
  scrollTop = 0;
  mounted: VirtualRange | null = null;

  constructor(options: SimulationOptions) {
    const estimate = options.estimate ?? 80;
    this.heights = options.heights;
    this.viewportHeight = options.viewportHeight ?? 800;
    this.maxPasses = options.maxPasses ?? 32;
    this.anchorRatio = options.anchorRatio ?? 0;
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

  layout(): LayoutResult {
    return this.change(() => {});
  }

  /**
   * Capture the anchor from the layout as it is, apply `mutate` (new keys, a new viewport height,
   * forgotten sizes), then lay out until measurements settle, restoring the anchor every pass.
   */
  change(mutate: () => void): LayoutResult {
    const snapshot = captureAnchor(this.core, this.core.viewport!, this.anchorRatio);
    mutate();
    let clamped = this.write(this.scrollTop);
    for (let pass = 1; pass <= this.maxPasses; pass++) {
      const range = this.core.renderRange();
      this.mounted = range;
      let changed = false;
      if (range) {
        for (const item of this.core.items(range)) {
          changed = this.core.measure(item.key, this.heights.get(item.key)!) || changed;
        }
      }
      const resolved = resolveAnchor(snapshot, this.core, this.viewportHeight);
      if (resolved) clamped = this.write(resolved.offset) || clamped;
      if (!changed) return { passes: pass, clamped, anchor: this.anchorResult(snapshot, resolved?.key) };
    }
    throw new Error(`Layout did not settle within ${this.maxPasses} passes.`);
  }

  /** Resize the viewport, holding the anchor's distance from the reference line. */
  resize(viewportHeight: number) {
    return this.change(() => {
      this.viewportHeight = viewportHeight;
    });
  }

  private anchorResult(snapshot: AnchorSnapshot, key: string | undefined): LayoutResult['anchor'] {
    if (key === undefined) return null;
    const before = snapshot.candidates.find((candidate) => candidate.key === key)!;
    const item = this.core.item(this.core.indexOf(key)!);
    const line = this.scrollTop + snapshot.ratio * this.viewportHeight;
    return { key, fromLineBefore: before.fromLine, fromLineAfter: item.start + snapshot.ratio * item.size - line };
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
