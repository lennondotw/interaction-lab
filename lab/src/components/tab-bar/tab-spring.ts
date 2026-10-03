import { toSpringPhysics } from '@monorepo/utils';
import { JSAnimation, type MotionValue } from 'motion/react';

const tabSpring = {
  type: 'spring' as const,
  ...toSpringPhysics({ angularFrequency: 25, dampingRatio: 1 }),
  restDelta: 0.001,
  restSpeed: 0.01,
};

/** Own pixel position and generator velocity across successive layout targets. */
export function createTabSpring(value: MotionValue<number>) {
  let target = value.get();
  let animation: JSAnimation<number> | undefined;

  return {
    getTarget() {
      return target;
    },
    set(next: number, immediate = false) {
      if (immediate) {
        target = next;
        value.jump(next);
        return;
      }
      if (target === next) return;
      target = next;

      // Read both before start() stops the previous animation. A normalized progress
      // spring would preserve neither the pixel footprint nor its incoming velocity.
      const from = value.get();
      const velocity = value.isAnimating() ? animation!.getGeneratorVelocity() : value.getVelocity();
      void value.start((complete) => {
        animation = new JSAnimation({
          ...tabSpring,
          keyframes: [from, next],
          velocity,
          onUpdate: (latest) => value.set(latest),
          onComplete: complete,
        });
        return animation;
      });
    },
    stop() {
      value.stop();
    },
  };
}
