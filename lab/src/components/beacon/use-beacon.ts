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
import { useCallback, useContext, useEffect, useId, useMemo, useRef, type RefObject } from 'react';
import { BeaconContainerContext, BeaconStoreContext } from './context.js';
import { layoutOffsetRelativeTo } from './layout-offset.js';
import type { BeaconDescriptor, BeaconEntry, BeaconHandle, BeaconPriority } from './types.js';
import { useLayoutObservation } from './use-layout-observation.js';

// A no-op handle used when no provider is mounted. Allows components
// to sprinkle beacons without forcing every consumer to adopt the
// provider — the beacon simply has no effect.
const NOOP_HANDLE: BeaconHandle = { update: () => undefined };

export function useBeacon(descriptor: BeaconDescriptor | null): BeaconHandle {
  const store = useContext(BeaconStoreContext);

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
  useEffect(() => {
    if (!store || !isEnabled) return;
    const entry = entryRef.current;
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

    const nextPriority = descriptor.priority ?? 'normal';
    if (entryRef.current.priority !== nextPriority) {
      entryRef.current = { ...entryRef.current, priority: nextPriority };
      store.replacePriority(id, nextPriority);
    }
  }, [descriptor, store, id, x, y, w, h]);

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
 */
export function useBeaconAnchor(ref: RefObject<HTMLElement | null>, options: BeaconAnchorOptions = {}): BeaconHandle {
  const { priority, slot, preserveOnEmpty, inset = 0, enabled = true } = options;
  const containerRef = useContext(BeaconContainerContext);

  // Initial descriptor. The effect below replaces size / position with
  // real measurements on mount — this seed is just so the MVs are
  // created with sensible initial values.
  const initialDescriptor = useMemo<BeaconDescriptor | null>(
    () =>
      enabled ? { priority, preserveOnEmpty, slot, position: { x: 0, y: 0 }, size: { width: 0, height: 0 } } : null,
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
      const origin = container?.getBoundingClientRect() ?? null;
      x = rect.left - (origin?.left ?? 0);
      y = rect.top - (origin?.top ?? 0);
    }

    handle.update({
      position: { x: x - inset, y: y - inset },
      size: { width: width + inset * 2, height: height + inset * 2 },
    });
  }, [ref, containerRef, handle, inset]);

  useLayoutObservation(ref, containerRef, measure, { enabled });

  return handle;
}
