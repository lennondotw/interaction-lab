import { createContext, type RefObject } from 'react';
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
