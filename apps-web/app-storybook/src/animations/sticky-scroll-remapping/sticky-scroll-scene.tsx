import { cn } from '@monorepo/utils';
import { motion, useMotionValue, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react';
import { useLayoutEffect, useRef, type FC, type ReactNode } from 'react';

import { NativeScrollRuler } from '../../components/native-scroll-ruler/native-scroll-ruler.js';
import { getStickyScrollCompensation } from './sticky-scroll-remapping.js';

export interface StickyScrollSceneProps {
  children: (progress: MotionValue<number>) => ReactNode;
  className?: string;
  remap?: boolean;
}

export const StickyScrollScene: FC<StickyScrollSceneProps> = ({ children, className, remap = false }) => {
  const trackRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const trackTop = useMotionValue(0);
  const sectionHeight = useMotionValue(0);
  const stickyHeight = useMotionValue(0);
  const viewportHeight = useMotionValue(0);
  const prefersReducedMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const scrollYProgress = useTransform([scrollY, trackTop, sectionHeight, viewportHeight], (latestValues) => {
    const [latestScrollY, measuredTrackTop, measuredSectionHeight, measuredViewportHeight] = latestValues as [
      number,
      number,
      number,
      number,
    ];
    const totalInputDistance = measuredViewportHeight + measuredSectionHeight;

    if (totalInputDistance <= 0) return 0;

    return Math.min(1, Math.max(0, (latestScrollY - measuredTrackTop + measuredViewportHeight) / totalInputDistance));
  });
  const y = useTransform([scrollYProgress, sectionHeight, stickyHeight, viewportHeight], (latestValues) => {
    const [progress, measuredSectionHeight, measuredStickyHeight, measuredViewportHeight] = latestValues as [
      number,
      number,
      number,
      number,
    ];

    if (!remap || prefersReducedMotion) return 0;

    return getStickyScrollCompensation(progress, {
      sectionHeight: measuredSectionHeight,
      stickyHeight: measuredStickyHeight,
      viewportHeight: measuredViewportHeight,
    });
  });

  useLayoutEffect(() => {
    const track = trackRef.current;
    const sticky = stickyRef.current;
    if (!track || !sticky) return;

    const measure = () => {
      trackTop.set(track.getBoundingClientRect().top + window.scrollY);
      sectionHeight.set(track.getBoundingClientRect().height);
      stickyHeight.set(sticky.getBoundingClientRect().height);
      viewportHeight.set(window.innerHeight);
    };
    const resizeObserver = new ResizeObserver(measure);

    resizeObserver.observe(track);
    resizeObserver.observe(sticky);
    window.addEventListener('resize', measure);
    measure();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [sectionHeight, stickyHeight, trackTop, viewportHeight]);

  return (
    <div
      className={cn(
        `
          relative bg-neutral-50 text-neutral-950
          dark:bg-neutral-950 dark:text-neutral-50
        `,
        className
      )}
    >
      <NativeScrollRuler className="absolute inset-y-0 left-0 z-[100] w-[34px]" side="left" />
      <NativeScrollRuler className="absolute inset-y-0 right-0 z-[100] w-[34px]" side="right" />

      <ScrollPlaceholder label="Entry placeholder" />

      <section ref={trackRef} className="relative h-[200dvh]" data-sticky-scroll-track="">
        <div
          ref={stickyRef}
          className="sticky top-0 flex h-[100dvh] items-center justify-center px-14"
          data-sticky-scroll-layer=""
        >
          <motion.div
            className="w-full max-w-4xl will-change-transform"
            data-sticky-scroll-remapped-layer=""
            style={{ y }}
          >
            <div
              className={`
                p-8 outline-1 -outline-offset-1 outline-neutral-500/35 outline-dashed
                dark:outline-neutral-400/35
              `}
            >
              {children(scrollYProgress)}
            </div>
          </motion.div>
        </div>
      </section>

      <ScrollPlaceholder label="Exit placeholder" />
    </div>
  );
};

const ScrollPlaceholder: FC<{ label: string }> = ({ label }) => (
  <div className="flex min-h-[100dvh] items-center justify-center px-14 py-12">
    <div
      className={`
        flex min-h-80 w-full max-w-4xl items-center justify-center outline-1 -outline-offset-1 outline-neutral-500/25
        outline-dashed
        dark:outline-neutral-400/25
      `}
    >
      <span
        className={`
          text-sm/5 text-neutral-500/70
          dark:text-neutral-400/70
        `}
      >
        {label}
      </span>
    </div>
  </div>
);
