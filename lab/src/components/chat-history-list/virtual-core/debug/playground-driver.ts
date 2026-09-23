import { captureAnchor, resolveAnchor } from '../../anchor/anchor.js';
import { alignedScrollStep, measureScrollStep, presentReadingOffset } from '../../anchor/presentation.js';
import type { VirtualRange } from '../virtual-core.js';
import { nextScrollDirection, type PlaygroundModel } from './playground-model.js';

export interface PlaygroundDriverHost {
  scroller: HTMLElement;
  /**
   * The first child of the scroller, above the list, whose height carries the fraction of the
   * reading offset that `scrollTop` cannot. The driver owns its inline height.
   */
  spacer: HTMLElement;
  /** Mounted row elements and their keys. */
  rows: ReadonlyMap<Element, string>;
  /** Render synchronously, so the DOM shows the core's current layout and render range. */
  commit: () => void;
  /** Highlight rows whose size changed, with a description of the change. */
  flash: (updates: readonly (readonly [key: string, description: string])[]) => void;
}

/** A change that keeps mounting or measuring rows for longer than this is a bug. */
const maxPasses = 8;

const formatPx = (value: number) => `${Number(value.toFixed(2))}px`;

const sameRange = (a: VirtualRange | null, b: VirtualRange | null) =>
  a === b || (a !== null && b !== null && a.startIndex === b.startIndex && a.endIndex === b.endIndex);

/** A DOM residual this large is a real disagreement: layout positions are in 1/64px units. */
const layoutUnit = 1 / 64;

/**
 * Every layout change in the playground runs through `transact`, as one step before the frame
 * paints:
 *
 * 1. capture the anchor from the core while it still holds the old layout,
 * 2. apply the change (new keys, new content, a new viewport size),
 * 3. render, measure every mounted row, and set the reading offset that holds the anchor,
 *    repeating while that mounts rows the core has not measured,
 * 4. measure the DOM residual: where the anchor row's element is minus where the core puts it.
 *
 * State has one source per layer, and nothing we derive is written back into it:
 *
 * - Content layout: the core's offsets. Never contains a compensation.
 * - Reading offset: the core's viewport offset, in the same coordinates. Only two things set it:
 *   an anchor resolution, and a user scroll read back from the scroller. Each compensation is
 *   logged as a delta but never accumulated; every change resolves afresh from its snapshot.
 * - Presentation: the scroller's `scrollTop` and the spacer above the list, derived from the
 *   reading offset and never read back into it except as a user scroll. The browser keeps
 *   `scrollTop` on a grid of its own (the screen's device pixels in Chromium, whole pixels
 *   truncated in Safari), and content written straight onto that grid hops between device
 *   pixels. So `scrollTop` is the reading offset rounded up to a step that is on the grid and a
 *   whole number of device pixels, and the spacer takes the remainder: content sits exactly at
 *   the reading offset, on the same device pixel whatever the split. See
 *   archive/2026-09-scroll-offset-quantization.
 *
 * While the scroller still reads the value last written, the reading offset stands; any other
 * value means the user scrolled (or the browser clamped), and the reading offset is what that
 * `scrollTop` shows under the current spacer. The spacer changes only with a compensation,
 * since changing it alone would move the content.
 *
 * The DOM residual is not corrected. It is zero whenever the DOM layout equals the core's, which
 * both layouts guarantee; a non-zero residual is a bug, reported in the state panel and the
 * console rather than hidden in the scroll position.
 *
 * Scrolling is not a layout change. It only runs a transaction when the render range changes,
 * after reporting the new offset, so newly mounted rows are measured before they paint.
 */
export class PlaygroundDriver {
  private committed: VirtualRange | null = null;
  /** The `scrollTop` last written and the reading offset it presents. */
  private lastWrite: { scrollTop: number; readingOffset: number } | null = null;

  constructor(
    private readonly model: PlaygroundModel,
    private readonly host: PlaygroundDriverHost
  ) {
    this.measureStep();
  }

  /**
   * Measure the browser's scroll step and widen it to whole device pixels. Call again when the
   * device pixel ratio changes (browser zoom, or a move to another screen).
   */
  measureStep() {
    const scrollStep = measureScrollStep(document);
    this.model.presentation = {
      ...this.model.presentation,
      scrollStep,
      step: alignedScrollStep(scrollStep, window.devicePixelRatio),
    };
  }

  /** The reading offset as the scroller now implies it: ours while it shows our last write. */
  private readReadingOffset() {
    const { scrollTop } = this.host.scroller;
    if (this.lastWrite?.scrollTop === scrollTop) return this.lastWrite.readingOffset;
    this.lastWrite = null;
    return scrollTop - this.model.presentation.spacer;
  }

  /**
   * Record what the scroller shows for the reading offset. Only for a settled state: between
   * passes of a transaction the DOM can still have the previous scroll range, and a scrollTop
   * clamped to it is rewritten by the next pass before anything paints.
   */
  private recordPresentation(readingOffset: number) {
    const { scrollTop } = this.host.scroller;
    const quantization = scrollTop - this.model.presentation.spacer - readingOffset;
    this.model.presentation = { ...this.model.presentation, scrollTop, quantization };
    if (Math.abs(quantization) > Math.abs(this.model.maxQuantization)) this.model.maxQuantization = quantization;
  }

  /** Take the reading offset from the scroller and report it with the viewport size. */
  private report() {
    const readingOffset = this.readReadingOffset();
    this.model.setViewport({ offset: readingOffset, size: this.host.scroller.clientHeight });
  }

  /** Set the reading offset, clamped to the scrollable range, and present it. */
  private setReadingOffset(target: number) {
    const { scroller } = this.host;
    const { core } = this.model;
    const { size, offset: previous } = core.viewport!;
    const readingOffset = Math.min(Math.max(0, core.totalSize() - size), Math.max(0, target));
    const { scrollTop, spacer } = presentReadingOffset(readingOffset, this.model.presentation.step);
    // The spacer first: it extends the scroll range the new scrollTop may need.
    if (spacer !== this.model.presentation.spacer) {
      this.host.spacer.style.height = `${spacer}px`;
      this.model.presentation = { ...this.model.presentation, spacer };
    }
    if (scrollTop !== scroller.scrollTop) scroller.scrollTop = scrollTop;
    this.lastWrite = { scrollTop: scroller.scrollTop, readingOffset };
    // A compensation is not the user scrolling: move the direction's reference point with it.
    this.model.scroll = { ...this.model.scroll, extreme: this.model.scroll.extreme + readingOffset - previous };
    this.model.setViewport({ offset: readingOffset, size });
  }

  /** Report a size to the core; returns a description when the layout changed. */
  private measure(key: string, size: number) {
    const { core } = this.model;
    const previous = core.item(core.indexOf(key)!);
    if (!core.measure(key, size)) return null;
    if (!previous.measured) return `≈${formatPx(previous.size)} → ${formatPx(size)}`;
    const delta = size - previous.size;
    return `${formatPx(previous.size)} → ${formatPx(size)} (${delta > 0 ? '+' : '−'}${formatPx(Math.abs(delta))})`;
  }

  private measureMounted() {
    const updates: [string, string][] = [];
    for (const [element, key] of this.host.rows) {
      const description = this.measure(key, element.getBoundingClientRect().height);
      if (description) updates.push([key, description]);
    }
    return updates;
  }

  /** Where the row's element is in content coordinates, minus where the core puts it. */
  private domResidual(key: string) {
    const element = [...this.host.rows].find(([, rowKey]) => rowKey === key)?.[0];
    // An anchor outside the render range has no element to compare.
    if (!element) return null;
    // The list starts where the spacer ends.
    const contentTop = this.host.spacer.getBoundingClientRect().bottom;
    const { core } = this.model;
    return element.getBoundingClientRect().top - contentTop - core.item(core.indexOf(key)!).start;
  }

  transact(reason: string, change?: () => void) {
    const { core, anchoring } = this.model;
    const before = core.viewport!.offset;
    const snapshot = anchoring.enabled ? captureAnchor(core, core.viewport!, anchoring.ratio) : null;
    change?.();
    const updates: [string, string][] = [];
    let key: string | null = null;
    for (let pass = 1; ; pass++) {
      if (pass > maxPasses) throw new Error(`Layout did not settle within ${maxPasses} passes (${reason}).`);
      this.host.commit();
      this.committed = core.renderRange();
      const measured = this.measureMounted();
      updates.push(...measured);
      const resolved = snapshot && resolveAnchor(snapshot, core, this.host.scroller.clientHeight);
      if (resolved) this.setReadingOffset(resolved.offset);
      else this.report();
      key = resolved ? resolved.key : null;
      if (measured.length === 0 && sameRange(core.renderRange(), this.committed)) break;
    }

    const domResidual = key === null ? null : this.domResidual(key);
    if (domResidual !== null && Math.abs(domResidual) >= layoutUnit) {
      console.error(`DOM residual of ${domResidual}px on ${key} after ${reason}: the DOM and the core disagree.`);
    }
    if (domResidual !== null && Math.abs(domResidual) > Math.abs(this.model.maxDomResidual)) {
      this.model.maxDomResidual = domResidual;
    }
    this.recordPresentation(core.viewport!.offset);
    this.model.lastChange = { reason, key, delta: core.viewport!.offset - before, domResidual };
    this.host.flash(updates);
    // Paint now: from a ResizeObserver callback, this frame's animation callbacks already ran.
    this.model.flush();
  }

  onScroll() {
    const read = this.host.scroller.scrollTop;
    // The echo of our own write; its reading offset is already reported.
    if (this.lastWrite?.scrollTop === read) return;
    this.model.scroll = nextScrollDirection(this.model.scroll, read);
    this.report();
    this.recordPresentation(this.model.core.viewport!.offset);
    this.model.invalidate();
    if (!sameRange(this.model.core.renderRange(), this.committed)) this.transact('mount');
  }

  /** One observer covers the scroller and every row, so a frame's changes are one transaction. */
  onResize(entries: readonly ResizeObserverEntry[]) {
    const { core } = this.model;
    const { scroller, rows } = this.host;
    const viewportResized = entries.some(
      (entry) => entry.target === scroller && scroller.clientHeight !== core.viewport!.size
    );
    const rowResized = entries.some((entry) => {
      const key = rows.get(entry.target);
      return key !== undefined && core.measuredSize(key) !== entry.borderBoxSize[0]!.blockSize;
    });
    if (!viewportResized && !rowResized) return;
    this.transact(viewportResized ? 'viewport size' : 'row size', () => this.report());
  }
}
