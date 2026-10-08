import type { MotionValue } from 'motion/react';

/** Ordinary compression derives capacity; presence temporarily owns a frozen capacity. */
export function createTabCloseCapacity(width: MotionValue<number>, capacity: MotionValue<number>) {
  let phase: 'entering' | 'present' | 'exiting' = 'entering';
  let basis: number;
  const update = () => {
    if (phase === 'present') capacity.set(Math.min(basis, width.get()));
  };
  return {
    connect() {
      const unsubscribeWidth = width.on('change', update);
      const unsubscribeComplete = width.on('animationComplete', () => {
        if (phase === 'entering') {
          phase = 'present';
          update();
        }
      });
      return () => {
        unsubscribeWidth();
        unsubscribeComplete();
      };
    },
    setPresent(present: boolean) {
      if (!present) phase = 'exiting';
      else if (phase === 'exiting') {
        phase = 'present';
        update();
      }
    },
    setTarget(this: void, target: number, immediate: boolean, closeBasis: number) {
      basis = closeBasis;
      if (phase === 'exiting') return;
      if (phase === 'entering') {
        if (immediate || (!width.isAnimating() && width.get() === target)) phase = 'present';
        else {
          capacity.set(Math.min(basis, target));
          return;
        }
      }
      capacity.set(Math.min(basis, immediate ? target : width.get()));
    },
  };
}
