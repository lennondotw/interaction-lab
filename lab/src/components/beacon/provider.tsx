/**
 * `BeaconProvider` — owns a single `BeaconStore` instance and hosts the
 * `BeaconFollower` renderer at its root.
 *
 * Mount once near your app root. Every `useBeacon` / `useBeaconAnchor`
 * call beneath the provider shares the same store and is painted by the
 * same follower.
 *
 * Pass a `containerRef` when the flow lives inside a non-viewport
 * positioning context (a bounded panel, a scaled ancestor, a portal).
 * Both anchor measurements and follower rendering switch to
 * container-relative coordinates with `position: absolute` so the
 * surface tracks the same origin as the placeholders. The caller is
 * responsible for placing `<BeaconFollower />` as a DOM descendant of
 * the referenced element.
 */

import { useMemo, type FC, type ReactNode, type RefObject } from 'react';

import { BeaconContainerContext, BeaconOriginContext, BeaconStoreContext } from './context.js';
import { BeaconFollower, type BeaconFollowerProps } from './follower.js';
import { BEACON_ORIGIN_START, resolveBeaconOrigin, type BeaconOrigin } from './origin.js';
import { BeaconStore } from './store.js';

export interface BeaconProviderProps {
  children: ReactNode;
  /**
   * When false, the built-in `BeaconFollower` is not mounted. Useful
   * when the host wants to place the follower in a specific portal
   * target itself (`createPortal(<BeaconFollower />, node)`), or when a
   * `containerRef` is provided (the caller must then mount the follower
   * inside the container themselves).
   * @default true
   */
  renderFollower?: boolean;
  /** Forwarded to the built-in follower when `renderFollower` is true. */
  followerProps?: BeaconFollowerProps;
  /**
   * Positioning root ref. When provided, anchor measurements are taken
   * relative to the container's bounding rect, and followers render
   * with `position: absolute` instead of `position: fixed`. Without
   * this prop, the system uses viewport-relative coords.
   */
  containerRef?: RefObject<HTMLElement | null>;
  /**
   * Default reference point for beacons beneath this provider, per axis.
   * Defaults to the container's top-left. Set `{ x: 'center' }` when the
   * region centres its content horizontally — a centred beacon then
   * reports a position that doesn't change with the container's width,
   * so resizing produces no spring lag. See {@link BeaconOrigin}.
   */
  origin?: BeaconOrigin;
}

export const BeaconProvider: FC<BeaconProviderProps> = ({
  children,
  renderFollower = true,
  followerProps,
  containerRef,
  origin,
}) => {
  const store = useMemo(() => new BeaconStore(), []);
  const containerValue = containerRef ?? null;

  // Resolved once so the context value's identity is stable across the
  // caller passing a fresh object literal every render — consumers hold
  // it in effect deps.
  const originValue = useMemo(
    () => resolveBeaconOrigin(origin, BEACON_ORIGIN_START),
    [origin?.x, origin?.y] // eslint-disable-line react-hooks/exhaustive-deps -- the two axes are the whole value
  );

  return (
    <BeaconStoreContext.Provider value={store}>
      <BeaconContainerContext.Provider value={containerValue}>
        <BeaconOriginContext.Provider value={originValue}>
          {children}
          {renderFollower && <BeaconFollower {...followerProps} />}
        </BeaconOriginContext.Provider>
      </BeaconContainerContext.Provider>
    </BeaconStoreContext.Provider>
  );
};
