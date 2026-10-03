import { JSAnimation, motionValue } from 'motion/react';
import { describe, expect, it } from 'vitest';

import { createTabSpring } from '../tab-spring.js';

function criticalPosition(from: number, target: number, velocity: number, seconds: number) {
  const displacement = from - target;
  return target + (displacement + (velocity + 25 * displacement) * seconds) * Math.exp(-25 * seconds);
}

function step(value: ReturnType<typeof motionValue<number>>, milliseconds: number) {
  const animation = value.animation as JSAnimation<number>;
  animation.tick(animation.startTime! + milliseconds);
  return animation;
}

describe('tab footprint springs', () => {
  it.each([
    ['width', 138.5],
    ['left gap', 4],
  ])('expands %s from zero with the 25/1 spring', (_name, target) => {
    const value = motionValue(0);
    const controller = createTabSpring(value);
    controller.set(target);
    expect(value.get()).toBe(0);
    step(value, 40);
    expect(value.get()).toBeCloseTo(criticalPosition(0, target, 0, 0.04), 10);
    step(value, 1000);
    expect(value.get()).toBe(target);
    value.destroy();
  });

  it('hands off pixel width and velocity when a growing tab is compressed repeatedly', () => {
    const value = motionValue(0);
    const controller = createTabSpring(value);
    controller.set(176);

    for (const target of [138.5, 110, 92, 120]) {
      const previous = step(value, 35);
      const footprint = value.get();
      const velocity = previous.getGeneratorVelocity();
      expect(Math.abs(velocity)).toBeGreaterThan(0);
      controller.set(target);
      expect(value.get()).toBe(footprint);
      expect((value.animation as JSAnimation<number>).getGeneratorVelocity()).toBeCloseTo(velocity, 10);
      step(value, 10);
      expect(value.get()).toBeCloseTo(criticalPosition(footprint, target, velocity, 0.01), 10);
    }
    value.destroy();
  });

  it('keeps the total footprint constant while existing tabs shrink and the new tab/gap grow', () => {
    const values = [176, 176, 176, 0, 0].map((initial) => motionValue(initial));
    const controllers = values.map(createTabSpring);
    const targets = [131, 131, 131, 131, 4];
    controllers.forEach((controller, index) => controller.set(targets[index]!));
    for (const time of [0, 16, 40, 80, 160, 320]) {
      values.forEach((value) => {
        step(value, time);
      });
      expect(values.reduce((sum, value) => sum + value.get(), 0)).toBeCloseTo(528, 8);
    }
    values.forEach((value) => value.destroy());
  });

  it('does not restart a spring when a resize observation repeats the same target', () => {
    const value = motionValue(176);
    const controller = createTabSpring(value);
    controller.set(138.5);
    const animation = step(value, 40);
    controller.set(138.5);
    expect(value.animation).toBe(animation);
    value.destroy();
  });

  it('hands off a growing tab and left gap into an exit that settles exactly at zero', async () => {
    const values = [motionValue(0), motionValue(0)];
    const controllers = values.map(createTabSpring);
    controllers[0]!.set(138.5);
    controllers[1]!.set(4);
    for (const [index, value] of values.entries()) {
      const entering = step(value, 40);
      const footprint = value.get();
      const velocity = entering.getGeneratorVelocity();
      expect(velocity).toBeGreaterThan(0);
      controllers[index]!.set(0);
      expect(value.get()).toBe(footprint);
      expect((value.animation as JSAnimation<number>).getGeneratorVelocity()).toBeCloseTo(velocity, 10);
      step(value, 10);
      expect(value.get()).toBeCloseTo(criticalPosition(footprint, 0, velocity, 0.01), 10);
      step(value, 1000);
      expect(value.get()).toBe(0);
      // MotionValue clears its owned animation in the completion microtask.
      await Promise.resolve();
      expect(value.isAnimating()).toBe(false);
      value.destroy();
    }
  });

  it('keeps a compressed row in place while a tab/gap collapse and surviving tabs expand', () => {
    const values = [110, 110, 110, 110, 110, 4].map((initial) => motionValue(initial));
    const controllers = values.map(createTabSpring);
    const targets = [138.5, 138.5, 138.5, 138.5, 0, 0];
    controllers.forEach((controller, index) => controller.set(targets[index]!));
    for (const time of [0, 16, 40, 80, 160, 320, 1000]) {
      values.forEach((value) => {
        step(value, time);
      });
      expect(values.reduce((sum, value) => sum + value.get(), 0)).toBeCloseTo(554, 2);
    }
    expect(values[4]!.get()).toBe(0);
    expect(values[5]!.get()).toBe(0);
    values.forEach((value) => value.destroy());
  });

  it('stops a moving spring immediately when reduced motion is enabled, even at the same target', () => {
    const value = motionValue(0);
    const controller = createTabSpring(value);
    controller.set(138.5);
    step(value, 40);
    controller.set(138.5, true);
    expect(value.get()).toBe(138.5);
    expect(value.isAnimating()).toBe(false);
    expect(value.getVelocity()).toBe(0);
    value.destroy();
  });
});
