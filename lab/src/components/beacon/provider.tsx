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

import { BeaconContainerContext, BeaconStoreContext } from './context.js';
import { BeaconFollower, type BeaconFollowerProps } from './follower.js';
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
}

export const BeaconProvider: FC<BeaconProviderProps> = ({
  children,
  renderFollower = true,
  followerProps,
  containerRef,
}) => {
  const store = useMemo(() => new BeaconStore(), []);
  const containerValue = containerRef ?? null;

  return (
    <BeaconStoreContext.Provider value={store}>
      <BeaconContainerContext.Provider value={containerValue}>
        {children}
        {renderFollower && <BeaconFollower {...followerProps} />}
      </BeaconContainerContext.Provider>
    </BeaconStoreContext.Provider>
  );
};
