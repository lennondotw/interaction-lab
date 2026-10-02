import { describe, expect, it } from 'vitest';

import { ScopeScale } from '../scope-scale.js';

describe('scope scale spring', () => {
  it('samples the same trajectory at 30, 60 and 144 fps', () => {
    function run(fps: number) {
      const scale = new ScopeScale(0.5);
      scale.sample(0, 16);
      for (let at = 1000 / fps; at < 200; at += 1000 / fps) scale.sample(at, 16);
      const rising = scale.sample(200, 16);
      scale.sample(200, 0.5);
      for (let at = 200 + 1000 / fps; at < 400; at += 1000 / fps) scale.sample(at, 0.5);
      return { rising, falling: scale.sample(400, 0.5) };
    }
    expect(run(30)).toEqual(run(60));
    expect(run(144)).toEqual(run(60));
  });

  it('hands off the current footprint and analytical velocity on every retarget', () => {
    const scale = new ScopeScale(0.5);
    let target = 16;
    scale.sample(0, target);
    for (const at of [20, 35, 50, 75, 90, 120, 150]) {
      const before = scale.sample(at, target);
      target = target === 16 ? 0.5 : 16;
      const after = scale.sample(at, target);
      expect(after).toEqual(before);
      const start = scale.sample(at, target);
      expect(start.value).toBeCloseTo(before.value, 12);
      expect(start.velocity).toBeCloseTo(before.velocity, 12);
      const advanced = scale.sample(at + 0.001, target);
      expect((advanced.value - before.value) / 0.000001).toBeCloseTo(before.velocity, 1);
    }
  });

  it('keeps moving in the inherited direction when the target reverses', () => {
    const scale = new ScopeScale(0.5);
    scale.sample(0, 16);
    const before = scale.sample(30, 0.5);
    const after = scale.sample(31, 0.5);
    expect(before.velocity).toBeGreaterThan(0);
    expect(after.value).toBeGreaterThan(before.value);
  });

  it('settles without restarting a stationary target', () => {
    const scale = new ScopeScale(0.5);
    expect(scale.sample(0, 0.5)).toEqual({ value: 0.5, velocity: 0 });
    scale.sample(0, 16);
    expect(scale.sample(2000, 16)).toEqual({ value: 16, velocity: 0 });
    expect(scale.sample(3000, 16)).toEqual({ value: 16, velocity: 0 });
    scale.sample(3000, 0.5);
    expect(scale.sample(5000, 0.5)).toEqual({ value: 0.5, velocity: 0 });
  });
});
