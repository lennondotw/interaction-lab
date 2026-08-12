/**
 * `useBeacon` — declare that the calling component is a positional
 * placeholder. On mount the beacon is pushed onto the active store; on
 * unmount it is popped. A higher-level renderer reads the active
 * beacon for its slot and paints something at that position + size.
 *
 * The beacon itself carries only geometry (position, size, priority,
 * slot). Business state — variant, tint, phase — lives in a separate
 * domain context owned by the feature.
 *
 * Position and size are stored as MotionValues so high-frequency
 * updates (e.g. an anchor following a resizing element every frame) do
 * not trigger React renders.
 *
 * When no `BeaconProvider` is mounted the hook is a no-op — components
 * can sprinkle beacons without forcing every host to adopt the
 * provider. Hosts that want the visual effect mount the provider;
 * others get the hooks for free.
 *
 * Usage variants:
 *
 *   // 1. Controlled — caller computes position / size itself.
 *   useBeacon({ position, size, priority: 'high' })
 *
 *   // 2. Anchored — follow a DOM ref via ResizeObserver + scroll.
 *   useBeaconAnchor(ref, { priority: 'normal', slot: 'tooltip' })
 *
 *   // 3. Imperative — grab the handle for ref-based updates.
 *   const handle = useBeacon({...})
 *   handle.update({ position: next, size: next })
 */

import { useMotionValue } from 'motion/react';
import { useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';

import { BeaconContainerContext, BeaconOriginContext, BeaconStoreContext } from './context.js';
import { layoutOffsetRelativeTo } from './layout-offset.js';
import {
  readBeaconOriginFrame,
  resolveBeaconOrigin,
  resolveBeaconOriginAxis,
  toBeaconOriginFrame,
  type BeaconOrigin,
} from './origin.js';
import type { BeaconDescriptor, BeaconEntry, BeaconHandle, BeaconPriority } from './types.js';
import { useLayoutObservation } from './use-layout-observation.js';

// A no-op handle used when no provider is mounted. Allows components
// to sprinkle beacons without forcing every consumer to adopt the
// provider — the beacon simply has no effect.
const NOOP_HANDLE: BeaconHandle = { update: () => undefined };

export function useBeacon(descriptor: BeaconDescriptor | null): BeaconHandle {
  const store = useContext(BeaconStoreContext);
  const defaultOrigin = useContext(BeaconOriginContext);

  // Stable id per mount. React 19's `useId` is stable across Strict
  // Mode double-mount, and the store push is idempotent by id, so the
  // double-mount leaves at most one entry.
  const id = useId();

  // MotionValues are created once per mount; their identity is stable
  // across renders. Seeded from the first descriptor; subsequent
  // descriptor changes update the MVs in the effect below.
  const x = useMotionValue(descriptor?.position.x ?? 0);
  const y = useMotionValue(descriptor?.position.y ?? 0);
  const w = useMotionValue(descriptor?.size.width ?? 0);
  const h = useMotionValue(descriptor?.size.height ?? 0);

  // Slot is committed at the first non-null descriptor. Subsequent
  // descriptor changes that attempt to change slot are ignored — the
  // store keys an entry by slot + priority at push time, so changing
  // slot mid-lifetime would be an invisible migration bug.
  const slotRef = useRef<string | undefined>(descriptor?.slot);

  // Entry identity stays stable for the lifetime of the mount. The
  // store re-pushes (moves to LIFO tail) whenever we change priority;
  // MotionValue updates stay out of the React layer.
  const entryRef = useRef<BeaconEntry>({
    id,
    priority: descriptor?.priority ?? 'normal',
    slot: descriptor?.slot,
    preserveOnEmpty: descriptor?.preserveOnEmpty,
    // Seeded here, then re-read at push time (see `pendingOriginRef`).
    // Once pushed it is the fixed frame of this entry's x / y, so a
    // renderer can treat it as constant and reconcile frames only on
    // handoff.
    origin: resolveBeaconOrigin(descriptor?.origin, defaultOrigin),
    x,
    y,
    w,
    h,
  });

  // Keep entry fields in sync with the latest descriptor. The push /
  // pop pair handle register / unregister. When `descriptor` flips
  // null→non-null (or vice versa) we toggle registration to let
  // consumers conditionally emit a beacon without conditional hooks.
  //
  // `isEnabled` is extracted to a variable so the exhaustive-deps lint
  // rule can statically check the dep. We intentionally omit
  // `descriptor` itself — the second effect below handles per-frame
  // descriptor changes without re-running the push / pop pair.
  const isEnabled = descriptor != null;

  // Latest resolved origin, mirrored in a layout effect so the push
  // below reads the descriptor that is current *at push time*. A beacon
  // that mounts disabled has a null descriptor on its first render, and
  // committing that render's fallback would register the wrong frame the
  // moment it is enabled — silently, since the beacon then reports
  // plausible coordinates that mean something else. Layout effects all
  // run before passive ones, so this write always lands first.
  const pendingOriginRef = useRef(entryRef.current.origin);
  useLayoutEffect(() => {
    pendingOriginRef.current = resolveBeaconOrigin(descriptor?.origin, defaultOrigin);
  });

  useEffect(() => {
    if (!store || !isEnabled) return;
    const entry = entryRef.current;
    // Adopted per registration rather than per mount: the contract is
    // that the origin can't change while the beacon is pushed (the
    // positions written under it would be reinterpreted), and an
    // unregistered beacon has no position to preserve.
    entry.origin = pendingOriginRef.current;
    store.push(entry);
    return () => {
      store.pop(id);
    };
  }, [store, id, isEnabled]);

  useEffect(() => {
    if (!store || !descriptor) return;
    x.set(descriptor.position.x);
    y.set(descriptor.position.y);
    w.set(descriptor.size.width);
    h.set(descriptor.size.height);
    entryRef.current.preserveOnEmpty = descriptor.preserveOnEmpty;

    // Warn if the descriptor tries to change slot after mount.
    if (descriptor.slot !== slotRef.current) {
      console.warn(
        '[beacon] useBeacon: descriptor.slot is immutable after mount (got %o, expected %o).',
        descriptor.slot,
        slotRef.current
      );
    }

    // Same for the origin, with a sharper failure mode: the position
    // above was just written in the committed frame, so a silently
    // accepted change would reinterpret it and displace the beacon by
    // the difference between the two frames.
    const committedOrigin = entryRef.current.origin;
    const nextOrigin = resolveBeaconOrigin(descriptor.origin, defaultOrigin);
    if (nextOrigin.x !== committedOrigin.x || nextOrigin.y !== committedOrigin.y) {
      console.warn(
        '[beacon] useBeacon: descriptor.origin is immutable while registered (got %o, expected %o).',
        nextOrigin,
        committedOrigin
      );
    }

    const nextPriority = descriptor.priority ?? 'normal';
    if (entryRef.current.priority !== nextPriority) {
      entryRef.current = { ...entryRef.current, priority: nextPriority };
      store.replacePriority(id, nextPriority);
    }
  }, [descriptor, store, id, x, y, w, h, defaultOrigin]);

  return useMemo<BeaconHandle>(() => {
    if (!store) return NOOP_HANDLE;
    return {
      update: (partial) => {
        if (partial.position) {
          x.set(partial.position.x);
          y.set(partial.position.y);
        }
        if (partial.size) {
          w.set(partial.size.width);
          h.set(partial.size.height);
        }
        if (partial.preserveOnEmpty !== undefined) {
          entryRef.current.preserveOnEmpty = partial.preserveOnEmpty;
        }
        if (partial.priority !== undefined && partial.priority !== entryRef.current.priority) {
          entryRef.current = { ...entryRef.current, priority: partial.priority };
          store.replacePriority(id, partial.priority);
        }
      },
    };
  }, [store, id, x, y, w, h]);
}

// ---------------------------------------------------------------------------
// Anchored variant — follow a DOM ref.
// ---------------------------------------------------------------------------

export interface BeaconAnchorOptions {
  priority?: BeaconPriority;
  /** See {@link BeaconDescriptor.slot}. */
  slot?: string;
  /** See {@link BeaconDescriptor.preserveOnEmpty}. */
  preserveOnEmpty?: boolean;
  /**
   * See {@link BeaconDescriptor.origin}. Set the axis that matches how
   * this element is laid out — `{ x: 'center' }` for an element the
   * container centres horizontally, so a container / window resize
   * doesn't register as movement.
   */
  origin?: BeaconOrigin;
  /**
   * Extra rectangle margin on each side, in pixels. A positive value
   * makes the beacon larger than the anchored element; useful when the
   * consumer wants a halo / breathing room around the target.
   * @default 0
   */
  inset?: number;
  /**
   * When false, the beacon is not pushed. Useful for "only show when
   * hovered / focused" patterns — pass the boolean directly without
   * conditional hooks.
   * @default true
   */
  enabled?: boolean;
}

/**
 * Measure `ref` and register the result as a beacon. Measurements feed
 * the beacon's MotionValues directly; React only re-renders when the
 * descriptor's `priority` changes.
 *
 * Observation — events only, no rAF polling.
 *
 * Triggers a remeasure on: (a) self resize, (b) ancestor resize all
 * the way up to the registered container, (c) any descendant scroll
 * (capture-phase on window), (d) window resize, (e) layout shift of
 * the anchored element itself (`IntersectionObserver` trick). (a)–(d)
 * catch size-propagating layout changes; (e) catches pure position
 * shifts where no ancestor resizes (e.g. conditional siblings in a
 * `justify-center` fixed-size parent, absolutely-positioned sibling
 * offset mutations). This matches Floating UI's `autoUpdate` default
 * coverage without resorting to per-frame rAF polling.
 *
 * Coordinates — layout anchor, not visual rect.
 *
 * Position and size are measured from `offsetLeft / offsetTop /
 * offsetWidth / offsetHeight` walking the `offsetParent` chain, not
 * from `getBoundingClientRect`. The two differ in one place that
 * matters: `getBoundingClientRect` includes every ancestor's CSS
 * `transform`; `offset*` does not. Beacon is defined to be a **layout
 * anchor** — it follows where the element is laid out by the CSS box
 * model, independent of presentation-layer animations above it.
 *
 * This places one contract on callers that want the beacon to paint at
 * the visually-centred position of an absolute-positioned element:
 * **use box-model centring, not transform centring**.
 *
 *   // ❌ offsetLeft reports the pre-transform position, which is half
 *   // a block-width to the right of where it paints.
 *   <div className='absolute left-1/2 -translate-x-1/2 w-[360px]'>
 *
 *   // ✓ Pure layout centring via auto margins on an absolute block.
 *   //   `inset-x: 0` + `mx: auto` + a defined width distributes the
 *   //   remaining horizontal space evenly between the two auto
 *   //   margins. `offsetLeft` reports the resulting centre position.
 *   <div className='absolute inset-x-0 mx-auto w-[360px]'>
 *
 * When a `containerRef` is registered on the `BeaconProvider`,
 * measurements are taken relative to that container via the
 * `offsetParent` chain. If the chain breaks before reaching the
 * container (e.g. a `position: fixed` ancestor cuts it, or the element
 * is temporarily detached), we fall back to `getBoundingClientRect`
 * differencing so the beacon still reports a meaningful position for
 * that frame.
 *
 * Origin — which corner (or centre) the position is measured from.
 *
 * Measuring from the container's top-left makes a resize look like
 * motion for anything the layout centres, and the follower's spring
 * dutifully trails the moving target. Pass the `origin` that matches how
 * the element is laid out — `{ x: 'center' }` for a centred column — and
 * the resize cancels out of the measurement entirely. See
 * {@link BeaconOrigin}.
 */
export function useBeaconAnchor(ref: RefObject<HTMLElement | null>, options: BeaconAnchorOptions = {}): BeaconHandle {
  const { priority, slot, preserveOnEmpty, origin, inset = 0, enabled = true } = options;
  const containerRef = useContext(BeaconContainerContext);
  const defaultOrigin = useContext(BeaconOriginContext);

  // Resolved to two numbers rather than kept as an object: they are
  // `measure`'s dependencies, and a caller's inline `{ x: 'center' }`
  // literal would otherwise rebuild the whole observation cascade on
  // every render.
  const originX = origin?.x === undefined ? defaultOrigin.x : resolveBeaconOriginAxis(origin.x);
  const originY = origin?.y === undefined ? defaultOrigin.y : resolveBeaconOriginAxis(origin.y);

  // Initial descriptor. The effect below replaces size / position with
  // real measurements on mount — this seed is just so the MVs are
  // created with sensible initial values.
  const initialDescriptor = useMemo<BeaconDescriptor | null>(
    () =>
      enabled
        ? {
            priority,
            preserveOnEmpty,
            slot,
            origin: { x: originX, y: originY },
            position: { x: 0, y: 0 },
            size: { width: 0, height: 0 },
          }
        : null,
    // priority / preserveOnEmpty changes propagate via the
    // `handle.update` effect below; slot is immutable after mount;
    // `enabled` toggles registration. We intentionally don't include
    // them in deps — the identity-stable initial is only used at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled]
  );

  const handle = useBeacon(initialDescriptor);

  // Keep descriptor priority in sync.
  useEffect(() => {
    if (!enabled) return;
    handle.update({ preserveOnEmpty, priority });
  }, [enabled, handle, preserveOnEmpty, priority]);

  // Measurement loop. Seeds MVs imperatively via handle.update — no
  // React re-render on every pixel change.
  //
  // `measure` is memoised because it is the cascade's effect dependency: an inline
  // closure would tear every observer down and rebuild it on each render.
  const measure = useCallback((): void => {
    const el = ref.current;
    if (!el) return;
    const container = containerRef?.current ?? null;

    // Size comes from `offsetWidth` / `offsetHeight` so a parent's
    // `transform: scale(…)` doesn't shrink the reported beacon.
    const width = el.offsetWidth;
    const height = el.offsetHeight;

    // Position: prefer the `offsetParent` chain walk — transform-
    // immune, lets presentation animations slide independently. Fall
    // back to `getBoundingClientRect` differencing when the chain
    // can't reach the registered container (e.g. a `position: fixed`
    // ancestor cuts it, the element is transiently detached, or no
    // container is registered at all).
    const layout = layoutOffsetRelativeTo(el, container);
    let x: number;
    let y: number;
    if (layout) {
      x = layout.x;
      y = layout.y;
    } else {
      const rect = el.getBoundingClientRect();
      const containerRect = container?.getBoundingClientRect() ?? null;
      x = rect.left - (containerRect?.left ?? 0);
      y = rect.top - (containerRect?.top ?? 0);
    }

    // The inset box is the beacon, so it is the box the origin fraction
    // is taken along — an `'end'` origin has to anchor the halo's own
    // right edge, not the element's.
    const box = {
      left: x - inset,
      top: y - inset,
      width: width + inset * 2,
      height: height + inset * 2,
    };

    // Both terms of the origin frame are read in this one call, so a
    // resize that moves the element and the frame by the same amount
    // cancels within a single measurement and the beacon's position
    // never changes. Two separate observers would each fire with a stale
    // view of the other's term and leave a frame of jitter behind.
    const frame = readBeaconOriginFrame(container);

    handle.update({
      position: toBeaconOriginFrame(box, frame, { x: originX, y: originY }),
      size: { width: box.width, height: box.height },
    });
  }, [ref, containerRef, handle, inset, originX, originY]);

  useLayoutObservation(ref, containerRef, measure, { enabled });

  return handle;
}
