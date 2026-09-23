import { captureAnchor } from '../../anchor/anchor.js';
import { seededRandom } from '../../seeded-random.js';
import { createVirtualCore, type VirtualCore, type VirtualOverscan, type VirtualViewport } from '../virtual-core.js';
import { initialMinimapView, type MinimapView } from './minimap-view.js';

/** `directional` is a custom strategy: `after` pixels in the scroll direction, `before` behind. */
export type PlaygroundOverscanKind = 'none' | 'pixels' | 'items' | 'directional';

/**
 * How far the list must scroll back from the furthest point reached in the current direction
 * before the direction flips. Jitter of a few pixels (trackpad noise, rounding, a 1px nudge)
 * then never swaps which side the directional overscan extends.
 */
export const directionHysteresis = 24;

export interface ScrollDirection {
  direction: 'up' | 'down';
  /** Furthest offset reached while moving in `direction`. */
  extreme: number;
}

/** The scroll direction after the list reaches `offset`, with hysteresis. */
export function nextScrollDirection(state: ScrollDirection, offset: number): ScrollDirection {
  const forward = state.direction === 'down' ? offset - state.extreme : state.extreme - offset;
  if (forward >= 0) return { direction: state.direction, extreme: offset };
  if (-forward <= directionHysteresis) return state;
  return { direction: state.direction === 'down' ? 'up' : 'down', extreme: offset };
}

/** How the playground places mounted rows. */
export type PlaygroundLayout = 'flow' | 'absolute';

/** What the last layout change did to the reading offset, for the state panel. */
export interface ChangeLog {
  /** The change that ran, such as `prepend` or `row size`. */
  reason: string;
  /** The row held still, or null when anchoring was off or no candidate survived. */
  key: string | null;
  /** How far the reading offset moved. Logged only: never added to anything. */
  delta: number;
  /**
   * Where the anchor row's element is minus where the core puts it, in content coordinates.
   * Zero while the DOM layout equals the core's; null when the anchor row is not mounted.
   */
  domResidual: number | null;
}

/** Height of a pulsing row's striped block at rest, in pixels. */
export const pulseBaseHeight = 16;
/** How much the striped block grows at its peak, in pixels. */
export const pulseAmplitude = 160;
/** One full grow-and-shrink cycle of a pulsing row, in milliseconds. */
export const pulsePeriod = 1600;

/**
 * Height of a pulsing row's striped block `elapsed` milliseconds after it started: the base
 * height plus a raised cosine that rises to the amplitude and falls back, so it starts at rest
 * and changes size on every frame without ever collapsing.
 */
export function pulseHeight(elapsed: number) {
  return pulseBaseHeight + (pulseAmplitude * (1 - Math.cos((2 * Math.PI * elapsed) / pulsePeriod))) / 2;
}

export const minLines = 1;
export const maxLines = 10;
/** How long a size update stays highlighted, in the list and in the minimap. */
export const flashDuration = 600;
/**
 * CSS `ease-in` as cubic Bézier control points. The list overlay passes it to the Web Animations
 * API as a string; the minimap evaluates the same curve, so both fade identically.
 */
export const flashEasing = [0.42, 0, 1, 1] as const;

/**
 * Rows and the core, mutated together in event handlers so a render never sees one without
 * the other. Row height comes from its number of placeholder lines; only the DOM knows it.
 *
 * Views that only display the core (the minimap and the state panel) are painters: they are
 * redrawn imperatively at most once per animation frame, never through React.
 */
export class PlaygroundModel {
  readonly core: VirtualCore;
  readonly lines = new Map<string, number>();
  order: string[] = [];
  /** Scroll direction with hysteresis, read by the directional overscan strategy. */
  scroll: ScrollDirection = { direction: 'down', extreme: 0 };
  /** When each row's size last changed; the minimap fades its highlight from this time. */
  readonly flashes = new Map<string, number>();
  /** Rows whose height follows `pulseHeight`, with the time each started. */
  readonly pulses = new Map<string, number>();
  private readonly random: () => number;
  /**
   * The minimap's view and canvas height. Kept here rather than inside the minimap so the state
   * panel can show it: it is state of its own, not something derived from the list.
   */
  minimap: { view: MinimapView; height: number } = { view: initialMinimapView, height: 0 };
  /** Anchoring settings from the story; the driver reads them at every change. */
  anchoring: { enabled: boolean; ratio: number } = { enabled: true, ratio: 0 };
  lastChange: ChangeLog | null = null;
  /** Largest DOM residual seen since mount, by magnitude. */
  maxDomResidual = 0;
  /**
   * How the reading offset (the core's viewport offset) is shown: the browser's measured scroll
   * step, the step widened to whole device pixels that `scrollTop` is kept on, the scroller's
   * `scrollTop`, the spacer above the list, and the quantization error, `scrollTop - spacer`
   * minus the reading offset. Presentation only; never read back into the offset.
   */
  presentation = { scrollStep: 1, step: 1, scrollTop: 0, spacer: 0, quantization: 0 };
  /** Largest quantization error seen since mount, by magnitude. */
  maxQuantization = 0;
  private readonly painters = new Set<() => void>();
  private readonly viewportListeners = new Set<(viewport: VirtualViewport) => void>();
  private frame = 0;
  private firstId = 0;
  private nextId = 0;

  constructor(count: number, estimate: number, seed: number) {
    this.random = seededRandom(seed);
    this.core = createVirtualCore({ estimateSize: () => estimate });
    this.append(count);
  }

  private randomLines() {
    return minLines + Math.floor(this.random() * (maxLines - minLines + 1));
  }

  private create(id: number) {
    const key = `m${id}`;
    this.lines.set(key, this.randomLines());
    return key;
  }

  private commit() {
    this.core.setKeys(this.order);
  }

  prepend(count: number) {
    const keys = Array.from({ length: count }, (_, index) => this.create(this.firstId - count + index));
    this.firstId -= count;
    this.order = [...keys, ...this.order];
    this.commit();
  }

  append(count: number) {
    const keys = Array.from({ length: count }, (_, index) => this.create(this.nextId + index));
    this.nextId += count;
    this.order = [...this.order, ...keys];
    this.commit();
  }

  /**
   * Insert a row before `key` whose height changes on every frame, to test anchoring against
   * a size animation. Inserted next to the viewport rather than at the start of the list, where
   * it would not be mounted unless the list were scrolled to the top.
   */
  insertPulsing(key: string, now: number) {
    const inserted = this.create(this.nextId++);
    this.lines.set(inserted, minLines);
    this.pulses.set(inserted, now);
    const index = this.order.indexOf(key);
    this.order = [...this.order.slice(0, index), inserted, ...this.order.slice(index)];
    this.commit();
  }

  removeFirst(count: number) {
    this.order = this.order.slice(count);
    this.commit();
  }

  removeLast(count: number) {
    this.order = this.order.slice(0, Math.max(0, this.order.length - count));
    this.commit();
  }

  remove(key: string) {
    this.order = this.order.filter((candidate) => candidate !== key);
    this.commit();
  }

  resize(key: string, delta: number) {
    const lines = this.lines.get(key)!;
    this.lines.set(key, Math.min(maxLines, Math.max(minLines, lines + delta)));
  }

  /**
   * New content for every row. Mounted rows are re-measured by their observer; the others have
   * no DOM, so their old measurements are dropped and they fall back to the estimate. That is
   * the caller's policy, not the core's: the core never learns that content changed.
   */
  resizeAll(mounted: ReadonlySet<string>) {
    for (const key of this.order) this.lines.set(key, this.randomLines());
    for (const key of this.core.measuredKeys()) if (!mounted.has(key)) this.core.forget(key);
  }

  /** The row a change would hold still right now, or null with anchoring off. */
  currentAnchor() {
    const { viewport } = this.core;
    if (!this.anchoring.enabled || !viewport) return null;
    // The best candidate always intersects the viewport when any row does, so no margin.
    return captureAnchor(this.core, viewport, this.anchoring.ratio, 0).candidates[0] ?? null;
  }

  /** Report the list's viewport to the core, and tell listeners when it actually moved. */
  setViewport(viewport: VirtualViewport) {
    const previous = this.core.viewport;
    this.core.setViewport(viewport);
    if (previous?.offset === viewport.offset && previous.size === viewport.size) return;
    for (const listener of this.viewportListeners) listener(viewport);
  }

  onViewportMove(listener: (viewport: VirtualViewport) => void) {
    this.viewportListeners.add(listener);
    return () => {
      this.viewportListeners.delete(listener);
    };
  }

  addPainter(paint: () => void) {
    this.painters.add(paint);
    this.invalidate();
    return () => {
      this.painters.delete(paint);
    };
  }

  /** Forget size updates whose highlight has finished fading. */
  pruneFlashes(now: number) {
    for (const [key, at] of this.flashes) if (now - at >= flashDuration) this.flashes.delete(key);
  }

  /** Schedule one repaint of every painter for the next frame; repeated calls coalesce. */
  invalidate() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      for (const paint of this.painters) paint();
    });
  }

  /**
   * Repaint now instead of on the next frame. A ResizeObserver callback runs after this frame's
   * animation callbacks but before its paint, so painting from there keeps the painters in
   * step with the rows it just measured rather than one frame behind them.
   */
  flush() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    for (const paint of this.painters) paint();
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  /** Give a few mounted rows new content, as streaming or late-loading media would. */
  jitter(mounted: readonly string[]) {
    for (let count = 0; count < 3 && mounted.length > 0; count++) {
      const key = mounted[Math.floor(this.random() * mounted.length)]!;
      this.lines.set(key, this.randomLines());
    }
  }
}

export function toOverscan(
  kind: PlaygroundOverscanKind,
  before: number,
  after: number,
  model: PlaygroundModel
): VirtualOverscan {
  switch (kind) {
    case 'none':
      return { kind: 'pixels', before: 0, after: 0 };
    case 'pixels':
      return { kind: 'pixels', before, after };
    case 'items':
      return { kind: 'items', before: Math.round(before), after: Math.round(after) };
    case 'directional':
      return {
        kind: 'custom',
        range: ({ viewport, layout }) => {
          const up = model.scroll.direction === 'up' ? after : before;
          const down = model.scroll.direction === 'down' ? after : before;
          return layout.rangeFor(viewport.offset - up, viewport.offset + viewport.size + down);
        },
      };
  }
}
