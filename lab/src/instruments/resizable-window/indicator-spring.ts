import { toSpringPhysics } from '@monorepo/utils';
import { JSAnimation, type MotionValue } from 'motion/react';

export const handleSpring = { type: 'spring' as const, ...toSpringPhysics({ angularFrequency: 35, dampingRatio: 1 }) };
const pressSpring = { type: 'spring' as const, ...toSpringPhysics({ angularFrequency: 80, dampingRatio: 1 }) };

/** Retarget one persistent numeric footprint; switching spring coefficients must not reset its motion. */
export function createIndicatorSpring(value: MotionValue<number>) {
  let target = value.get();
  let animation: JSAnimation<number> | undefined;
  return {
    set(next: number, pressed: boolean, reducedMotion = false) {
      if (next === target) return;
      target = next;
      if (reducedMotion) {
        value.jump(next);
        return;
      }

      // Capture position and velocity BEFORE start() stops the previous spring.
      // The generator's derivative is independent of the last frame's duration;
      // getVelocity() alone estimates it from samples and loses accuracy at high refresh rates.
      // Animate pixels/opacity themselves, rather than an active blend weight: if hover is
      // still moving, restarting a new blend at zero would preserve position but lose
      // the footprint's incoming velocity. Release inherits it too, with the original 35/1.
      const from = value.get();
      const velocity = value.isAnimating() ? animation!.getGeneratorVelocity() : value.getVelocity();
      void value.start((complete) => {
        animation = new JSAnimation({
          keyframes: [from, next],
          velocity,
          ...(pressed ? pressSpring : handleSpring),
          restDelta: 0.001,
          restSpeed: 0.01,
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
