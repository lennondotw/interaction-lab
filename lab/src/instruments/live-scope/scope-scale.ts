import { toSpringPhysics } from '@monorepo/utils';
import { spring } from 'motion/react';

const SCALE_SPRING = {
  ...toSpringPhysics({ angularFrequency: 40, dampingRatio: 1.2 }),
  restDelta: 0.001,
  restSpeed: 0.01,
};

/** One analytical spring, sampled on the canvas clock rather than advanced by frame count. */
export class ScopeScale {
  private value: number;
  private velocity = 0;
  private target: number;
  private startedAt = 0;
  private animation: ReturnType<typeof spring> | null = null;

  constructor(initial: number) {
    this.value = initial;
    this.target = initial;
  }

  sample(now: number, target: number): { value: number; velocity: number } {
    if (this.animation) {
      const elapsed = now - this.startedAt;
      const state = this.animation.next(elapsed);
      this.value = state.value;
      // Motion's spring supplies an analytical derivative in units per second.
      this.velocity = state.done ? 0 : this.animation.velocity!(elapsed);
      if (state.done) this.animation = null;
    }

    if (target !== this.target) {
      // Sample the outgoing trajectory first: the new spring inherits this frame's footprint and velocity.
      this.animation = spring({
        ...SCALE_SPRING,
        keyframes: [this.value, target],
        velocity: this.velocity,
      });
      this.startedAt = now;
      this.target = target;
    }

    return { value: this.value, velocity: this.velocity };
  }
}
