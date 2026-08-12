import { createContext, type RefObject } from 'react';

import { BEACON_ORIGIN_START, type ResolvedBeaconOrigin } from './origin.js';
import type { BeaconStore } from './store.js';

// Exported so tests can render the provider with a custom store instance.
export const BeaconStoreContext = createContext<BeaconStore | null>(null);

/**
 * Positioning root for beacon measurement + follower rendering.
 *
 * When non-null, anchor measurements subtract the container's origin
 * (so they're container-relative instead of viewport-relative), and
 * followers position themselves absolutely inside the container rather
 * than fixed to the viewport. Consumers are responsible for placing
 * `<BeaconFollower />` as a DOM descendant of the container element so
 * `position: absolute` resolves correctly.
 *
 * When `null` (the default), the system falls back to
 * viewport-relative coordinates and `position: fixed` rendering.
 */
export const BeaconContainerContext = createContext<RefObject<HTMLElement | null> | null>(null);

/**
 * Default reference point for beacons that don't name one, and the
 * fallback frame a follower renders in while nothing is active.
 *
 * Provider-level because it is a statement about the layout the provider
 * wraps ("this region is a centred column"), which is the right default
 * for every beacon inside it. Individual beacons override per axis when
 * they sit somewhere the region's rule doesn't describe — see
 * {@link BeaconOrigin}.
 */
export const BeaconOriginContext = createContext<ResolvedBeaconOrigin>(BEACON_ORIGIN_START);
