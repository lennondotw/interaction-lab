import { frameData, frameSteps, JSAnimation, motionValue, time } from 'motion/react';
import { describe, expect, it } from 'vitest';

import { createTabCloseCapacity } from '../tab-close-capacity.js';
import { createTabSpring } from '../tab-spring.js';

function fixture(initial = 0) {
  const width = motionValue(initial);
  const capacity = motionValue(0);
  const close = createTabCloseCapacity(width, capacity);
  const disconnect = close.connect();
  return {
    width,
    capacity,
    close,
    cleanup() {
      disconnect();
      width.destroy();
      capacity.destroy();
    },
  };
}

function startSpring() {
  const processing = frameData.isProcessing;
  frameData.isProcessing = true;
  frameData.timestamp = performance.now();
  time.set(frameData.timestamp);
  frameSteps.preRender.process(frameData);
  frameData.isProcessing = processing;
}

describe('close capacity lifetime', () => {
  it('derives ordinary capacity through both compression stages', () => {
    const f = fixture(100);
    f.close.setTarget(100, true, 28);
    for (const width of [50, 28, 20, 8, 0, 60]) {
      f.width.set(width);
      expect(f.capacity.get()).toBe(Math.min(28, width));
    }
    f.cleanup();
  });

  it('freezes the destination during entry, including retargets below the basis', () => {
    const f = fixture();
    f.close.setTarget(100, false, 28);
    f.width.set(5);
    expect(f.capacity.get()).toBe(28);
    f.close.setTarget(20, false, 28);
    f.width.set(8);
    expect(f.capacity.get()).toBe(20);
    f.cleanup();
  });

  it('returns to ordinary capacity on the owned width spring’s completion', async () => {
    const f = fixture();
    const spring = createTabSpring(f.width);
    f.close.setTarget(20, false, 28);
    spring.set(20);
    startSpring();
    const animation = f.width.animation as JSAnimation<number>;
    animation.tick(animation.startTime! + 1000);
    await Promise.resolve();
    await Promise.resolve();
    f.width.set(8);
    expect(f.capacity.get()).toBe(8);
    spring.stop();
    f.cleanup();
  });

  it('captures tiny current capacity on exit and never recenters while collapsing', () => {
    const f = fixture(20);
    f.close.setTarget(20, true, 28);
    f.close.setPresent(false);
    f.close.setTarget(0, false, 28);
    f.width.set(5);
    expect(f.capacity.get()).toBe(20);
    f.close.setTarget(0, true, 28);
    f.width.jump(0);
    expect(f.capacity.get()).toBe(20);
    f.cleanup();
  });

  it('keeps an entering slot when the tab closes before its width completes', async () => {
    const f = fixture();
    const spring = createTabSpring(f.width);
    f.close.setTarget(100, false, 28);
    spring.set(100);
    startSpring();
    f.close.setPresent(false);
    f.close.setTarget(0, false, 28);
    spring.set(0);
    startSpring();
    const animation = f.width.animation as JSAnimation<number>;
    animation.tick(animation.startTime! + 1000);
    await Promise.resolve();
    await Promise.resolve();
    f.width.set(3);
    expect(f.capacity.get()).toBe(28);
    spring.stop();
    f.cleanup();
  });

  it('ends entry immediately on resize and honors the measured CSS basis', () => {
    const f = fixture();
    f.close.setTarget(20, false, 28);
    f.close.setTarget(40, true, 32);
    f.width.jump(40);
    expect(f.capacity.get()).toBe(32);
    f.width.set(10);
    expect(f.capacity.get()).toBe(10);
    f.cleanup();
  });

  it('does not wait for a nonexistent zero-width entry animation', () => {
    const f = fixture();
    f.close.setTarget(0, false, 28);
    f.width.set(8);
    expect(f.capacity.get()).toBe(8);
    f.cleanup();
  });

  it('restores ordinary compression when a retained ID returns', () => {
    const f = fixture(20);
    f.close.setTarget(20, true, 28);
    f.close.setPresent(false);
    f.width.set(5);
    f.close.setPresent(true);
    expect(f.capacity.get()).toBe(5);
    f.cleanup();
  });
});
