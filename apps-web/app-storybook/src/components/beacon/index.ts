export {
  BeaconFollower,
  type BeaconEmptyBehavior,
  type BeaconFollowerProps,
  type BeaconFollowerRenderContext,
} from './follower.js';
export { BeaconProvider, type BeaconProviderProps } from './provider.js';
export type { BeaconDescriptor, BeaconHandle, BeaconPosition, BeaconPriority, BeaconSize } from './types.js';
export { useActiveBeacon, type ActiveBeacon, type BeaconInitialRect } from './use-active-beacon.js';
export { useBeacon, useBeaconAnchor, type BeaconAnchorOptions } from './use-beacon.js';
