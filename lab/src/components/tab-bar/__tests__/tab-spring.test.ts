import { frameData, frameSteps, JSAnimation, motionValue, time } from 'motion/react';
import { describe, expect, it } from 'vitest';

import { createTabSpring } from '../tab-spring.js';

function criticalPosition(from: number, target: number, velocity: number, seconds: number) {
  const displacement = from - target;
  return target + (displacement + (velocity + 25 * displacement) * seconds) * Math.exp(-25 * seconds);
}

function flushSpringStarts(timestamp = performance.now()) {
  const wasProcessing = frameData.isProcessing;
  frameData.isProcessing = true;
  frameData.timestamp = timestamp;
  time.set(timestamp);
  frameSteps.preRender.process(frameData);
  frameData.isProcessing = wasProcessing;
}

function flushFrame(timestamp: number) {
  const wasProcessing = frameData.isProcessing;
  frameData.isProcessing = true;
  frameData.timestamp = timestamp;
  time.set(timestamp);
  frameSteps.update.process(frameData);
  frameSteps.preRender.process(frameData);
  frameData.isProcessing = wasProcessing;
}

function step(value: ReturnType<typeof motionValue<number>>, milliseconds: number) {
  flushSpringStarts();
  const animation = value.animation as JSAnimation<number>;
  animation.tick(animation.startTime! + milliseconds);
  return animation;
}

describe('tab footprint springs', () => {
  it.each([0.1, 0.25, 0.5, 1])('coordinates consecutive closes between frames with retained exits at %s×', (speed) => {
    const values = Array.from({ length: 20 }, (_, index) => [
      motionValue(24.5),
      motionValue(index === 0 ? 0 : 4),
    ]).flat();
    const controllers = values.map(createTabSpring);
    controllers.forEach((controller) => controller.setSpeed(speed));
    let timestamp = performance.now();
    const occupied = () => values.reduce((sum, value) => sum + value.get(), 0) + 40;
    for (let closed = 1; closed <= 12; closed++) {
      // React commits between frames, 12ms after the last footprint sample.
      // Older exits keep their zero destination and owned animation clock.
      time.set(timestamp + 12);
      const count = 20 - closed;
      const targetWidth = (570 - count * 4) / count;
      const oldExit = values[0]!.animation;
      for (let index = 0; index < 20; index++) {
        controllers[index * 2]!.set(index < closed ? 0 : targetWidth);
        controllers[index * 2 + 1]!.set(index <= closed ? 0 : 4);
      }
      expect(controllers[closed * 2]!.getTarget()).toBe(targetWidth);
      expect(values[0]!.animation).toBe(oldExit);
      timestamp += 80.35;
      flushFrame(timestamp);
      // At most forty widths/gaps can independently snap their <0.001px rest residue.
      expect(Math.abs(occupied() - 606)).toBeLessThan(0.04);
      timestamp += 16.2;
      flushFrame(timestamp);
      expect(Math.abs(occupied() - 606)).toBeLessThan(0.04);
    }
    controllers.forEach((controller) => controller.stop());
    values.forEach((value) => value.destroy());
  });

  it('keeps a new handoff owned when the previous spring finishes during the same frame', async () => {
    const value = motionValue(0);
    const controller = createTabSpring(value);
    let completions = 0;
    value.on('animationComplete', () => completions++);
    const timestamp = performance.now();
    controller.set(100);
    flushFrame(timestamp);
    const old = value.animation;
    controller.set(200);
    flushFrame(timestamp + 1000);
    const replacement = value.animation;
    expect(replacement).not.toBe(old);
    await Promise.resolve();
    await Promise.resolve();
    expect(value.animation).toBe(replacement);
    expect(completions).toBe(0);
    flushFrame(timestamp + 1020);
    expect(value.get()).toBeGreaterThan(100);
    controller.stop();
    value.destroy();
  });

  it('coalesces pending targets and cancels a deferred start on immediate layout or cleanup', () => {
    const value = motionValue(0);
    const controller = createTabSpring(value);
    controller.set(176);
    controller.set(67.25);
    expect(controller.getTarget()).toBe(67.25);
    expect(value.get()).toBe(0);
    expect(value.isAnimating()).toBe(false);
    flushSpringStarts();
    step(value, 40);
    expect(value.get()).toBeCloseTo(criticalPosition(0, 67.25, 0, 0.04), 8);
    controller.set(40);
    controller.set(40, true);
    flushSpringStarts();
    expect(value.get()).toBe(40);
    expect(value.isAnimating()).toBe(false);
    controller.set(0);
    controller.stop();
    flushSpringStarts();
    expect(value.get()).toBe(40);
    expect(value.isAnimating()).toBe(false);
    value.destroy();
  });

  it('changes playback speed on the owned animation without resetting its position or generator velocity', () => {
    const value = motionValue(0);
    const controller = createTabSpring(value);
    controller.set(100);
    flushSpringStarts();
    const animation = value.animation as JSAnimation<number>;
    animation.pause();
    animation.time = 0.08;
    animation.tick(animation.startTime! + 80);
    const footprint = value.get();
    const velocity = animation.getGeneratorVelocity();
    controller.setSpeed(0.25);
    expect(value.animation).toBe(animation);
    expect(value.get()).toBe(footprint);
    expect(animation.getGeneratorVelocity()).toBe(velocity);
    expect(animation.speed).toBe(0.25);
    value.destroy();
  });

  it('applies immediate layout widths without starting an animation', () => {
    const value = motionValue(67.25);
    const controller = createTabSpring(value);
    for (const width of [57.25, 80, 12]) {
      controller.set(width, true);
      expect(value.get()).toBe(width);
      expect(controller.getTarget()).toBe(width);
      expect(value.isAnimating()).toBe(false);
      expect(value.getVelocity()).toBe(0);
    }
    value.destroy();
  });

  it('interrupts simultaneous enter, compression, exit and gap springs at their final layout', () => {
    const values = [0, 0, 67.25, 67.25, 4, 0].map((initial) => motionValue(initial));
    const controllers = values.map(createTabSpring);
    const movingTargets = [59.25, 4, 59.25, 0, 0, 4];
    controllers.forEach((controller, index) => {
      controller.setSpeed(0.1);
      controller.set(movingTargets[index]!);
      step(values[index]!, 100);
      expect(values[index]!.isAnimating()).toBe(true);
    });
    // Unchanged destinations must settle too, including the exiting width/gap.
    const resizedTargets = [57.25, 4, 57.25, 0, 0, 4];
    controllers.forEach((controller, index) => {
      const value = values[index]!;
      controller.set(resizedTargets[index]!, true);
      expect(value.get()).toBe(resizedTargets[index]);
      expect(controller.getTarget()).toBe(resizedTargets[index]);
      expect(value.isAnimating()).toBe(false);
      expect(value.getVelocity()).toBe(0);
    });
    values.forEach((value) => value.destroy());
  });

  it.each([0.1, 0.25, 0.5, 1])('plays the same spring at %s× and preserves generator velocity on retarget', (speed) => {
    const value = motionValue(0);
    const controller = createTabSpring(value);
    controller.setSpeed(speed);
    controller.set(100);
    flushSpringStarts();
    (value.animation as JSAnimation<number>).time = 0;
    const previous = step(value, 100);
    expect(previous.speed).toBe(speed);
    expect(value.get()).toBeCloseTo(criticalPosition(0, 100, 0, 0.1 * speed), 8);
    const footprint = value.get();
    const velocity = previous.getGeneratorVelocity();
    controller.set(75);
    expect(value.get()).toBeCloseTo(footprint, 8);
    flushSpringStarts();
    const next = value.animation as JSAnimation<number>;
    expect(next.speed).toBe(speed);
    expect(next.getGeneratorVelocity()).toBeCloseTo(velocity, 8);
    next.time = 0;
    step(value, 20);
    expect(value.get()).toBeCloseTo(criticalPosition(footprint, 75, velocity, 0.02 * speed), 8);
    value.destroy();
  });

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
      flushSpringStarts();
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
      flushSpringStarts();
      expect((value.animation as JSAnimation<number>).getGeneratorVelocity()).toBeCloseTo(velocity, 10);
      step(value, 10);
      expect(value.get()).toBeCloseTo(criticalPosition(footprint, 0, velocity, 0.01), 10);
      step(value, 1000);
      expect(value.get()).toBe(0);
      // MotionValue clears its owned animation in the completion microtask.
      await Promise.resolve();
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
