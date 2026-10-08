import { cancelFrame, frame, useMotionValue, usePresence } from 'motion/react';
import { useLayoutEffect, useRef, useState } from 'react';

import type { TabFootprint } from './tab-bar.types.js';
import { createTabSpring } from './tab-spring.js';
import { useTabCloseLayout } from './use-tab-close-layout.js';

export function useTabFootprint(id: string, footprints: Map<string, TabFootprint>) {
  const [isPresent, safeToRemove] = usePresence();
  const elementRef = useRef<HTMLDivElement>(null);
  const closeElementRef = useRef<HTMLDivElement>(null);
  const width = useMotionValue(0);
  const gap = useMotionValue(0);
  const present = useRef(isPresent);
  useLayoutEffect(() => {
    present.current = isPresent;
  }, [isPresent]);
  const { closeCapacity, setCloseTarget } = useTabCloseLayout(isPresent, width);
  const [widthSpring] = useState(() => createTabSpring(width));
  const [gapSpring] = useState(() => createTabSpring(gap));

  useLayoutEffect(() => {
    footprints.set(id, {
      getTargetWidth: () => widthSpring.getTarget(),
      read: () => ({
        id,
        width: width.get(),
        gap: gap.get(),
        closeCapacity: closeCapacity.get(),
        present: present.current,
      }),
      subscribe(changed) {
        const subscriptions = [width, gap, closeCapacity].map((value) => value.on('change', changed));
        return () => subscriptions.forEach((unsubscribe) => unsubscribe());
      },
      setSpeed(speed) {
        widthSpring.setSpeed(speed);
        gapSpring.setSpeed(speed);
      },
      set(nextWidth, nextGap, immediate, closeBasis) {
        setCloseTarget(nextWidth, immediate, closeBasis);
        widthSpring.set(nextWidth, immediate);
        gapSpring.set(nextGap, immediate);
        if (immediate) {
          // Mount/reduced-motion layout must be visible before the first paint,
          // without waiting for Motion's scheduled style render.
          elementRef.current!.style.width = `${nextWidth}px`;
          elementRef.current!.style.marginLeft = `${nextGap}px`;
          closeElementRef.current!.style.width = `${closeCapacity.get()}px`;
        }
      },
    });
    return () => {
      footprints.delete(id);
      widthSpring.stop();
      gapSpring.stop();
    };
  }, [closeCapacity, footprints, gap, gapSpring, id, setCloseTarget, width, widthSpring]);

  useLayoutEffect(() => {
    if (isPresent) return;

    const removeIfCollapsed = () => {
      if (width.get() === 0 && gap.get() === 0) safeToRemove();
    };
    // Wait until Motion has rendered both zero footprints before releasing the
    // presence hold. This also covers immediate reduced-motion updates and a tab
    // closed before its first entering frame, without an arbitrary exit timeout.
    const scheduleRemoval = () => frame.postRender(removeIfCollapsed);
    const unsubscribeWidth = width.on('change', scheduleRemoval);
    const unsubscribeGap = gap.on('change', scheduleRemoval);
    scheduleRemoval();
    return () => {
      unsubscribeWidth();
      unsubscribeGap();
      cancelFrame(removeIfCollapsed);
    };
  }, [gap, isPresent, safeToRemove, width]);

  return { elementRef, closeElementRef, closeCapacity, width, gap, isPresent };
}
