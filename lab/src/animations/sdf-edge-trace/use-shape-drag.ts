/**
 * Dragging shapes whose positions are *computed* rather than stored.
 *
 * `useBallDrag` assumes the caller keeps its centres somewhere mutable, which the ball
 * stories do. The later stories don't: their shapes come out of a scene definition or a
 * layout table, derived from the controls, so there is no array to write a new centre into.
 *
 * So the drag is kept as a **delta per shape** against that derived layout. Two things fall
 * out of it, both of which the obvious alternative gets wrong:
 *
 * - **Changing geometry does not move a shape back.** Drag the star, then raise the radius:
 *   the layout is recomputed, the delta still applies, and the star stays where it was put.
 *   Storing absolute positions and re-seeding them whenever the layout changed would snap
 *   every shape home on each turn of a slider.
 * - **A new scene is a new set of places.** Deltas are cleared when `resetKey` changes, since
 *   a scene's shapes are laid out somewhere else entirely and stale offsets would scatter them.
 *
 * Redrawing is coalesced to one frame and only happens while a drag is in flight. These
 * stories trace in 8–16ms, so a permanent `requestAnimationFrame` loop of the kind the ball
 * stories run would keep a core busy for a picture that is not changing.
 */

import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';

import type { FieldShape } from '#src/components/meta-surface/sdf/field.js';

import { useBallDrag, type BallDragHandlers } from './use-ball-drag.js';

export interface ShapeDragOptions<T extends FieldShape> {
  /**
   * Canonical positions, straight from the scene or layout. Read through a ref internally, so
   * a new array every render costs nothing and the gesture always sees the current one.
   */
  layout: readonly T[];
  /** Size of the square domain; centres are clamped to it. */
  view: number;
  /** Grab radius around a shape's centre, in domain units. */
  grab: number;
  /** Deltas are cleared when this changes. Pass whatever identifies "somewhere else". */
  resetKey: unknown;
  /**
   * The caller's current `draw`, which a pointer move calls to repaint.
   *
   * Owned by the caller and only ever *read* here — the hook cannot hold `draw` directly
   * (it would rebuild every gesture callback on each control change) and cannot own the ref
   * either, because the caller assigning through a returned object is exactly what the React
   * Compiler's immutability rule refuses. A ref passed in and read is legal both ways round.
   */
  drawRef: RefObject<() => void>;
}

export interface ShapeDrag<T extends FieldShape> {
  handlers: BallDragHandlers;
  /** Index being dragged, or null. Read inside a draw, never during render. */
  activeRef: RefObject<number | null>;
  /** Schedule one redraw on the next frame, at most. */
  requestRedraw: () => void;
  /** `layout` with each shape's delta applied. Call at the top of a draw. */
  placed: () => T[];
  /** How far shape `index` has been dragged, as `[dx, dy]`. */
  deltaOf: (index: number) => readonly [number, number];
}

export function useShapeDrag<T extends FieldShape>({
  layout,
  view,
  grab,
  resetKey,
  drawRef,
}: ShapeDragOptions<T>): ShapeDrag<T> {
  /** Interleaved `dx, dy` per shape index. */
  const offsetsRef = useRef<number[]>([]);
  const layoutRef = useRef<readonly T[]>(layout);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    offsetsRef.current = [];
  }, [resetKey]);

  const requestRedraw = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      drawRef.current();
    });
  }, [drawRef]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    []
  );

  const readBalls = useCallback(() => {
    const shapes = layoutRef.current;
    const offsets = offsetsRef.current;
    return shapes.map((shape, index) => ({
      x: shape.x + (offsets[index * 2] ?? 0),
      y: shape.y + (offsets[index * 2 + 1] ?? 0),
    }));
  }, []);

  const moveBall = useCallback(
    (index: number, x: number, y: number) => {
      const shape = layoutRef.current[index];
      if (shape === undefined) return;
      offsetsRef.current[index * 2] = x - shape.x;
      offsetsRef.current[index * 2 + 1] = y - shape.y;
      requestRedraw();
    },
    [requestRedraw]
  );

  const { activeBallRef, handlers } = useBallDrag({ readBalls, moveBall, view, radius: grab });

  const placed = useCallback(
    () =>
      layoutRef.current.map((shape, index) => ({
        ...shape,
        x: shape.x + (offsetsRef.current[index * 2] ?? 0),
        y: shape.y + (offsetsRef.current[index * 2 + 1] ?? 0),
      })),
    []
  );

  const deltaOf = useCallback(
    (index: number) => [offsetsRef.current[index * 2] ?? 0, offsetsRef.current[index * 2 + 1] ?? 0] as const,
    []
  );

  // Stable identity, so a `draw` that depends on this is not rebuilt every render.
  return useMemo(
    () => ({ handlers, activeRef: activeBallRef, requestRedraw, placed, deltaOf }),
    [handlers, activeBallRef, requestRedraw, placed, deltaOf]
  );
}

/**
 * The grab target, drawn at each shape's centre.
 *
 * Small and hollow on purpose: it says "this is the handle" without competing with the
 * contour, which is the thing the story is about. The active one is filled so a drag that has
 * silently lost its pointer is visible rather than merely broken.
 */
export function drawCentreHandles(
  ctx: CanvasRenderingContext2D,
  shapes: readonly FieldShape[],
  activeIndex: number | null,
  color: string
): void {
  ctx.save();
  ctx.lineWidth = 1.5;
  for (let index = 0; index < shapes.length; index++) {
    const shape = shapes[index];
    if (shape === undefined) continue;
    const active = index === activeIndex;
    ctx.beginPath();
    ctx.arc(shape.x, shape.y, active ? 6 : 4, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.stroke();
    if (active) {
      ctx.fillStyle = color;
      ctx.fill();
    }
  }
  ctx.restore();
}
