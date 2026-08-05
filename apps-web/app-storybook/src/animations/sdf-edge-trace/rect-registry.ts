/**
 * How a laid-out DOM rect becomes a field primitive, and where the set of them lives.
 *
 * Kept next to the field rather than next to either consumer, because that is where the
 * dependency already pointed: a rect's whole purpose here is to be a `FieldShape`, and
 * both `MetaSurface` and the `RectField` story need the same conversion. One
 * implementation, so the diagnostic story and the component cannot disagree about what
 * a div's shape is.
 *
 * The two observation primitives it leans on still live with the beacon, which is where
 * their proof is — the ablation probe in archive/2026-07-beacon-layout-observation
 * exercises that copy and no other.
 */

import { layoutOffsetRelativeTo } from '#src/components/beacon/layout-offset.js';
import { useLayoutObservation } from '#src/components/beacon/use-layout-observation.js';
import { useCallback, useEffect, useId, type RefObject } from 'react';
import type { FieldShape } from './field.js';

export interface ShapeRect {
  /** Container-relative, in CSS px. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Largest corner radius on the element, in CSS px. */
  radius: number;
}

/** Field-by-field, because a rect is remeasured into a fresh object every time. */
const isSameRect = (a: ShapeRect, b: ShapeRect): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height && a.radius === b.radius;

/**
 * A rect in the tracer's terms: centre plus half-extents of the whole box.
 *
 * `FieldShape` takes half-extents *including* the corners precisely so this is a
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

/**
 * Largest of the four corner radii, resolved to px.
 *
 * Largest rather than an average because the field takes one radius, and rounding a
 * corner *less* than the element does makes the surface poke outside the element it is
 * tracing. Percentage radii come back from `getComputedStyle` already resolved against
 * the box, so no unit handling is needed.
 */
export const readCornerRadius = (el: HTMLElement): number => {
  const style = getComputedStyle(el);
  const corners = [
    style.borderTopLeftRadius,
    style.borderTopRightRadius,
    style.borderBottomRightRadius,
    style.borderBottomLeftRadius,
  ];
  let largest = 0;
  for (const corner of corners) {
    // A two-value corner ("12px 30px") is elliptical; the first value is the horizontal
    // radius, which is the closer of the two to what one circular radius means here.
    const first = Number.parseFloat(corner);
    if (Number.isFinite(first) && first > largest) largest = first;
  }
  return largest;
};

/**
 * The participants' measured rects, held outside React.
 *
 * A rect changes whenever the observation cascade fires, which is far more often than
 * anything in a tree needs to re-render — and nothing in a tree depends on a rect's
 * value, only the painted output does. Routing them through state would re-render every
 * participant to move one curve.
 *
 * So: an external store with one subscriber, which coalesces whatever arrived into a
 * single trace on the next frame.
 */
export class ShapeRegistry {
  private readonly rects = new Map<string, ShapeRect>();
  private listeners = new Set<() => void>();
  private version = 0;

  set(id: string, rect: ShapeRect): void {
    const previous = this.rects.get(id);
    if (previous !== undefined && isSameRect(previous, rect)) {
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
   * Insertion order, which is registration order, which is mount order. The field is a
   * commutative smin so order cannot change the geometry, but a stable order keeps a
   * debug readout comparable frame to frame.
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

/**
 * Registers `ref`'s laid-out rect with `registry`, and keeps it current.
 *
 * The measurement is the beacon's: `offsetWidth` / `offsetHeight` plus the
 * `offsetParent` walk, so the shape follows where the box model *lays the element out*
 * and is immune to presentation transforms above it. That is the contract — a card
 * sliding on a transform keeps its lobe where its layout is, which is what makes a
 * merged shape stable while something animates over it. Following the visual rect would
 * need `getBoundingClientRect` polled every frame, since transforms fire no observer.
 *
 * `radius` overrides the computed corner radius when a caller wants the field to round
 * differently from the CSS.
 */
export function useRegisteredRect(
  ref: RefObject<HTMLElement | null>,
  registry: ShapeRegistry | null,
  containerRef: RefObject<HTMLElement | null> | null,
  radius?: number
): void {
  const id = useId();

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el || registry === null) return;
    const container = containerRef?.current ?? null;
    const layout = layoutOffsetRelativeTo(el, container);
    if (layout === null) return;

    registry.set(id, {
      x: layout.x,
      y: layout.y,
      width: el.offsetWidth,
      height: el.offsetHeight,
      radius: radius ?? readCornerRadius(el),
    });
  }, [containerRef, id, radius, ref, registry]);

  useLayoutObservation(ref, containerRef, measure, { enabled: registry !== null });

  useEffect(() => () => registry?.delete(id), [id, registry]);
}
