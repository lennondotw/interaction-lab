import type { MotionValue } from 'motion/react';
import { useCallback, useLayoutEffect, useRef } from 'react';

/** Presence reveals/clips a fixed close slot; ordinary compression keeps its flex centering. */
export function useTabCloseLayout(isPresent: boolean, width: MotionValue<number>) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const basis = useRef<number | null>(null);
  const phase = useRef<'entering' | 'present' | 'exiting'>('entering');

  const release = useCallback(() => {
    closeRef.current!.style.removeProperty('flex-basis');
    closeRef.current!.style.removeProperty('flex-shrink');
  }, []);
  const freeze = useCallback((closeWidth: number) => {
    closeRef.current!.style.flexBasis = `${closeWidth}px`;
    closeRef.current!.style.flexShrink = '0';
  }, []);

  useLayoutEffect(() => {
    // The declared basis remains measurable even while the entering tab is 0px wide.
    basis.current = parseFloat(getComputedStyle(closeRef.current!).flexBasis);
    const unsubscribe = width.on('animationComplete', () => {
      if (phase.current === 'entering') {
        phase.current = 'present';
        release();
      }
    });
    return () => {
      unsubscribe();
      release();
    };
  }, [release, width]);

  useLayoutEffect(() => {
    if (!isPresent) {
      phase.current = 'exiting';
      freeze(closeRef.current!.getBoundingClientRect().width);
    } else if (phase.current === 'exiting') {
      phase.current = 'present';
      release();
    }
  }, [freeze, isPresent, release]);

  const setTarget = useCallback(
    (tabWidth: number, immediate: boolean) => {
      if (phase.current !== 'entering') return;
      if (immediate || (!width.isAnimating() && width.get() === tabWidth)) {
        phase.current = 'present';
        release();
      } else {
        freeze(Math.min(basis.current!, tabWidth));
      }
    },
    [freeze, release, width]
  );

  return { closeRef, setTarget };
}
