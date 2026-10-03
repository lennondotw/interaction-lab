import { toSpringPhysics } from '@monorepo/utils';
import { cancelFrame, frame, frameData, JSAnimation, type MotionValue } from 'motion/react';

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
  let speed = 1;
  let pending = false;

  function start() {
    if (!pending) return;
    pending = false;
    if (!value.isAnimating() && value.get() === target) return;
    // preRender runs after every existing spring's update. Read the footprint
    // and velocity at this frame's shared time, including unchanged old exits.
    // Generator velocity is in normal-speed units, independent of playback speed.
    const from = value.get();
    const velocity = value.isAnimating() ? animation!.getGeneratorVelocity() : value.getVelocity() / speed;
    void value.start((complete) => {
      const owned = new JSAnimation({
        ...tabSpring,
        keyframes: [from, target],
        velocity,
        onUpdate: (latest) => value.set(latest),
        onComplete: () => {
          // An old spring can finish in update just before preRender hands off.
          // Its completion must not clear the replacement's MotionValue owner.
          queueMicrotask(() => {
            if (value.animation === owned) complete();
          });
        },
      });
      animation = owned;
      animation.speed = speed;
      // JSAnimation rounds elapsed milliseconds. Integer frame origins keep old
      // exits and new handoffs on the same rounded clock across fractional rAF times.
      animation.startTime = Math.round(frameData.timestamp);
      return animation;
    });
  }

  function set(next: number, immediate = false) {
    if (immediate) {
      pending = false;
      cancelFrame(start);
      target = next;
      value.jump(next);
      return;
    }
    if (target === next) return;
    // Publish intent synchronously for consecutive closes, but hand off after
    // the next update phase so a new clock cannot lag behind retained exits.
    target = next;
    pending = true;
    frame.preRender(start);
  }

  return {
    getTarget() {
      return target;
    },
    set,
    setSpeed(next: number) {
      speed = next;
      if (value.isAnimating()) animation!.speed = next;
    },
    stop() {
      pending = false;
      cancelFrame(start);
      value.stop();
    },
  };
}
