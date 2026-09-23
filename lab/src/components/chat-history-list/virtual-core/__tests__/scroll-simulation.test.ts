/**
 * The size model under simulated scrolling: discrete jumps, small wheel-like steps, and
 * critically damped animation toward a key whose offset keeps changing as sizes are measured.
 * The simulation measures true heights only for mounted items, as a browser would.
 */

import { describe, expect, it } from 'vitest';

import type { VirtualOverscan } from '../virtual-core.js';
import {
  anchorDrift,
  ListSimulation,
  messageKeys,
  seededRandom,
  stepCriticallyDamped,
  trueHeights,
} from './simulation.js';

function simulation(
  seed: number,
  options: { count?: number; overscan?: number | VirtualOverscan; estimate?: number } = {}
) {
  const keys = messageKeys(0, options.count ?? 2000);
  return new ListSimulation({
    keys,
    heights: trueHeights(keys, seed),
    estimate: options.estimate,
    overscan: options.overscan,
    paddingStart: 16,
    paddingEnd: 120,
  });
}

describe('critically damped spring', () => {
  it('approaches a fixed target without overshooting', () => {
    let state = { position: 0, velocity: 0 };
    let previous = state.position;
    for (let frame = 0; frame < 240; frame++) {
      state = stepCriticallyDamped(state, 5000, 15, 1 / 60);
      expect(state.position).toBeGreaterThanOrEqual(previous);
      expect(state.position).toBeLessThanOrEqual(5000);
      previous = state.position;
    }
    expect(state.position).toBeCloseTo(5000, 3);
  });

  it('gives the same result for one step or two half steps', () => {
    const start = { position: 120, velocity: -900 };
    const once = stepCriticallyDamped(start, 800, 15, 1 / 30);
    const twice = stepCriticallyDamped(stepCriticallyDamped(start, 800, 15, 1 / 60), 800, 15, 1 / 60);
    expect(twice.position).toBeCloseTo(once.position, 9);
    expect(twice.velocity).toBeCloseTo(once.velocity, 9);
  });
});

describe('initial layout', () => {
  it('measures everything visible at the top in one frame', () => {
    const sim = simulation(1);
    const result = sim.layout();
    expect(sim.viewportIsMeasured()).toBe(true);
    expect(result.passes).toBeLessThanOrEqual(4);
  });

  it('can start at the bottom and stay there', () => {
    const sim = simulation(2);
    sim.write(Number.POSITIVE_INFINITY);
    sim.layout();
    // Bottom alignment is a controller decision: re-pin until the measured bottom is stable.
    for (let frame = 0; frame < 10 && sim.scrollTop !== sim.maxScrollTop; frame++) sim.scrollTo(sim.maxScrollTop);
    expect(sim.scrollTop).toBe(sim.maxScrollTop);
    expect(sim.viewportIsMeasured()).toBe(true);
  });
});

describe('discrete jumps', () => {
  it.each([3, 4, 5])('seed %i: arbitrary jumps settle with a measured viewport and a fixed anchor', (seed) => {
    const sim = simulation(seed);
    sim.layout();
    const random = seededRandom(seed * 101);
    let maxPasses = 0;
    const drifts: number[] = [];
    for (let jump = 0; jump < 150; jump++) {
      const result = sim.scrollTo(random() * sim.maxScrollTop);
      maxPasses = Math.max(maxPasses, result.passes);
      expect(sim.viewportIsMeasured()).toBe(true);
      const drift = anchorDrift(result);
      if (drift !== null) drifts.push(drift);
    }
    expect(maxPasses).toBeLessThanOrEqual(8);
    expect(drifts.length).toBeGreaterThan(100);
    expect(drifts.filter((drift) => drift !== 0)).toEqual([]);
  });

  it('jumps back to a visited region with no measurement work', () => {
    const sim = simulation(6);
    sim.layout();
    sim.scrollTo(40_000);
    const visited = sim.scrollTop;
    const visibleKey = sim.core.item(sim.visibleRange()!.startIndex).key;
    sim.scrollTo(0);
    sim.scrollTo(visited);
    expect(sim.core.item(sim.visibleRange()!.startIndex).key).toBe(visibleKey);
    expect(sim.layout().passes).toBe(1);
  });

  it.each<[string, number | VirtualOverscan]>([
    ['zero pixels', 0],
    ['zero items', { kind: 'items', before: 0, after: 0 }],
    ['asymmetric items', { kind: 'items', before: 1, after: 6 }],
    [
      'custom: two viewports below only',
      {
        kind: 'custom',
        range: ({ viewport, visible, layout }) => {
          const below = layout.rangeFor(viewport.offset, viewport.offset + viewport.size * 3);
          return visible && below && { startIndex: visible.startIndex, endIndex: below.endIndex };
        },
      },
    ],
  ])('keeps the viewport measured with %s overscan', (_name, overscan) => {
    const sim = simulation(7, { overscan });
    sim.layout();
    const random = seededRandom(707);
    const unmeasured: number[] = [];
    for (let jump = 0; jump < 100; jump++) {
      sim.scrollTo(random() * sim.maxScrollTop);
      if (!sim.viewportIsMeasured()) unmeasured.push(jump);
    }
    expect(unmeasured).toEqual([]);
  });

  it('handles estimates far larger and far smaller than real sizes', () => {
    const drifts: number[] = [];
    for (const estimate of [4, 2000]) {
      const sim = simulation(8, { estimate });
      sim.layout();
      const random = seededRandom(estimate);
      for (let jump = 0; jump < 60; jump++) {
        const result = sim.scrollTo(random() * sim.maxScrollTop);
        expect(sim.viewportIsMeasured()).toBe(true);
        const drift = anchorDrift(result);
        if (drift !== null) drifts.push(drift);
      }
    }
    expect(drifts.length).toBeGreaterThan(80);
    expect(drifts.filter((drift) => drift !== 0)).toEqual([]);
  });
});

describe('continuous scrolling', () => {
  it('wheel-like steps down to the bottom measure every item', () => {
    const sim = simulation(9, { count: 600 });
    sim.layout();
    let frames = 0;
    while (sim.scrollTop < sim.maxScrollTop && frames < 10_000) {
      sim.scrollTo(sim.scrollTop + 120);
      expect(sim.viewportIsMeasured()).toBe(true);
      frames++;
    }
    expect(sim.scrollTop).toBe(sim.maxScrollTop);
    const heights = [...sim.heights.values()].reduce((sum, height) => sum + height, 0);
    expect(sim.core.stats().estimated).toBe(0);
    expect(sim.core.totalSize()).toBe(16 + heights + 120);
  });

  it('upward steps through unmeasured content keep the reading anchor fixed', () => {
    const sim = simulation(10, { count: 800 });
    sim.write(sim.maxScrollTop);
    sim.layout();
    const drifts: number[] = [];
    for (let step = 0; step < 10_000 && sim.scrollTop > 0; step++) {
      const result = sim.scrollTo(sim.scrollTop - 90);
      expect(sim.viewportIsMeasured()).toBe(true);
      const drift = anchorDrift(result);
      if (drift !== null) drifts.push(drift);
    }
    expect(sim.scrollTop).toBe(0);
    expect(drifts.length).toBeGreaterThan(100);
    expect(drifts.filter((drift) => drift !== 0)).toEqual([]);
  });
});

describe('animated scrolling to a key', () => {
  it.each([
    ['downward', 11, 'm1500'],
    ['upward', 12, 'm40'],
  ])('%s: follows the key while its offset changes and settles on it', (_direction, seed, key) => {
    const sim = simulation(seed);
    if (key === 'm40') sim.write(sim.maxScrollTop);
    sim.layout();
    const frames = sim.animate(() => sim.core.offsetOf(key)!);
    expect(Math.abs(sim.core.offsetOf(key)! - sim.scrollTop)).toBeLessThanOrEqual(0.1);
    expect(sim.viewportIsMeasured()).toBe(true);
    expect(frames.length).toBeLessThan(600);
    for (const frame of frames) expect(frame.passes).toBeLessThanOrEqual(8);
  });

  it('keeps the viewport measured on every frame of a long flight', () => {
    const sim = simulation(13);
    sim.layout();
    let uncovered = 0;
    sim.animate(() => {
      if (!sim.viewportIsMeasured()) uncovered++;
      return sim.core.offsetOf('m1800')!;
    });
    expect(uncovered).toBe(0);
  });
});

describe('window changes', () => {
  it('keeps the anchor in place when older items are prepended', () => {
    const keys = messageKeys(0, 1000);
    const sim = new ListSimulation({ keys: keys.slice(500), heights: trueHeights(keys, 14) });
    sim.layout();
    sim.scrollTo(6000);
    const anchor = sim.core.item(sim.visibleRange()!.startIndex);
    const screenTop = anchor.start - sim.scrollTop;
    const result = sim.change(() => sim.core.setKeys(keys.slice(300)));
    expect(result.anchor?.key).toBe(anchor.key);
    expect(sim.core.offsetOf(anchor.key)! - sim.scrollTop).toBe(screenTop);
    expect(sim.viewportIsMeasured()).toBe(true);
  });

  it('keeps visible positions when newer items are appended below', () => {
    const keys = messageKeys(0, 400);
    const sim = new ListSimulation({ keys: keys.slice(0, 200), heights: trueHeights(keys, 15) });
    sim.layout();
    sim.scrollTo(3000);
    const visible = sim.core.items(sim.visibleRange()!).map((item) => [item.key, item.start - sim.scrollTop]);
    sim.core.setKeys(keys);
    sim.layout();
    expect(sim.core.items(sim.visibleRange()!).map((item) => [item.key, item.start - sim.scrollTop])).toEqual(visible);
  });
});
