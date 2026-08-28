/**
 * Motion integration for the elastic scale effect.
 *
 * The effect operates on a series of equally sized **items** along one
 * axis. What you render inside each item — a thin bar, an icon, a label
 * — is entirely up to the consumer.
 *
 * ## Architecture
 *
 * ```
 * ┌──────────────────────────────────────────────────────────────────┐
 * │                      Container component                         │
 * │  ┌─────────────────────────────────────────────────────────────┐ │
 * │  │  useElasticScaleContainer()                                 │ │
 * │  │  - owns the cursorPosition MotionValue                      │ │
 * │  │  - owns the intensity MotionValue (internal)                │ │
 * │  │  - hands back handlePointerMove / handlePointerLeave        │ │
 * │  └─────────────────────────────────────────────────────────────┘ │
 * │                            │ context                             │
 * │                            ▼                                     │
 * │  ┌─────────────────────────────────────────────────────────────┐ │
 * │  │  Per-item component                                          │ │
 * │  │  useItemTransform(context, index, options)                   │ │
 * │  │  - derives scale + translate MotionValues                    │ │
 * │  └─────────────────────────────────────────────────────────────┘ │
 * └──────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Why two hooks
 *
 * Hooks can't be called in a loop, so the per-item transform has to live
 * in a per-item component. Splitting the API in two is what lets the
 * whole thing stay on MotionValues: the cursor never passes through
 * React state, so moving the pointer doesn't re-render anything.
 *
 * @module use-elastic-scale
 */

import { animate, useMotionValue, useTransform, type MotionValue } from 'motion/react';
import { useCallback, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';

import {
  calculateScale,
  DEFAULT_MAX_SCALE,
  DEFAULT_SIGMA,
  getItemCenter,
  integrateScale,
  isWithinInteractiveRange,
} from './elastic-scale.js';

/** Spring options for an intensity transition. */
export interface IntensitySpringOptions {
  stiffness?: number;
  damping?: number;
}

/** Enter / exit spring configuration. */
export interface TransitionConfig {
  /** Applied when the cursor enters the container. */
  enter?: IntensitySpringOptions;
  /** Applied when the cursor leaves. */
  exit?: IntensitySpringOptions;
}

export interface UseElasticScaleContainerOptions {
  /** Number of items. */
  itemCount: number;
  /** Size of each item along the transform axis, in pixels. */
  itemSize: number;
  /** @default true */
  enabled?: boolean;
  transition?: TransitionConfig;
}

/** Layout derived from the options — the single source of truth. */
export interface ElasticScaleLayout {
  itemCount: number;
  itemSize: number;
  /** `itemCount * itemSize`. */
  totalSize: number;
  getItemCenter: (index: number) => number;
}

/** Sentinel for "no item is hovered". */
export const NO_HOVERED_ITEM = -1;

/**
 * Everything an item needs to derive its transform. `intensity` is an
 * implementation detail of the container that items consume but never
 * write.
 */
export interface ElasticScaleContext {
  /** Cursor coordinate along the axis; null when not hovering. */
  cursorPosition: MotionValue<number | null>;
  /** Effect strength, 0–1, spring-animated on enter / exit. */
  intensity: MotionValue<number>;
  layout: ElasticScaleLayout;
}

export interface UseElasticScaleContainerResult {
  context: ElasticScaleContext;
  /** Index of the hovered item, or {@link NO_HOVERED_ITEM}. */
  hoveredItemIndex: MotionValue<number>;
  handlePointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  handlePointerLeave: () => void;
  layout: ElasticScaleLayout;
}

export interface UseItemTransformOptions {
  /** @default DEFAULT_MAX_SCALE */
  maxScale?: number;
  /** @default DEFAULT_SIGMA */
  sigma?: number;
}

/** Transform MotionValues for one item. */
export interface ItemTransform {
  scale: MotionValue<number>;
  /** Translation along the axis, in pixels. */
  translate: MotionValue<number>;
}

// Entering is stiffer than exiting: the effect should feel like it snaps
// to the cursor, but relax when the cursor goes away.
const DEFAULT_ENTER_SPRING = { stiffness: 3600, damping: 120 };
const DEFAULT_EXIT_SPRING = { stiffness: 900, damping: 60 };

/**
 * Container-level state for the elastic scale effect. Call once in the
 * component that wraps the items, and pass `context` down to each item's
 * {@link useItemTransform}.
 *
 * @example
 * ```tsx
 * function Container({ items }) {
 *   const { context, handlePointerMove, handlePointerLeave, layout } =
 *     useElasticScaleContainer({ itemCount: items.length, itemSize: 16 })
 *
 *   return (
 *     <div
 *       style={{ height: layout.totalSize }}
 *       onPointerMove={handlePointerMove}
 *       onPointerLeave={handlePointerLeave}
 *     >
 *       {items.map((item, i) => (
 *         <AnimatedItem key={item.id} index={i} context={context} />
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */
export function useElasticScaleContainer(options: UseElasticScaleContainerOptions): UseElasticScaleContainerResult {
  const { itemCount, itemSize, enabled = true, transition } = options;

  const enterStiffness = transition?.enter?.stiffness ?? DEFAULT_ENTER_SPRING.stiffness;
  const enterDamping = transition?.enter?.damping ?? DEFAULT_ENTER_SPRING.damping;
  const exitStiffness = transition?.exit?.stiffness ?? DEFAULT_EXIT_SPRING.stiffness;
  const exitDamping = transition?.exit?.damping ?? DEFAULT_EXIT_SPRING.damping;

  const enterSpring = useMemo(
    () => ({ type: 'spring' as const, stiffness: enterStiffness, damping: enterDamping }),
    [enterStiffness, enterDamping]
  );

  const exitSpring = useMemo(
    () => ({ type: 'spring' as const, stiffness: exitStiffness, damping: exitDamping }),
    [exitStiffness, exitDamping]
  );

  // The primary reactive value. null means the cursor is outside the
  // interactive area.
  const cursorPosition = useMotionValue<number | null>(null);

  // 0 = effect off, 1 = full effect. Spring-animated so the cluster
  // eases in and out instead of snapping.
  const intensity = useMotionValue(0);

  // Held so a new animation can cancel the one in flight, which is what
  // keeps velocity continuous across rapid enter / leave.
  const intensityAnimationRef = useRef<ReturnType<typeof animate> | null>(null);

  const hoveredItemIndex = useTransform(cursorPosition, (pos) => {
    if (pos === null) return NO_HOVERED_ITEM;
    const index = Math.floor(pos / itemSize);
    if (index < 0 || index >= itemCount) return NO_HOVERED_ITEM;
    return index;
  });

  const layout = useMemo<ElasticScaleLayout>(
    () => ({
      itemCount,
      itemSize,
      totalSize: itemCount * itemSize,
      getItemCenter: (index: number) => getItemCenter(index, itemSize),
    }),
    [itemCount, itemSize]
  );

  const context = useMemo<ElasticScaleContext>(
    () => ({ cursorPosition, intensity, layout }),
    [cursorPosition, intensity, layout]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return;

      // `currentTarget` rather than `offsetY`: offsetY is relative to
      // `event.target`, which is whichever child is under the pointer —
      // and those children are being scaled and translated, so offsetY
      // would feed the effect its own output.
      const rect = event.currentTarget.getBoundingClientRect();
      const pos = event.clientY - rect.top;

      // One item's worth of slack past each end, so the effect doesn't
      // cut out abruptly at the boundary.
      const inRange = isWithinInteractiveRange(pos, itemCount * itemSize, itemSize);

      if (inRange) {
        cursorPosition.set(pos);
        if (intensity.get() < 1) {
          intensityAnimationRef.current?.stop();
          intensityAnimationRef.current = animate(intensity, 1, enterSpring);
        }
      } else {
        // Inside the container but past the slack — ease out.
        intensityAnimationRef.current?.stop();
        intensityAnimationRef.current = animate(intensity, 0, exitSpring);
      }
    },
    [enabled, itemCount, itemSize, cursorPosition, intensity, enterSpring, exitSpring]
  );

  // `cursorPosition` is intentionally left at its last value so the
  // effect shrinks in place rather than snapping to the origin.
  const handlePointerLeave = useCallback(() => {
    intensityAnimationRef.current?.stop();
    intensityAnimationRef.current = animate(intensity, 0, exitSpring);
  }, [intensity, exitSpring]);

  return { context, hoveredItemIndex, handlePointerMove, handlePointerLeave, layout };
}

/**
 * Transform MotionValues for a single item. Call once per item
 * component; the values update straight off `cursorPosition` without
 * going through React state.
 *
 * Both outputs are interpolated by `intensity` so enter / exit is a
 * single spring on one scalar rather than a spring per item:
 *
 * ```
 * scale     = 1 + (rawScale - 1) × intensity
 * translate = rawTranslate × intensity
 * ```
 *
 * @example
 * ```tsx
 * function AnimatedItem({ index, context }) {
 *   const { scale, translate } = useItemTransform(context, index, { maxScale: 2.5 })
 *   return <motion.div style={{ scale, y: translate }}><ItemContent /></motion.div>
 * }
 * ```
 */
export function useItemTransform(
  context: ElasticScaleContext,
  index: number,
  options?: UseItemTransformOptions
): ItemTransform {
  const { cursorPosition, intensity, layout } = context;
  const { maxScale = DEFAULT_MAX_SCALE, sigma = DEFAULT_SIGMA } = options ?? {};
  const { itemSize } = layout;

  const center = useMemo(() => getItemCenter(index, itemSize), [index, itemSize]);

  const rawScale = useTransform(cursorPosition, (pos: number | null) =>
    pos === null ? 1 : calculateScale(center, pos, maxScale, sigma)
  );

  const rawTranslate = useTransform(cursorPosition, (pos: number | null) => {
    if (pos === null) return 0;
    const next = pos + integrateScale(pos, center, pos, maxScale, sigma);
    return next - center;
  });

  const scale = useTransform([rawScale, intensity], ([s, i]: number[]) => 1 + ((s ?? 1) - 1) * (i ?? 0));
  const translate = useTransform([rawTranslate, intensity], ([t, i]: number[]) => (t ?? 0) * (i ?? 0));

  return { scale, translate };
}
