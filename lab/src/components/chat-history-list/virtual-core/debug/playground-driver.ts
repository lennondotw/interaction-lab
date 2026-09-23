import { captureAnchor, resolveAnchor } from '../../anchor/anchor.js';
import type { VirtualRange } from '../virtual-core.js';
import { nextScrollDirection, type PlaygroundModel } from './playground-model.js';

export interface PlaygroundDriverHost {
  scroller: HTMLElement;
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

/**
 * Every layout change in the playground runs through `transact`, as one step before the frame
 * paints:
 *
 * 1. capture the anchor from the core while it still holds the old layout,
 * 2. apply the change (new keys, new content, a new viewport size),
 * 3. render, measure every mounted row, and write the scroll position that holds the anchor,
 *    repeating while that mounts rows the core has not measured,
 * 4. compare the anchor row's element with the core's position for it (the residual), and
 *    add any difference to the scroll position, so the row the user sees holds still even when
 *    the DOM and the core disagree. In either layout the residual should be zero; the state
 *    panel shows it so a disagreement is visible rather than silently corrected.
 *
 * Scrolling is not a layout change. It only runs a transaction when the render range changes,
 * after reporting the new offset, so newly mounted rows are measured before they paint.
 *
 * The scroll position is kept as a logical offset: the fractional value the anchor asks for.
 * The scroller is written only when the value lands on a different device pixel, and while it still reads what
 * was last written, the logical offset stands in for it, so fractions carry across changes
 * instead of being rounded away one change at a time.
 */
export class PlaygroundDriver {
  private committed: VirtualRange | null = null;
  /** The offset last written and what the scroller read back just after. */
  private logical: { offset: number; read: number } | null = null;

  constructor(
    private readonly model: PlaygroundModel,
    private readonly host: PlaygroundDriverHost
  ) {}

  /** The list's scroll offset: the logical one while the scroller still shows the last write. */
  private offset() {
    const read = this.host.scroller.scrollTop;
    if (this.logical?.read === read) return this.logical.offset;
    this.logical = null;
    return read;
  }

  private report() {
    this.model.setViewport({ offset: this.offset(), size: this.host.scroller.clientHeight });
  }

  private scrollTo(target: number) {
    const { scroller } = this.host;
    const { core } = this.model;
    const { size, offset: previous } = core.viewport!;
    const offset = Math.min(Math.max(0, core.totalSize() - size), Math.max(0, target));
    // The browser keeps scroll positions on the device pixel grid (half pixels at 2x), so write
    // only when the target lands on a different device pixel; the fraction stays in `logical`.
    const dpr = window.devicePixelRatio;
    if (Math.round(offset * dpr) !== Math.round(scroller.scrollTop * dpr)) scroller.scrollTop = offset;
    this.logical = { offset, read: scroller.scrollTop };
    // A compensation is not the user scrolling: move the direction's reference point with it.
    this.model.scroll = { ...this.model.scroll, extreme: this.model.scroll.extreme + offset - previous };
    this.model.setViewport({ offset, size });
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
  private residual(key: string) {
    const element = [...this.host.rows].find(([, rowKey]) => rowKey === key)?.[0];
    if (!element) return null;
    const { scroller } = this.host;
    const contentTop = scroller.getBoundingClientRect().top + scroller.clientTop - scroller.scrollTop;
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
    // Added to the core's answer so the anchor's element, not its core position, holds still.
    let correction = 0;
    let residual: number | null = null;
    for (let pass = 1; ; pass++) {
      if (pass > maxPasses) throw new Error(`Layout did not settle within ${maxPasses} passes (${reason}).`);
      this.host.commit();
      this.committed = core.renderRange();
      const measured = this.measureMounted();
      updates.push(...measured);
      const resolved = snapshot && resolveAnchor(snapshot, core, this.host.scroller.clientHeight);
      if (resolved) this.scrollTo(resolved.offset + correction);
      else this.report();
      key = resolved ? resolved.key : null;
      if (measured.length > 0 || !sameRange(core.renderRange(), this.committed)) continue;
      // The residual is in content coordinates, so it does not change with the scroll position:
      // once applied, the next settled pass finds the same value and stops.
      // An anchor outside the render range has no element to compare, so nothing to correct.
      residual = key === null ? null : this.residual(key);
      if ((residual ?? 0) === correction) break;
      correction = residual ?? 0;
    }

    if (Math.abs(correction) > Math.abs(this.model.maxResidual)) this.model.maxResidual = correction;
    this.model.lastAnchor = {
      reason,
      key,
      delta: core.viewport!.offset - before,
      residual,
    };
    this.host.flash(updates);
    // Paint now: from a ResizeObserver callback, this frame's animation callbacks already ran.
    this.model.flush();
  }

  onScroll() {
    const read = this.host.scroller.scrollTop;
    // The echo of our own write; the logical offset is already reported.
    if (this.logical?.read === read) return;
    this.model.scroll = nextScrollDirection(this.model.scroll, read);
    this.report();
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
