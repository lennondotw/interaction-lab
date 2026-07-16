import { cn } from '@monorepo/utils';
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { FC, Fragment, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { NativeScrollRuler } from '../../components/native-scroll-ruler/native-scroll-ruler.js';

const ITEM_COUNT = 9;
const ITEM_WIDTH = 280;
const ITEM_HEIGHT = 360;
const CONTAINER_HEIGHT = 614;
const ORBIT_PLACEHOLDER_HEIGHT = ITEM_HEIGHT * 1.5;
const REFERENCE_CONTAINER_WIDTH = 1440;
const RING_RADIUS = 1200;
const ITEM_CENTER_SPACING = 329;
const ANCHOR_ITEM_INDEX = Math.floor(ITEM_COUNT / 2);
const ANCHOR_SPEED_RADIANS_PER_MS = 0.096 / RING_RADIUS;
const HOVER_SLOW_MULTIPLIER = 0.25;
const HOVER_INFLUENCE_SPRING = {
  damping: 26,
  mass: 1,
  stiffness: 169,
} as const;
const SCROLL_DOWN_DISTANCE_TO_ORBIT_DISTANCE = 0.54;
const SCROLL_UP_DISTANCE_TO_ORBIT_DISTANCE = 0.61;
const SCROLL_SPRING = {
  damping: 16,
  mass: 1,
  stiffness: 64,
} as const;
const SPAWN_DESTROY_SAFE_DISTANCE = 80;

export interface OrbitTrackProps {
  className?: string;
  debugShowBorder?: boolean;
  debugShowFullCircle?: boolean;
  scrollLinked?: boolean;
}

interface OrbitItemPosition {
  itemIndex: number;
  dx: number;
  isAnchor: boolean;
  slotOffset: number;
  x: number;
  y: number;
}

const getPositiveModulo = ({ value, divisor }: { divisor: number; value: number }): number =>
  ((value % divisor) + divisor) % divisor;

const getScrollOrbitDistanceDelta = ({ scrollDelta }: { scrollDelta: number }): number =>
  scrollDelta * (scrollDelta >= 0 ? SCROLL_DOWN_DISTANCE_TO_ORBIT_DISTANCE : SCROLL_UP_DISTANCE_TO_ORBIT_DISTANCE);

const getOrbitCenterY = (radius: number): number => ITEM_HEIGHT / 2 + radius;

const getItemTouchRingMetrics = ({
  itemHeight = ITEM_HEIGHT,
  itemWidth = ITEM_WIDTH,
  radius = RING_RADIUS,
}: {
  itemHeight?: number;
  itemWidth?: number;
  radius?: number;
}) => {
  const itemCornerDistance = Math.hypot(itemWidth / 2, itemHeight / 2);

  return {
    innerRadius: Math.max(0, radius - itemCornerDistance),
    outerRadius: radius + itemCornerDistance,
  };
};

const isPointInItemTouchRing = ({
  centerX,
  centerY,
  innerRadius,
  outerRadius,
  pointX,
  pointY,
}: {
  centerX: number;
  centerY: number;
  innerRadius: number;
  outerRadius: number;
  pointX: number;
  pointY: number;
}) => {
  const distanceFromCenter = Math.hypot(pointX - centerX, pointY - centerY);

  return distanceFromCenter >= innerRadius && distanceFromCenter <= outerRadius;
};

const getYOnTopArc = ({
  dx,
  radius = RING_RADIUS,
  centerY = getOrbitCenterY(radius),
}: {
  centerY?: number;
  dx: number;
  radius?: number;
}): number => {
  const clampedDx = Math.max(-radius, Math.min(radius, dx));
  return centerY - Math.sqrt(radius * radius - clampedDx * clampedDx);
};

const getOrbitRadius = (containerWidth: number): number =>
  // Items are placed by vertical guide lines, not by equal angular intervals.
  // Each item center first chooses an x coordinate, then projects onto the top
  // half of the circle to derive y. At minimum, the circle diameter must cover
  // the viewport plus one item width: half an item can be visible beyond each
  // side edge. The configured radius is intentionally larger than that minimum
  // so the visible arc stays flatter and easier to inspect.
  (containerWidth * RING_RADIUS) / REFERENCE_CONTAINER_WIDTH;

const getSurfaceHeight = ({
  itemHeight = ITEM_HEIGHT,
  itemWidth = ITEM_WIDTH,
  containerWidth,
  radius = getOrbitRadius(containerWidth),
}: {
  itemHeight?: number;
  itemWidth?: number;
  containerWidth: number;
  radius?: number;
}): number => {
  // The clipped surface needs to include the lowest item that can still be
  // visually relevant. With vertical-line placement, that happens when an item
  // is just entering or leaving through a side edge: its center sits half an
  // item width outside the viewport. Project that center onto the orbit, then
  // add half the item height to get the item bottom edge.
  const edgeEnteringItemDx = containerWidth / 2 + itemWidth / 2;
  return Math.ceil(getYOnTopArc({ dx: edgeEnteringItemDx, radius }) + itemHeight / 2);
};

const getSpawnDestroyBounds = ({
  itemWidth = ITEM_WIDTH,
  containerWidth,
  safeDistance = SPAWN_DESTROY_SAFE_DISTANCE,
  spacing = ITEM_CENTER_SPACING,
}: {
  itemWidth?: number;
  containerWidth: number;
  safeDistance?: number;
  spacing?: number;
}) => {
  const sideBuffer = itemWidth / 2 + spacing + safeDistance;

  return {
    destroyX: containerWidth + sideBuffer,
    sideBuffer,
    spawnX: -sideBuffer,
  };
};

const getOrbitInstanceCount = ({
  itemCount = ITEM_COUNT,
  containerWidth,
  spacing = ITEM_CENTER_SPACING,
}: {
  itemCount?: number;
  containerWidth: number;
  spacing?: number;
}): number => {
  const { destroyX, spawnX } = getSpawnDestroyBounds({ containerWidth, spacing });
  const boundedSpan = Math.max(0, destroyX - spawnX);
  const requiredInstanceCount = Math.ceil(boundedSpan / spacing);

  // Keep the instance pool as complete content cycles. Otherwise the item that
  // wraps from the destroy side back to the spawn side could break sequence
  // order when the geometry requires a count that is not divisible by itemCount.
  return Math.ceil(Math.max(itemCount, requiredInstanceCount) / itemCount) * itemCount;
};

const getCenteredSlotOffsets = (instanceCount: number): number[] => {
  const firstSlotOffset = -Math.floor(instanceCount / 2);
  return Array.from({ length: instanceCount }, (_, index) => firstSlotOffset + index);
};

const getOrbitSlotOffsets = ({
  itemCount = ITEM_COUNT,
  containerWidth,
  spacing = ITEM_CENTER_SPACING,
}: {
  itemCount?: number;
  containerWidth: number;
  spacing?: number;
}): number[] => {
  const instanceCount = getOrbitInstanceCount({ itemCount, containerWidth, spacing });
  return getCenteredSlotOffsets(instanceCount);
};

const projectItemSlotOnCircle = ({
  anchorIndex = ANCHOR_ITEM_INDEX,
  itemCount = ITEM_COUNT,
  centerX,
  containerWidth = centerX * 2,
  instanceCount,
  radius = RING_RADIUS,
  spacing = ITEM_CENTER_SPACING,
  progress = 0,
  slotOffset,
}: {
  anchorIndex?: number;
  itemCount?: number;
  centerX: number;
  containerWidth?: number;
  instanceCount: number;
  progress?: number;
  radius?: number;
  slotOffset: number;
  spacing?: number;
}): OrbitItemPosition => {
  const { spawnX } = getSpawnDestroyBounds({ containerWidth, spacing });
  const loopWidth = instanceCount * spacing;
  const spawnDx = spawnX - centerX;
  const unwrappedDx = slotOffset * spacing + progress;
  const completedSlotProgress = Math.floor(progress / spacing);
  const dx = spawnDx + getPositiveModulo({ value: unwrappedDx - spawnDx, divisor: loopWidth });
  const itemIndex = getPositiveModulo({
    divisor: itemCount,
    value: anchorIndex + slotOffset,
  });

  // Stable integer slots preserve DOM identity while the anchor role advances.
  // Each slot wraps across an interval wider than the viewport plus safety
  // buffers, so the discontinuity happens offscreen.
  return {
    itemIndex,
    dx,
    isAnchor: getPositiveModulo({ value: slotOffset + completedSlotProgress, divisor: instanceCount }) === 0,
    slotOffset,
    x: centerX + dx,
    y: getYOnTopArc({ dx, radius }),
  };
};

export const OrbitTrack: FC<OrbitTrackProps> = ({
  className,
  debugShowBorder = true,
  debugShowFullCircle = false,
  scrollLinked = false,
}) => {
  const containerWidth = useMotionValue(REFERENCE_CONTAINER_WIDTH);
  const baseOrbitProgress = useMotionValue(0);
  const { scrollY } = useScroll();
  const scrollOrbitTarget = useMotionValue(0);
  const scrollOrbitOffset = useSpring(scrollOrbitTarget, SCROLL_SPRING);
  const hoverInfluenceTarget = useMotionValue(0);
  const hoverInfluence = useSpring(hoverInfluenceTarget, HOVER_INFLUENCE_SPRING);
  const speedMultiplier = useTransform(() => 1 - hoverInfluence.get() * (1 - HOVER_SLOW_MULTIPLIER));
  const orbitProgress = useTransform(() => baseOrbitProgress.get() + scrollOrbitOffset.get());
  const shouldReduceMotion = useReducedMotion();
  const [slotOffsets, setSlotOffsets] = useState(() =>
    getOrbitSlotOffsets({
      containerWidth: REFERENCE_CONTAINER_WIDTH,
    })
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const previousScrollYRef = useRef(scrollY.get());
  const orbitRadius = useTransform(() => getOrbitRadius(containerWidth.get()));
  const orbitCenterY = useTransform(() => getOrbitCenterY(orbitRadius.get()));
  const orbitDiameter = useTransform(() => orbitRadius.get() * 2);
  const orbitTop = useTransform(() => orbitCenterY.get() - orbitRadius.get());
  const orbitCenterVerticalTop = useTransform(() => orbitCenterY.get() - 52);
  const touchRingInnerRadius = useTransform(() => getItemTouchRingMetrics({ radius: orbitRadius.get() }).innerRadius);
  const touchRingOuterRadius = useTransform(() => getItemTouchRingMetrics({ radius: orbitRadius.get() }).outerRadius);
  const touchRingInnerDiameter = useTransform(() => touchRingInnerRadius.get() * 2);
  const touchRingOuterDiameter = useTransform(() => touchRingOuterRadius.get() * 2);
  const touchRingInnerTop = useTransform(() => orbitCenterY.get() - touchRingInnerRadius.get());
  const touchRingOuterTop = useTransform(() => orbitCenterY.get() - touchRingOuterRadius.get());
  const surfaceHeight = useTransform(() =>
    getSurfaceHeight({ containerWidth: containerWidth.get(), radius: orbitRadius.get() })
  );
  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container) return;

      const bounds = container.getBoundingClientRect();
      const pointX = event.clientX - bounds.left;
      const pointY = event.clientY - bounds.top;
      const nextHoverInfluence = isPointInItemTouchRing({
        centerX: containerWidth.get() / 2,
        centerY: orbitCenterY.get(),
        innerRadius: touchRingInnerRadius.get(),
        outerRadius: touchRingOuterRadius.get(),
        pointX,
        pointY,
      })
        ? 1
        : 0;

      hoverInfluenceTarget.set(nextHoverInfluence);
    },
    [containerWidth, hoverInfluenceTarget, orbitCenterY, touchRingInnerRadius, touchRingOuterRadius]
  );
  const handlePointerLeave = useCallback(() => {
    hoverInfluenceTarget.set(0);
  }, [hoverInfluenceTarget]);

  useEffect(() => {
    previousScrollYRef.current = scrollY.get();

    if (!scrollLinked) {
      scrollOrbitTarget.jump(0);
    }
  }, [scrollLinked, scrollOrbitTarget, scrollY]);

  useMotionValueEvent(scrollY, 'change', (latestScrollY) => {
    const scrollDelta = latestScrollY - previousScrollYRef.current;
    previousScrollYRef.current = latestScrollY;

    if (!scrollLinked || scrollDelta === 0) return;

    scrollOrbitTarget.set(scrollOrbitTarget.get() + getScrollOrbitDistanceDelta({ scrollDelta }));
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const syncGeometry = () => {
      const width = container.getBoundingClientRect().width;
      const nextSlotOffsets = getOrbitSlotOffsets({ containerWidth: width });

      containerWidth.set(width);
      setSlotOffsets((currentSlotOffsets) => {
        const hasSameBounds =
          currentSlotOffsets.length === nextSlotOffsets.length &&
          currentSlotOffsets[0] === nextSlotOffsets[0] &&
          currentSlotOffsets.at(-1) === nextSlotOffsets.at(-1);

        return hasSameBounds ? currentSlotOffsets : nextSlotOffsets;
      });
    };

    syncGeometry();
    const resizeObserver = new ResizeObserver(syncGeometry);
    resizeObserver.observe(container);
    window.addEventListener('resize', syncGeometry);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', syncGeometry);
    };
  }, [containerWidth]);

  useAnimationFrame((_time, delta) => {
    if (shouldReduceMotion) return;

    const radius = getOrbitRadius(containerWidth.get());
    const baseDistanceDelta = delta * ANCHOR_SPEED_RADIANS_PER_MS * radius * speedMultiplier.get();

    baseOrbitProgress.set(baseOrbitProgress.get() + baseDistanceDelta);
  });

  return (
    <motion.div
      ref={containerRef}
      className={cn(
        `
          relative w-full overflow-visible
          [--orbit-item-outline:rgb(0_0_0_/_0.45)]
          [--orbit-placeholder-outline:rgb(0_0_0_/_0.3)]
          [--orbit-surface-outline:rgb(0_0_0_/_0.25)]
          dark:[--orbit-item-outline:rgb(255_255_255_/_0.45)] dark:[--orbit-placeholder-outline:rgb(255_255_255_/_0.3)]
          dark:[--orbit-surface-outline:rgb(255_255_255_/_0.25)]
        `,
        className
      )}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      style={{ height: ORBIT_PLACEHOLDER_HEIGHT }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 outline-1 -outline-offset-1 outline-dashed"
        style={{ outlineColor: 'var(--orbit-placeholder-outline)' }}
      />

      <motion.div
        className={cn('absolute top-0 left-0 w-full', debugShowFullCircle ? 'overflow-visible' : 'overflow-hidden')}
        style={{ height: surfaceHeight, minHeight: CONTAINER_HEIGHT }}
      >
        {debugShowBorder ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-visible">
            <motion.div
              className="absolute left-1/2 rounded-full border border-dashed border-sky-500/70"
              style={{
                height: orbitDiameter,
                top: orbitTop,
                transform: 'translateX(-50%)',
                width: orbitDiameter,
              }}
            />
            <motion.div
              className="absolute left-1/2 rounded-full border border-dashed border-amber-500/70"
              style={{
                height: touchRingOuterDiameter,
                top: touchRingOuterTop,
                transform: 'translateX(-50%)',
                width: touchRingOuterDiameter,
              }}
            />
            <motion.div
              className="absolute left-1/2 rounded-full border border-dashed border-amber-500/70"
              style={{
                height: touchRingInnerDiameter,
                top: touchRingInnerTop,
                transform: 'translateX(-50%)',
                width: touchRingInnerDiameter,
              }}
            />
            <motion.div
              className={`
                absolute left-1/2 z-20 size-4 -translate-1/2 rounded-full bg-sky-500
                shadow-[0_0_0_6px_rgba(14,165,233,0.16)]
              `}
              style={{ top: orbitCenterY }}
            />
            <motion.div
              className="absolute left-1/2 h-px w-26 -translate-x-1/2 bg-sky-500/70"
              style={{ top: orbitCenterY }}
            />
            <motion.div
              className="absolute left-1/2 h-26 w-px -translate-x-1/2 bg-sky-500/70"
              style={{ top: orbitCenterVerticalTop }}
            />
          </div>
        ) : null}

        <motion.div
          className="relative z-10 w-full overflow-hidden"
          style={{ height: surfaceHeight, minHeight: CONTAINER_HEIGHT }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 outline-1 -outline-offset-1 outline-dashed"
            style={{ outlineColor: 'var(--orbit-surface-outline)' }}
          />

          {debugShowBorder ? (
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              {slotOffsets.map((slotOffset) => (
                <Fragment key={slotOffset}>
                  <OrbitGuide
                    containerWidth={containerWidth}
                    orbitProgress={orbitProgress}
                    slotCount={slotOffsets.length}
                    slotOffset={slotOffset}
                  />
                  <OrbitIntersectionPoint
                    containerWidth={containerWidth}
                    orbitProgress={orbitProgress}
                    slotCount={slotOffsets.length}
                    slotOffset={slotOffset}
                  />
                </Fragment>
              ))}
            </div>
          ) : null}

          {slotOffsets.map((slotOffset) => (
            <OrbitItem
              key={slotOffset}
              containerWidth={containerWidth}
              orbitProgress={orbitProgress}
              slotCount={slotOffsets.length}
              slotOffset={slotOffset}
            />
          ))}
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

interface OrbitItemProps {
  containerWidth: MotionValue<number>;
  orbitProgress: MotionValue<number>;
  slotCount: number;
  slotOffset: number;
}

const useOrbitPosition = ({ containerWidth, orbitProgress, slotCount, slotOffset }: OrbitItemProps) =>
  useTransform(() => {
    const width = containerWidth.get();
    const radius = getOrbitRadius(width);

    return projectItemSlotOnCircle({
      centerX: width / 2,
      containerWidth: width,
      instanceCount: slotCount,
      progress: orbitProgress.get(),
      radius,
      slotOffset,
    });
  });

const OrbitGuide: FC<OrbitItemProps> = ({ containerWidth, orbitProgress, slotCount, slotOffset }) => {
  const position = useOrbitPosition({
    containerWidth,
    orbitProgress,
    slotCount,
    slotOffset,
  });
  const x = useTransform(() => position.get().x);

  return <motion.div className="absolute top-0 h-full w-px bg-sky-500/20 will-change-transform" style={{ x }} />;
};

const OrbitIntersectionPoint: FC<OrbitItemProps> = ({ containerWidth, orbitProgress, slotCount, slotOffset }) => {
  const position = useOrbitPosition({
    containerWidth,
    orbitProgress,
    slotCount,
    slotOffset,
  });
  const x = useTransform(() => position.get().x);
  const y = useTransform(() => position.get().y);

  return (
    <motion.div
      className={`
        absolute top-0 left-0 z-20 size-2 -translate-1/2 rounded-full bg-sky-500
        shadow-[0_0_0_3px_rgba(14,165,233,0.16)] will-change-transform
      `}
      style={{ x, y }}
    />
  );
};

const OrbitItem: FC<OrbitItemProps> = ({ containerWidth, orbitProgress, slotCount, slotOffset }) => {
  const position = useOrbitPosition({
    containerWidth,
    orbitProgress,
    slotCount,
    slotOffset,
  });
  const x = useTransform(() => position.get().x - ITEM_WIDTH / 2);
  const y = useTransform(() => position.get().y - ITEM_HEIGHT / 2);
  const outlineColor = useTransform(() => (position.get().isAnchor ? '#ef4444' : 'var(--orbit-item-outline)'));
  const outlineWidth = useTransform(() => (position.get().isAnchor ? '2px' : '1px'));

  return (
    <motion.div
      aria-label={`Orbit item slot ${slotOffset}`}
      className={`
        absolute top-0 left-0 outline-1 -outline-offset-1 outline-black/45 will-change-transform outline-dashed
      `}
      style={{
        height: ITEM_HEIGHT,
        outlineColor,
        outlineWidth,
        width: ITEM_WIDTH,
        x,
        y,
      }}
    />
  );
};

export const OrbitTrackScrollScene: FC<Omit<OrbitTrackProps, 'scrollLinked'>> = (props) => (
  <div
    className={`
      relative min-h-[2400px] bg-neutral-50 py-20 text-neutral-950
      dark:bg-neutral-950 dark:text-neutral-50
    `}
  >
    <NativeScrollRuler className="absolute inset-y-0 left-0 z-[100] w-[34px]" side="left" />
    <NativeScrollRuler className="absolute inset-y-0 right-0 z-[100] w-[34px]" side="right" />

    <div className="mx-20 flex min-h-[calc(100vh-160px)] flex-col items-center justify-center">
      <ScrollPlaceholder label="Top placeholder" />
    </div>

    <div className="w-full">
      <OrbitTrack {...props} scrollLinked />
    </div>

    <div className="mx-20 flex min-h-[calc(100vh-160px)] flex-col items-center justify-center">
      <ScrollPlaceholder label="Bottom placeholder" />
    </div>
  </div>
);

const ScrollPlaceholder: FC<{ label: string }> = ({ label }) => (
  <div
    className={`
      flex size-[720px] max-h-[min(720px,calc(100vh-160px))] max-w-full items-center justify-center outline-1
      -outline-offset-1 outline-neutral-500/25 outline-dashed
    `}
  >
    <span className="text-sm/5 font-normal tracking-normal text-neutral-500/70">{label}</span>
  </div>
);
