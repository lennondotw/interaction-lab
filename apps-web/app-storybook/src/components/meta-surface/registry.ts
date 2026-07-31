/**
 * The participants' measured rects, held outside React.
 *
 * A rect changes whenever the observation cascade fires, which is far more often
 * than anything in the tree needs to re-render — and nothing in the tree depends on
 * a rect's value, only the painted overlay does. Routing them through state would
 * re-render every participant to move one curve.
 *
 * So this is an external store with one subscriber, the overlay, which coalesces
 * whatever arrived into a single trace on the next frame. Several items settling
 * inside one layout pass produce one redraw rather than one each.
 */

import type { FieldShape } from '#src/animations/sdf-edge-trace/field.js';

export interface ShapeRect {
  /** Container-relative, in CSS px. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Largest corner radius on the element, in CSS px. */
  radius: number;
}

/**
 * A rect in the tracer's terms: centre plus half-extents of the whole box.
 *
 * `FieldShape` takes half-extents including the corners precisely so this is a
 * division and nothing else — no adjustment for the radius, no reasoning about which
 * corner. A DOM rect is already the shape the field wants.
 */
export const rectToShape = (rect: ShapeRect): FieldShape => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
  hw: rect.width / 2,
  hh: rect.height / 2,
  r: rect.radius,
});

export class ShapeRegistry {
  private readonly rects = new Map<string, ShapeRect>();
  private listeners = new Set<() => void>();
  /** Bumped on every mutation so a consumer can tell "nothing changed" cheaply. */
  private version = 0;

  set(id: string, rect: ShapeRect): void {
    const previous = this.rects.get(id);
    if (
      previous !== undefined &&
      previous.x === rect.x &&
      previous.y === rect.y &&
      previous.width === rect.width &&
      previous.height === rect.height &&
      previous.radius === rect.radius
    ) {
      // The cascade is deliberately over-eager — a window scroll fires every
      // participant's `measure` whether it moved or not. Dropping the no-ops here is
      // what keeps a scroll from queueing a redraw per frame per item.
      return;
    }
    this.rects.set(id, rect);
    this.emit();
  }

  delete(id: string): void {
    if (this.rects.delete(id)) this.emit();
  }

  /**
   * Insertion order, which is registration order, which is mount order. Stable
   * enough that the shape does not reshuffle between traces — the field is a
   * commutative smin so order cannot change the geometry, but a stable order keeps
   * the debug readout comparable frame to frame.
   */
  shapes(): FieldShape[] {
    return [...this.rects.values()].map(rectToShape);
  }

  list(): ShapeRect[] {
    return [...this.rects.values()];
  }

  get size(): number {
    return this.rects.size;
  }

  getVersion(): number {
    return this.version;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }
}
