/**
 * Dragging the balls around, extracted so the canvas story and the SVG/DOM
 * stories share one implementation.
 *
 * Almost all of this is the four ways a pointer drag can end. Only one of them
 * is `pointerup`, and every other one used to leave a ball welded to the cursor.
 * The comments on each handler are the specific failure they exist for; they are
 * worth reading before simplifying any of them away.
 *
 * The hook owns the gesture and the caller owns the positions: it reads them
 * through `readBalls` to hit-test and writes them through `moveBall`, rather than
 * being handed a ref to mutate. Partly because the React Compiler's immutability
 * rule refuses a hook that modifies its own arguments, and partly because that
 * rule is right here — where a ball's coordinates live is the caller's business,
 * and this way a caller is free to keep them in a ref, a store, or anywhere else.
 *
 * `moveBall` receives coordinates already clamped to the domain.
 */

import { PointerEvent as ReactPointerEvent, RefObject, useCallback, useRef } from 'react';
import { Ball } from './field.js';

export interface BallDragHandlers {
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerUp: (event: ReactPointerEvent) => void;
  onPointerCancel: (event: ReactPointerEvent) => void;
  onLostPointerCapture: (event: ReactPointerEvent) => void;
}

export interface BallDrag {
  /** Index of the ball being dragged, or null. Read inside a frame loop, not during render. */
  activeBallRef: RefObject<number | null>;
  /** Spread onto whichever element receives the gesture — canvas, svg, or div. */
  handlers: BallDragHandlers;
}

export interface BallDragOptions {
  /** Current positions, for hit-testing. Not retained or written to. */
  readBalls: () => readonly Ball[];
  /** Move a ball to a position already clamped to `0..view` on both axes. */
  moveBall: (index: number, x: number, y: number) => void;
  /** Size of the square domain. Centres are clamped to it. */
  view: number;
  /** Grab radius, in domain units. */
  radius: number;
}

export function useBallDrag({ readBalls, moveBall, view, radius }: BallDragOptions): BallDrag {
  const activeBallRef = useRef<number | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragStartRef = useRef<Ball | null>(null);

  /**
   * Element coordinates to domain coordinates. Uses the element's own rect, so
   * it is correct for any size the caller lays the surface out at without the
   * hook being told the scale.
   */
  const toDomain = useCallback(
    (event: ReactPointerEvent): Ball => {
      const rect = event.currentTarget.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * view,
        y: ((event.clientY - rect.top) / rect.height) * view,
      };
    },
    [view]
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      // Capture routes one pointer's moves here, but it does not stop a second
      // finger from opening its own `pointerdown` on the same element. Admitting
      // one would hand the drag to a different pointer and then release capture
      // for the wrong id, so the first pointer owns the drag until it ends.
      if (dragPointerIdRef.current !== null) return;

      const point = toDomain(event);
      const balls = readBalls();
      let best: number | null = null;
      let bestDistance = radius;
      for (let index = 0; index < balls.length; index++) {
        const ball = balls[index];
        if (!ball) continue;
        const distance = Math.hypot(ball.x - point.x, ball.y - point.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      }
      if (best === null) return;
      const grabbed = balls[best];
      if (!grabbed) return;

      activeBallRef.current = best;
      dragPointerIdRef.current = event.pointerId;
      dragStartRef.current = { x: grabbed.x, y: grabbed.y };
      event.currentTarget.setPointerCapture(event.pointerId);
      // Keeps the native text-selection and drag-and-drop gestures from starting
      // alongside this one — a real drag-and-drop session would take the pointer
      // stream away and the release would never arrive.
      event.preventDefault();
    },
    [radius, readBalls, toDomain]
  );

  const endDrag = useCallback((event: ReactPointerEvent) => {
    activeBallRef.current = null;
    dragPointerIdRef.current = null;
    dragStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent) => {
      if (event.pointerId !== dragPointerIdRef.current) return;
      endDrag(event);
    },
    [endDrag]
  );

  /**
   * `pointercancel` is an invalidation rather than an exit — a rejected palm, a
   * pointer physically removed, the browser claiming the gesture for itself. The
   * position the ball drifted to was never something the user asked for, so it
   * goes back to where the drag started instead of being left wherever the
   * cancelled gesture happened to stop.
   */
  const onPointerCancel = useCallback(
    (event: ReactPointerEvent) => {
      if (event.pointerId !== dragPointerIdRef.current) return;
      const index = activeBallRef.current;
      const start = dragStartRef.current;
      endDrag(event);
      if (index === null || start === null) return;
      moveBall(index, start.x, start.y);
    },
    [endDrag, moveBall]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      if (event.pointerId !== dragPointerIdRef.current) return;
      const index = activeBallRef.current;
      if (index === null) return;
      // Pointer capture routes moves here from outside the element, but it cannot
      // promise the release ever arrives: let go over another window, or lose the
      // pointer to an OS gesture, and this document never sees `pointerup`. The
      // first move after the cursor comes back is the only evidence, and it
      // carries it in `buttons` — no button down means the drag is already over,
      // so end it here rather than dragging the ball around by a released mouse.
      if (event.buttons === 0) {
        onPointerUp(event);
        return;
      }
      const point = toDomain(event);
      moveBall(index, Math.min(Math.max(point.x, 0), view), Math.min(Math.max(point.y, 0), view));
    },
    [moveBall, onPointerUp, toDomain, view]
  );

  /**
   * Capture can also end without a release event of any kind — the element being
   * detached is the usual way. `lostpointercapture` fires for every exit,
   * including the ones `pointerup` and `pointercancel` miss, so it is the
   * backstop that guarantees no drag outlives its capture.
   */
  const onLostPointerCapture = useCallback(
    (event: ReactPointerEvent) => {
      if (event.pointerId !== dragPointerIdRef.current) return;
      endDrag(event);
    },
    [endDrag]
  );

  return {
    activeBallRef,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onLostPointerCapture },
  };
}
