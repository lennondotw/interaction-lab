/**
 * Beacon — a positional placeholder.
 *
 * A `Beacon` is a tiny piece of metadata a component broadcasts so a
 * higher-level renderer can paint a visual at the same position +
 * size. The beacon itself carries **only geometry**: size, position,
 * priority, and an optional slot name. It deliberately does NOT carry
 * business state (variant, tint, phase, etc.) — that lives in whatever
 * domain context owns it. Keeping beacon a pure geometric primitive
 * lets it be reused across unrelated features without dragging each
 * feature's state vocabulary along.
 *
 * Selection rule: highest priority wins; ties broken by LIFO (most
 * recently pushed). The rule matches common overlay semantics: a modal
 * beacon (priority `'critical'`) wins over any tooltip beacon
 * (priority `'normal'`) regardless of mount order.
 *
 * Position and size are animated imperatively by the consumer
 * (typically via `useSpring` over the entry's MotionValues),
 * independent of React render cycles.
 */

import type { MotionValue } from 'motion/react';

import type { BeaconOrigin, ResolvedBeaconOrigin } from './origin.js';

/**
 * Priority bucket. Higher buckets always win; within the same bucket
 * the most recently pushed beacon wins (LIFO).
 */
export type BeaconPriority = 'critical' | 'high' | 'normal' | 'low';

export const BEACON_PRIORITY_RANK: Record<BeaconPriority, number> = {
  critical: 3,
  high: 2,
  normal: 1,
  low: 0,
};

export interface BeaconSize {
  width: number;
  height: number;
}

/**
 * Position in the beacon's origin frame — the beacon's own origin point
 * offset from the container's origin point (viewport if the provider has
 * no `containerRef`). With the default `'start'` origin that is plainly
 * the top-left corner's offset, as if from `getBoundingClientRect()`.
 * See {@link BeaconOrigin} for why a beacon would choose another.
 */
export interface BeaconPosition {
  x: number;
  y: number;
}

export interface BeaconDescriptor {
  size: BeaconSize;
  position: BeaconPosition;
  priority?: BeaconPriority;
  /**
   * Reference point `position` is measured against, per axis. Omitted
   * axes inherit the provider's default (itself `'start'` unless the
   * provider says otherwise). Immutable while the beacon is registered —
   * it defines the frame every value the caller writes is interpreted
   * in, so changing it under a live beacon would silently displace it
   * rather than move it. A beacon that is toggled off and on again
   * adopts whatever origin it has at that point.
   */
  origin?: BeaconOrigin;
  /**
   * Whether a renderer may preserve itself briefly when this beacon is
   * the last active entry and then unmounts. Set `false` for terminal
   * anchors where the visual should disappear immediately instead of
   * waiting for a route / step handoff.
   * @default true
   */
  preserveOnEmpty?: boolean;
  /**
   * Namespace for the beacon. Renderers filter the active stack by
   * slot, so multiple independent animated surfaces can coexist inside
   * one `BeaconProvider`. The default slot is `undefined` — used by
   * general-purpose followers. Named slots host feature-specific
   * renderers (e.g. `'tooltip'`).
   */
  slot?: string;
}

/**
 * Imperative handle returned by `useBeacon`. Use when the descriptor
 * changes at high frequency (e.g. an input resizing on every
 * keystroke) — calling `update` mutates the beacon's MotionValues
 * directly without causing a React re-render on the consumer side.
 */
export interface BeaconHandle {
  update: (partial: Partial<BeaconDescriptor>) => void;
}

/**
 * Internal stack entry. The MotionValues are the canonical position /
 * size channel; the active-beacon hook subscribes to them and drives a
 * single `useSpring` per axis from the selected entry's MVs.
 */
export interface BeaconEntry {
  id: string;
  priority: BeaconPriority;
  /** See {@link BeaconDescriptor.slot}. `undefined` means the default slot. */
  slot?: string;
  /** See {@link BeaconDescriptor.preserveOnEmpty}. */
  preserveOnEmpty?: boolean;
  /**
   * Resolved {@link BeaconDescriptor.origin}. Committed at push time and
   * never mutated, so a renderer can treat it as the fixed frame of
   * this entry's `x` / `y` and only reconcile frames when the active
   * entry changes.
   */
  origin: ResolvedBeaconOrigin;
  x: MotionValue<number>;
  y: MotionValue<number>;
  w: MotionValue<number>;
  h: MotionValue<number>;
}
