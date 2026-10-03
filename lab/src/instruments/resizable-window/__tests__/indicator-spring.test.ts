import { JSAnimation, motionValue } from 'motion/react';
import { describe, expect, it } from 'vitest';

import { createIndicatorSpring } from '../indicator-spring.js';

function criticalPosition(from: number, target: number, velocity: number, omega: number, seconds: number) {
  const displacement = from - target;
  return target + (displacement + (velocity + omega * displacement) * seconds) * Math.exp(-omega * seconds);
}

/** Step the real generator without a browser clock or a mocked animation API. */
function step(animation: JSAnimation<number>, milliseconds: number) {
  animation.tick(animation.startTime! + milliseconds);
}

describe('indicator spring handoff', () => {
  it.each([
    ['edge length', 24, 28, 26],
    ['corner length', 28.8, 33.6, 31.2],
    ['thickness', 3, 4, 3.5],
    ['opacity', 0.6, 0.8, 1],
  ])('preserves the moving %s and its velocity when pressing and releasing', (_name, rest, hover, active) => {
    const value = motionValue(rest);
    const controller = createIndicatorSpring(value);
    controller.set(hover, false);
    const hoverAnimation = value.animation as JSAnimation<number>;
    step(hoverAnimation, 60);
    expect(value.get()).toBeCloseTo(criticalPosition(rest, hover, 0, 35, 0.06), 10);

    const pressFrom = value.get();
    const pressVelocity = hoverAnimation.getGeneratorVelocity();
    expect(Math.abs(pressVelocity)).toBeGreaterThan(0);
    controller.set(active, true);
    const pressAnimation = value.animation as JSAnimation<number>;
    expect(value.get()).toBe(pressFrom);
    expect(pressAnimation.getGeneratorVelocity()).toBeCloseTo(pressVelocity, 10);
    step(pressAnimation, 10);
    expect(value.get()).toBeCloseTo(criticalPosition(pressFrom, active, pressVelocity, 80, 0.01), 10);

    const releaseFrom = value.get();
    const releaseVelocity = pressAnimation.getGeneratorVelocity();
    controller.set(hover, false);
    const releaseAnimation = value.animation as JSAnimation<number>;
    expect(value.get()).toBe(releaseFrom);
    expect(releaseAnimation.getGeneratorVelocity()).toBeCloseTo(releaseVelocity, 10);
    step(releaseAnimation, 10);
    expect(value.get()).toBeCloseTo(criticalPosition(releaseFrom, hover, releaseVelocity, 35, 0.01), 10);
    controller.stop();
    value.destroy();
  });

  it('does not restart an owned active spring when hover changes without changing its target', () => {
    const value = motionValue(28);
    const controller = createIndicatorSpring(value);
    controller.set(26, true);
    const animation = value.animation as JSAnimation<number>;
    step(animation, 10);
    controller.set(26, true);
    expect(value.animation).toBe(animation);
    controller.stop();
    value.destroy();
  });

  it('jumps to the target without animation when reduced motion is requested', () => {
    const value = motionValue(28);
    const controller = createIndicatorSpring(value);
    controller.set(26, true, true);
    expect(value.get()).toBe(26);
    expect(value.isAnimating()).toBe(false);
    value.destroy();
  });
});
