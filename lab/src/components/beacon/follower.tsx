/**
 * `BeaconFollower` — a motion surface that follows the active beacon
 * in a slot.
 *
 * Architecture:
 * - One `motion.div` exists regardless of how many beacons are active.
 *   Its identity is stable across active-beacon swaps — we don't key it
 *   on the active id — so `useSpring` keeps velocity continuity as the
 *   surface glides from one beacon to the next.
 * - Position + size animate via `useSpring` reading shared
 *   MotionValues. When the active beacon changes we re-subscribe to
 *   its MVs; the springs reinterpolate toward the new targets without
 *   resetting velocity.
 * - Content is provided by `children`. If no children are given, a
 *   plain `className` / `style` div fills the motion container. This is
 *   useful for generic overlay use cases (debug outlines, glass panes,
 *   focus rings). For anything more structured, pass a render prop
 *   that receives the target size.
 *
 * First-paint semantics — the follower does **not** fly in from
 * `(0, 0)`. It is kept unmounted until the first active beacon's
 * position lands, at which point the springs are `jump()`-ed to the
 * initial target before the first render. Only the opacity fade runs
 * on that first appearance.
 *
 * Slots — each follower reads one slot (default `undefined`). Multiple
 * followers can coexist inside the same provider, each watching its
 * own slot.
 *
 * The beacon primitive is intentionally a **pure geometric channel**.
 * Business state (variant, phase, …) lives in its own context owned by
 * the feature — `BeaconFollower` does not know about it.
 */

import { AnimatePresence, motion, type MotionStyle, type MotionValue } from 'motion/react';
import { useContext, useEffect, useState, type CSSProperties, type FC, type ReactNode } from 'react';

import { BeaconContainerContext } from './context.js';
import { useActiveBeacon, type BeaconInitialRect } from './use-active-beacon.js';

const PRESERVED_EMPTY_RESTORE_DURATION_SEC = 0.2;

/**
 * Behaviour when the beacon stack goes empty.
 *
 * - `'hide'` (default) — the follower fades out and unmounts. Its
 *   position / size are discarded; the next push starts fresh with the
 *   same first-paint snap semantics (no fly-in).
 * - `'freeze'` — the follower stays in place at its last position and
 *   size, fully opaque. Useful when the anchor element unmounts but
 *   the visual anchor should remain (e.g. a tutorial step that removes
 *   the highlighted control). A subsequent push animates the springs
 *   from the frozen position, preserving a sense of continuity.
 */
export type BeaconEmptyBehavior = 'hide' | 'freeze';

export interface BeaconFollowerProps {
  /**
   * Slot to subscribe to. Default = `undefined`, the general-purpose
   * slot. Named slots host feature-specific renderers.
   */
  slot?: string;
  /**
   * z-index of the follower layer.
   * @default 9000
   */
  zIndex?: number;
  /**
   * Extra style overrides for the default inner surface. Ignored when
   * a custom `children` renderer is provided.
   */
  style?: CSSProperties;
  /**
   * Default CSS class applied to the default inner surface. Ignored
   * when a custom `children` renderer is provided.
   */
  className?: string;
  /**
   * What the follower does when the slot becomes empty. See
   * {@link BeaconEmptyBehavior}.
   * @default 'hide'
   */
  onEmpty?: BeaconEmptyBehavior;
  /**
   * Keep the rendered surface alive briefly after the slot becomes
   * empty. If another beacon appears before the timeout expires, the
   * same surface glides to the new target instead of tearing down and
   * snapping fresh. Only applies when `onEmpty='hide'`.
   * @default 0
   */
  preserveOnEmptyMs?: number;
  /** One-shot spring seed for the first active beacon. */
  initialRect?: BeaconInitialRect | null;
  /**
   * Optional custom renderer. When provided, replaces the default
   * inner div — the outer motion container still handles position /
   * size and fade. The renderer receives:
   *
   * - `width` / `height`: snapshot of the new active beacon's measured
   *   target size at this render. Updates only when a new beacon
   *   becomes active. Safe to pass to components that take a numeric
   *   size.
   * - `widthMV` / `heightMV`: the spring-driven MotionValues behind the
   *   outer container's size animation. Pass these to `motion.*`
   *   components (or any consumer that accepts a `MotionValue<number>`)
   *   to make inner visuals track the spring frame-by-frame without
   *   React re-renders.
   */
  children?: ReactNode | ((ctx: BeaconFollowerRenderContext) => ReactNode);
}

export interface BeaconFollowerRenderContext {
  width: number;
  height: number;
  widthMV: MotionValue<number>;
  heightMV: MotionValue<number>;
}

export const BeaconFollower: FC<BeaconFollowerProps> = ({
  slot,
  zIndex = 9000,
  style,
  className,
  onEmpty = 'hide',
  preserveOnEmptyMs = 0,
  initialRect,
  children,
}) => {
  const canConfigurePreserveEmpty = onEmpty === 'hide' && preserveOnEmptyMs > 0;

  // The preservation window is a two-step timer: at the halfway mark
  // the surface starts fading, at the end it is released and the mount
  // gate reopens. These two flags are the ONLY genuinely stateful bits
  // — they're advanced from `setTimeout` callbacks. Everything else the
  // window needs is derived below, which keeps the effect free of
  // synchronous setState cascades.
  const [faded, setFaded] = useState(false);
  const [expired, setExpired] = useState(false);

  // Each new empty period starts a fresh window. `optedOut` covers the
  // beacon that asked NOT to be preserved: there is no window to wait
  // out, so the gate opens immediately. It can't be derived inline
  // because `preserveOnEmpty` comes from the hook below, whose own
  // `resetOnEmpty` argument is what we're computing — deriving it
  // would close a cycle. Reading it as state breaks that cycle at the
  // cost of settling one render later, which is invisible: the gate is
  // only consulted while the stack is empty.
  const [lastEmpty, setLastEmpty] = useState(false);
  const [optedOut, setOptedOut] = useState(false);

  // `resetOnEmpty` under 'hide' mode releases the mount gate so the
  // next push snaps the motion.div into place instead of animating
  // across the (now-hidden) gap from the previous beacon's position.
  // Under 'freeze' the caller wants spatial continuity on re-entry from
  // the frozen position, so leave the gate held.
  const releaseMountGate = expired || optedOut;
  const { mounted, empty, x, y, width, height, targetWidth, targetHeight, preserveOnEmpty } = useActiveBeacon(slot, {
    initialRect,
    resetOnEmpty: onEmpty === 'hide' && (!canConfigurePreserveEmpty || releaseMountGate),
  });
  const shouldPreserveEmpty = canConfigurePreserveEmpty && preserveOnEmpty;

  // Adjust-state-during-render: React re-runs this component before
  // painting, so the derived values below are already correct on the
  // render that first observes the flip.
  if (lastEmpty !== empty) {
    setLastEmpty(empty);
    setFaded(false);
    setExpired(false);
  }
  const nextOptedOut = empty && canConfigurePreserveEmpty && !preserveOnEmpty;
  if (optedOut !== nextOptedOut) {
    setOptedOut(nextOptedOut);
  }

  useEffect(() => {
    if (!shouldPreserveEmpty || !mounted || !empty) return;

    const fadeTimeoutId = window.setTimeout(() => setFaded(true), preserveOnEmptyMs / 2);
    const releaseTimeoutId = window.setTimeout(() => setExpired(true), preserveOnEmptyMs);

    return () => {
      window.clearTimeout(fadeTimeoutId);
      window.clearTimeout(releaseTimeoutId);
    };
  }, [empty, mounted, preserveOnEmptyMs, shouldPreserveEmpty]);

  const preservingEmpty = shouldPreserveEmpty && mounted && empty && !expired;
  const fadePreservedEmpty = shouldPreserveEmpty && faded;

  // When a positioning container is registered on the provider, render
  // with `position: absolute` so the follower shares the same origin as
  // placeholder measurements.
  const containerRef = useContext(BeaconContainerContext);
  const hasContainer = containerRef != null;

  const shouldRender = mounted && (!empty || onEmpty === 'freeze' || preservingEmpty);
  const opacityTarget = fadePreservedEmpty && empty ? 0 : 1;
  const opacityDuration =
    fadePreservedEmpty && empty ? Math.max(0, preserveOnEmptyMs / 2 / 1000) : PRESERVED_EMPTY_RESTORE_DURATION_SEC;

  const containerStyle: MotionStyle = {
    position: hasContainer ? 'absolute' : 'fixed',
    top: 0,
    left: 0,
    x,
    y,
    width,
    height,
    pointerEvents: 'none',
    zIndex,
  };

  const inner =
    typeof children === 'function'
      ? children({ width: targetWidth, height: targetHeight, widthMV: width, heightMV: height })
      : (children ?? <div className={className} style={{ width: '100%', height: '100%', ...style }} />);

  return (
    <AnimatePresence>
      {shouldRender && (
        <motion.div
          key="beacon-follower"
          initial={{ opacity: 0 }}
          animate={{ opacity: opacityTarget }}
          exit={{ opacity: 0 }}
          transition={{ opacity: { duration: opacityDuration, ease: 'easeInOut' } }}
          style={containerStyle}
        >
          {inner}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
