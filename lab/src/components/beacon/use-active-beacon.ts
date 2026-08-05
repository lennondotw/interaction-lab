/**
 * `useActiveBeacon` — subscribe to the active beacon for a slot and
 * return position / size as spring-driven `MotionValue`s + the current
 * discrete state plus a target snapshot.
 *
 * This is the primitive that powers `BeaconFollower` (default slot,
 * renders a styled surface) and any feature-specific slot renderer.
 * The hook owns:
 *
 * - Mount gating, so the caller can delay rendering until the first
 *   real target lands (avoids the fly-in-from-origin paint bug).
 * - Spring jumping on first paint, so the initial placement is instant.
 * - Velocity-continuous handoff when the active beacon swaps within a
 *   slot, implemented as a simple re-subscribe to the new entry's
 *   MotionValues without resetting the springs.
 * - Optional `resetOnEmpty`: when the stack goes empty the mount gate
 *   is released so the NEXT active snaps fresh rather than gliding in
 *   from wherever the springs were last parked. Use under
 *   `BeaconFollower`'s `onEmpty='hide'` so an unmount → push cycle
 *   doesn't resurrect the surface with a fly-in animation.
 */

import { useMotionValue, useReducedMotion, useSpring, type MotionValue } from 'motion/react';
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { BeaconStoreContext } from './context.js';

const POSITION_SPRING = { stiffness: 380, damping: 30, mass: 0.9 } as const;
const SIZE_SPRING = { stiffness: 420, damping: 32, mass: 1.0 } as const;
// Reduced-motion path: `{ duration: 0 }` on its own hits motion's
// spring `minDuration` clamp and ends up as a ~10 ms spring rather than
// an instant snap. Forcing `type: 'tween'` skips the spring generator
// and honours `duration: 0` literally.
const INSTANT_TRANSITION = { type: 'tween' as const, duration: 0 };

/** Unsubscribe stub for the no-provider case. */
const NOOP_UNSUBSCRIBE = (): void => undefined;

export interface UseActiveBeaconOptions {
  /**
   * Release the mount gate on every empty-stack transition. When the
   * next beacon arrives the springs are jumped to its target instead
   * of gliding in from the springs' last held position.
   *
   * Recommended for `BeaconFollower`'s `onEmpty='hide'` mode so a hide
   * → push cycle snaps rather than animates across the (now hidden)
   * gap. Leave at the default `false` for `'freeze'` so the
   * frozen-position → next-target transition glides with continuity.
   *
   * @default false
   */
  resetOnEmpty?: boolean;
  /**
   * Optional one-shot starting rectangle for the first active beacon.
   * When provided, the springs are seeded from this rect instead of
   * jumping straight to the first target, then animate to the active
   * beacon normally. Useful for route-level handoff where the previous
   * surface lived under a different provider.
   */
  initialRect?: BeaconInitialRect | null;
}

export interface BeaconInitialRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ActiveBeacon {
  /** True once the first real beacon has landed and the springs have been seeded. */
  mounted: boolean;
  /** True when the stack for this slot is empty. */
  empty: boolean;
  /** x, y, width, height driven by `useSpring` — stable identities across mount. */
  x: MotionValue<number>;
  y: MotionValue<number>;
  width: MotionValue<number>;
  height: MotionValue<number>;
  /**
   * Current target (beacon-provided) position & size at this render.
   * These reflect the **new** active beacon synchronously on the same
   * render that observes an `activeId` change — unlike `width.get()` /
   * etc., which track the spring's transient value and lag one effect
   * behind on handoffs. Consumers whose internal geometry depends on
   * size should read these.
   */
  targetX: number;
  targetY: number;
  targetWidth: number;
  targetHeight: number;
  /** Whether the last active beacon allows empty-state preservation. */
  preserveOnEmpty: boolean;
}

export function useActiveBeacon(
  slot?: string,
  { resetOnEmpty = false, initialRect = null }: UseActiveBeaconOptions = {}
): ActiveBeacon {
  const store = useContext(BeaconStoreContext);

  // Re-render only when the active entry's id changes — not on
  // lower-priority stack mutations or MotionValue updates.
  const activeId = useSyncExternalStore(
    (fn) => store?.subscribe(fn) ?? NOOP_UNSUBSCRIBE,
    () => store?.getActive(slot)?.id ?? null,
    () => store?.getActive(slot)?.id ?? null
  );

  // Memoize by id so that a priority replace (which rebuilds the entry
  // object but keeps the id + MV identities) doesn't churn the effect
  // below and resubscribe four listeners on every state flip.
  const active = useMemo(() => {
    if (!activeId || !store) return null;
    const entry = store.getActive(slot);
    return entry?.id === activeId ? entry : null;
  }, [activeId, store, slot]);

  const prefersReducedMotion = useReducedMotion();

  const targetX = useMotionValue(0);
  const targetY = useMotionValue(0);
  const targetW = useMotionValue(0);
  const targetH = useMotionValue(0);

  const springX = useSpring(targetX, prefersReducedMotion ? INSTANT_TRANSITION : POSITION_SPRING);
  const springY = useSpring(targetY, prefersReducedMotion ? INSTANT_TRANSITION : POSITION_SPRING);
  const springW = useSpring(targetW, prefersReducedMotion ? INSTANT_TRANSITION : SIZE_SPRING);
  const springH = useSpring(targetH, prefersReducedMotion ? INSTANT_TRANSITION : SIZE_SPRING);

  const [mounted, setMounted] = useState(false);
  const hasBeenActiveRef = useRef(false);

  // Remembered so the returned `preserveOnEmpty` survives the slot going empty:
  // callers need the *last* active beacon's choice to decide whether to keep
  // gliding once there is nothing active. State rather than a ref, because it
  // feeds the return value — mutating a ref would not re-render, so the hook
  // could keep reporting a previous activation's choice. Adjusted during render
  // (React's documented recipe, same as elsewhere in this repo) rather than from
  // an effect, which would cost a second paint per activation.
  const [lastActivePreserveOnEmpty, setLastActivePreserveOnEmpty] = useState(true);
  const activePreserveOnEmpty = active ? active.preserveOnEmpty !== false : lastActivePreserveOnEmpty;
  if (active && lastActivePreserveOnEmpty !== activePreserveOnEmpty) {
    setLastActivePreserveOnEmpty(activePreserveOnEmpty);
  }

  // Tracks `initialRect` until the first activation, so a caller that measures
  // it asynchronously still seeds the springs from the real rect. Mirrored in a
  // layout effect rather than during render: the sole reader is the passive
  // effect below, and every layout effect runs before every passive one, so the
  // write always lands first no matter where this sits.
  const initialRectRef = useRef(initialRect);
  useLayoutEffect(() => {
    initialRectRef.current = initialRect;
  });

  useEffect(() => {
    if (!active) {
      // Releasing the mount gate on empty makes the NEXT active snap
      // fresh. Under `onEmpty='hide'` the motion.div was unmounted
      // anyway so this is invisible; under `'freeze'` the caller opts
      // out (default `resetOnEmpty: false`) to preserve the glide.
      if (resetOnEmpty) hasBeenActiveRef.current = false;
      return;
    }
    const x = active.x.get();
    const y = active.y.get();
    const w = active.w.get();
    const h = active.h.get();

    if (!hasBeenActiveRef.current) {
      hasBeenActiveRef.current = true;
      const seed = initialRectRef.current;
      if (seed && seed.width > 0 && seed.height > 0) {
        targetX.set(seed.x);
        targetY.set(seed.y);
        targetW.set(seed.width);
        targetH.set(seed.height);
        springX.jump(seed.x);
        springY.jump(seed.y);
        springW.jump(seed.width);
        springH.jump(seed.height);
      } else {
        targetX.set(x);
        targetY.set(y);
        targetW.set(w);
        targetH.set(h);
        // First real target — jump the springs before the renderer
        // paints so the initial frame lands at the target instead of
        // flying in from `(0, 0)` (or the previous-before-hide
        // position, under `resetOnEmpty`).
        springX.jump(x);
        springY.jump(y);
        springW.jump(w);
        springH.jump(h);
      }
      setMounted(true);
    }

    targetX.set(x);
    targetY.set(y);
    targetW.set(w);
    targetH.set(h);

    const unsubs = [
      active.x.on('change', (v) => targetX.set(v)),
      active.y.on('change', (v) => targetY.set(v)),
      active.w.on('change', (v) => targetW.set(v)),
      active.h.on('change', (v) => targetH.set(v)),
    ];
    return () => {
      for (const u of unsubs) u();
    };
    // Springs are identity-stable across renders, so we omit them from
    // the dep array — the only actual trigger is a new active entry
    // (post memo, that means an id change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, targetX, targetY, targetW, targetH, resetOnEmpty]);

  return {
    mounted,
    empty: active == null,
    x: springX,
    y: springY,
    width: springW,
    height: springH,
    // Target snapshot from the active beacon itself, not the spring.
    // When `activeId` changes React re-renders on the same frame the
    // new entry's MVs already hold its measured target (the anchor's
    // ResizeObserver wrote them before push), so these are safe to
    // read synchronously.
    targetX: active?.x.get() ?? 0,
    targetY: active?.y.get() ?? 0,
    targetWidth: active?.w.get() ?? 0,
    targetHeight: active?.h.get() ?? 0,
    preserveOnEmpty: activePreserveOnEmpty,
  };
}
