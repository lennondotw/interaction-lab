/**
 * One column's interaction: drag, fling, wheel, keyboard, and where it settles.
 *
 * The hook owns a single `MotionValue` — `offset`, in pixels — and nothing else
 * about the wheel. `wheel-geometry.ts` turns that number into rows and indices,
 * `WheelColumn` draws it, and React is told the selected index but never asked to
 * position anything. That split is the reason a fling cannot tear: the label a row
 * shows and the transform that moves it are both derived from `offset` inside
 * Motion's frame, so they cannot land on different frames.
 *
 * ## Drag, fling and snap are one animation, not three
 *
 * Motion's `inertia` type decelerates from a release velocity, and `modifyTarget`
 * bends where it comes to rest. Handing it `nearestDetentOffset` makes the natural
 * resting point the nearest item — and because `inertia` recomputes its amplitude
 * when `modifyTarget` moves the target, the curve still starts at the release
 * velocity and lands exactly on the detent. No second "now snap" animation, so
 * none of the two-stage feel of a fling that visibly stops and then tugs.
 *
 * Two things about that call are not obvious and are commented at the site: why it
 * is passed an explicit target it appears to ignore, and why the velocity does not
 * come from `MotionValue.getVelocity()`.
 *
 * ## There is no non-looping path
 *
 * Every column loops, including the two-item meridiem. So no clamping, no
 * rubber-band, no end-of-list state — `wrapIndex` is the whole story and the
 * absence of those branches is deliberate rather than unfinished.
 */

import { animate, useMotionValue, useMotionValueEvent, useReducedMotion, type MotionValue } from 'motion/react';
import { useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';

import { pushSample, trackVelocity, type PointerSample } from './pointer-velocity.js';
import { indexFromOffset, nearestDetentOffset, nearestOffsetForIndex, rebaseOffset } from './wheel-geometry.js';

/** Matches Motion's own default. Higher throws further for the same flick. */
const INERTIA_POWER = 0.8;
/** Milliseconds of deceleration. Motion defaults to 325; a wheel wants to settle sooner than a dragged card. */
const INERTIA_TIME_CONSTANT = 260;
/** Sub-pixel, because the detent is an exact multiple of `itemHeight` and should be reached as one. */
const INERTIA_REST_DELTA = 0.1;

/** For the settles that have no fling behind them: a cancel, a key press, a controlled change. */
const SNAP_SPRING = { type: 'spring', stiffness: 520, damping: 42, mass: 0.6, restDelta: 0.1 } as const;

/** How long after the last wheel event to call the gesture over. Trackpad momentum arrives in bursts. */
const WHEEL_SETTLE_MS = 140;

export interface UseWheelOptions {
  /** Number of distinct items. The loop period is `count * itemHeight`. */
  count: number;
  itemHeight: number;
  /** Odd. Only needed so a page-sized wheel delta means something. */
  rows: number;
  /** Controlled selection. */
  index: number;
  onIndexChange: (index: number) => void;
}

export interface WheelHandlers {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  onLostPointerCapture: (event: PointerEvent<HTMLElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

export interface Wheel {
  /** Pixels scrolled. `offset / itemHeight` is the fractional index on the centre line. */
  offset: MotionValue<number>;
  /**
   * Attach to the same element as `handlers`. The hook installs its own
   * non-passive `wheel` listener here, which a React `onWheel` prop cannot be:
   * React registers `wheel` passively on the root, so `preventDefault` from a
   * prop is ignored and the page scrolls behind the picker.
   */
  elementRef: RefObject<HTMLDivElement | null>;
  handlers: WheelHandlers;
}

export function useWheel({ count, itemHeight, rows, index, onIndexChange }: UseWheelOptions): Wheel {
  const prefersReducedMotion = useReducedMotion();
  const offset = useMotionValue(index * itemHeight);
  const elementRef = useRef<HTMLDivElement>(null);

  const pointerIdRef = useRef<number | null>(null);
  const startRef = useRef<{ pointerY: number; offset: number } | null>(null);
  const samplesRef = useRef<PointerSample[]>([]);
  const animationRef = useRef<{ stop: () => void } | null>(null);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True from the first input of a gesture until its settle finishes. Gates the controlled sync. */
  const interactingRef = useRef(false);
  /** Last index handed to the parent, so a change event is only sent when it actually changes. */
  const reportedIndexRef = useRef(index);
  /**
   * Where the arrow keys have already asked the wheel to go, or null when they are
   * not the thing driving it.
   *
   * Stepping from `offset.get()` looks equivalent and is not: two presses inside
   * one frame both read an offset that has not moved yet, so both compute the same
   * detent, and the second press is swallowed. Counting from the last commanded
   * target instead makes each press add a row whatever the frame rate.
   */
  const keyTargetRef = useRef<number | null>(null);

  const stopAnimation = useCallback(() => {
    animationRef.current?.stop();
    animationRef.current = null;
  }, []);

  /**
   * Called when a gesture has come fully to rest.
   *
   * The rebase is the whole reason the loop needs no DOM trickery: subtracting
   * whole laps here cannot move anything, because it changes `base` by a multiple
   * of `count` and every row reads `base` through `wrapIndex`. Doing it now rather
   * than mid-fling is what makes it safe — see `wheel-geometry.ts`.
   */
  const finishGesture = useCallback(() => {
    interactingRef.current = false;
    keyTargetRef.current = null;
    offset.set(rebaseOffset({ offset: offset.get(), itemHeight, count }));
  }, [count, itemHeight, offset]);

  /** Spring to a specific offset. For settles with no fling behind them. */
  const springTo = useCallback(
    (target: number) => {
      stopAnimation();
      if (prefersReducedMotion === true) {
        offset.set(target);
        finishGesture();
        return;
      }
      animationRef.current = animate(offset, target, { ...SNAP_SPRING, onComplete: finishGesture });
    },
    [finishGesture, offset, prefersReducedMotion, stopAnimation]
  );

  const settleWithVelocity = useCallback(
    (velocity: number) => {
      stopAnimation();

      // Reduced motion keeps the drag 1:1 but declines to throw the wheel: an
      // instant jump of twenty rows is more motion than the fling it replaces,
      // not less. So the projection is dropped and it lands where it was let go.
      if (prefersReducedMotion === true) {
        offset.set(nearestDetentOffset(offset.get(), itemHeight));
        finishGesture();
        return;
      }

      const snap = (value: number) => nearestDetentOffset(value, itemHeight);
      // The same projection `inertia` performs internally, computed here only so
      // the animation has a target that differs from the current value. Motion's
      // `canAnimate` skips an animation whose keyframes have not changed unless
      // the type is a spring or a generator function, and `'inertia'` is neither
      // — passing `offset.get()` produces a silent no-op and no fling at all.
      // `inertia` reads `keyframes[0]` and ignores this, then arrives at the same
      // place via `modifyTarget`, so the two cannot disagree.
      const projected = snap(offset.get() + INERTIA_POWER * velocity);

      animationRef.current = animate(offset, projected, {
        type: 'inertia',
        velocity,
        power: INERTIA_POWER,
        timeConstant: INERTIA_TIME_CONSTANT,
        restDelta: INERTIA_REST_DELTA,
        modifyTarget: snap,
        onComplete: finishGesture,
      });
    },
    [finishGesture, itemHeight, offset, prefersReducedMotion, stopAnimation]
  );

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      // One pointer owns the gesture. Admitting a second finger would hand the
      // drag over and then release capture for the wrong id.
      if (pointerIdRef.current !== null) return;

      stopAnimation();
      interactingRef.current = true;
      // A drag takes the wheel over from the arrow keys, so whatever they had
      // queued up stops being the thing to count from.
      keyTargetRef.current = null;
      pointerIdRef.current = event.pointerId;
      startRef.current = { pointerY: event.clientY, offset: offset.get() };
      samplesRef.current = [{ time: performance.now(), y: event.clientY }];
      event.currentTarget.setPointerCapture(event.pointerId);
      // Stops the native text-selection and drag-and-drop gestures, either of
      // which would take the pointer stream away before the release arrives.
      event.preventDefault();
    },
    [offset, stopAnimation]
  );

  const releaseCapture = useCallback((event: PointerEvent<HTMLElement>) => {
    pointerIdRef.current = null;
    startRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.pointerId !== pointerIdRef.current) return;
      const velocity = -trackVelocity({ samples: samplesRef.current, now: performance.now() });
      samplesRef.current = [];
      releaseCapture(event);
      // Negated on the way in: dragging the finger down moves the list down,
      // which is a decrease in offset.
      settleWithVelocity(velocity);
    },
    [releaseCapture, settleWithVelocity]
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.pointerId !== pointerIdRef.current) return;
      const start = startRef.current;
      if (start === null) return;
      // Capture routes moves here from outside the element but cannot promise the
      // release arrives — let go over another window and this document never sees
      // `pointerup`. `buttons === 0` on the next move is the only evidence.
      if (event.buttons === 0) {
        onPointerUp(event);
        return;
      }
      pushSample(samplesRef.current, { time: performance.now(), y: event.clientY });
      offset.set(start.offset - (event.clientY - start.pointerY));
    },
    [offset, onPointerUp]
  );

  /**
   * A cancel is an invalidation, not an exit — a rejected palm, the browser
   * claiming the gesture. Where a release throws the wheel, a cancel only tidies
   * up: it snaps to the nearest detent and discards the velocity, because nothing
   * the cancelled gesture was doing was asked for.
   */
  const onPointerCancel = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.pointerId !== pointerIdRef.current) return;
      samplesRef.current = [];
      releaseCapture(event);
      springTo(nearestDetentOffset(offset.get(), itemHeight));
    },
    [itemHeight, offset, releaseCapture, springTo]
  );

  /** Capture can end with no release event at all — the element being detached is the usual way. */
  const onLostPointerCapture = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.pointerId !== pointerIdRef.current) return;
      samplesRef.current = [];
      releaseCapture(event);
      springTo(nearestDetentOffset(offset.get(), itemHeight));
    },
    [itemHeight, offset, releaseCapture, springTo]
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
      if (step === 0) return;
      event.preventDefault();
      interactingRef.current = true;
      const from = keyTargetRef.current ?? nearestDetentOffset(offset.get(), itemHeight);
      const target = from + step * itemHeight;
      keyTargetRef.current = target;
      springTo(target);
    },
    [itemHeight, offset, springTo]
  );

  // Wheel and trackpad. Non-passive so the page does not scroll underneath, which
  // rules out React's `onWheel` prop — see `Wheel.elementRef`.
  useEffect(() => {
    const element = elementRef.current;
    if (element === null) return;

    const onWheelEvent = (event: WheelEvent) => {
      event.preventDefault();
      stopAnimation();
      interactingRef.current = true;
      keyTargetRef.current = null;

      // `deltaMode` is pixels almost everywhere, but Firefox reports lines and
      // some remotes report pages; both are a multiple of the wheel's own metrics.
      const scale = event.deltaMode === 1 ? itemHeight : event.deltaMode === 2 ? itemHeight * rows : 1;
      offset.set(offset.get() + event.deltaY * scale);

      // Trackpad momentum arrives as a decaying burst of events, so the gesture
      // is over when they stop rather than at any one event. Settling with zero
      // velocity is right for the same reason: the burst has already decayed.
      if (wheelTimerRef.current !== null) clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = setTimeout(() => {
        wheelTimerRef.current = null;
        springTo(nearestDetentOffset(offset.get(), itemHeight));
      }, WHEEL_SETTLE_MS);
    };

    element.addEventListener('wheel', onWheelEvent, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheelEvent);
    };
  }, [itemHeight, offset, rows, springTo, stopAnimation]);

  useEffect(
    () => () => {
      if (wheelTimerRef.current !== null) clearTimeout(wheelTimerRef.current);
    },
    []
  );

  // The only route from the wheel back to React. Fires as each detent is crossed
  // rather than on settle, so a readout can follow a fling; nothing on screen
  // depends on it, so the re-render cannot tear the rows.
  useMotionValueEvent(offset, 'change', (value) => {
    const next = indexFromOffset(value, itemHeight, count);
    if (next === reportedIndexRef.current) return;
    reportedIndexRef.current = next;
    onIndexChange(next);
  });

  // Controlled changes from outside. Ignored while a gesture is in flight, or the
  // parent's own `onIndexChange` would fight the fling that produced it.
  useEffect(() => {
    if (interactingRef.current) return;
    if (index === reportedIndexRef.current) return;
    const current = offset.get();
    const target = nearestOffsetForIndex({ fromOffset: current, index, itemHeight, count });
    if (target === current) return;
    springTo(target);
  }, [count, index, itemHeight, offset, springTo]);

  return {
    offset,
    elementRef,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onLostPointerCapture, onKeyDown },
  };
}
