/**
 * Anchoring in the simulated viewport: every change a real list makes, at the three reference
 * lines. Heights are in quarter pixels and nothing is rounded, so a correct anchor holds exactly.
 */

import { describe, expect, it } from 'vitest';

import {
  anchorDrift,
  ListSimulation,
  messageKeys,
  seededRandom,
  trueHeights,
} from '../../virtual-core/__tests__/simulation.js';

const ratios = [0, 0.5, 1];

/** Heights cover m0..m7000, so any window a test switches to can be measured. */
function simulation(seed: number, anchorRatio: number, keys = messageKeys(0, 1500)) {
  return new ListSimulation({
    keys,
    heights: trueHeights(messageKeys(0, 7000), seed),
    anchorRatio,
    paddingStart: 16,
    paddingEnd: 120,
  });
}

describe.each(ratios)('reference line at %s', (ratio) => {
  it('holds the anchor through upward steps over unmeasured content', () => {
    const sim = simulation(21, ratio);
    sim.layout();
    sim.scrollTo(60_000);
    const drifts: (number | null)[] = [];
    for (let step = 0; step < 200; step++) drifts.push(anchorDrift(sim.scrollTo(sim.scrollTop - 90)));
    expect(drifts.filter((drift) => drift !== null && drift !== 0)).toEqual([]);
    expect(drifts.filter((drift) => drift === 0).length).toBeGreaterThan(150);
  });

  it('holds the anchor through random jumps', () => {
    const sim = simulation(22, ratio);
    const random = seededRandom(22);
    sim.layout();
    const drifts: (number | null)[] = [];
    for (let jump = 0; jump < 40; jump++) drifts.push(anchorDrift(sim.scrollTo(random() * sim.maxScrollTop)));
    expect(drifts.filter((drift) => drift !== null && drift !== 0)).toEqual([]);
  });

  it('holds the anchor when older rows are prepended', () => {
    const keys = messageKeys(0, 1200);
    const sim = simulation(23, ratio, keys.slice(600));
    sim.layout();
    sim.scrollTo(8000);
    const result = sim.change(() => sim.core.setKeys(keys.slice(200)));
    expect(result.clamped).toBe(false);
    expect(anchorDrift(result)).toBe(0);
    expect(sim.viewportIsMeasured()).toBe(true);
  });

  it('holds the anchor when every measured size is forgotten', () => {
    const sim = simulation(24, ratio);
    sim.layout();
    sim.scrollTo(30_000);
    const result = sim.change(() => {
      for (const key of sim.core.measuredKeys()) sim.core.forget(key);
    });
    expect(anchorDrift(result)).toBe(0);
  });

  it('falls back to the next candidate when the anchor row is removed', () => {
    const sim = simulation(25, ratio);
    sim.layout();
    sim.scrollTo(20_000);
    const first = sim.layout().anchor!.key;
    const result = sim.change(() => sim.core.setKeys(sim.core.keys.filter((key) => key !== first)));
    expect(result.anchor?.key).not.toBe(first);
    expect(anchorDrift(result)).toBe(0);
  });

  it('keeps the anchor at its distance from the reference line when the viewport resizes', () => {
    const sim = simulation(26, ratio);
    sim.layout();
    sim.scrollTo(20_000);
    const lineBefore = sim.scrollTop + ratio * sim.viewportHeight;
    const shrunk = sim.resize(500);
    expect(anchorDrift(shrunk)).toBe(0);
    const grown = sim.resize(1100);
    expect(anchorDrift(grown)).toBe(0);
    // Sizes were settled before the resizes, so the line itself is back where it was.
    expect(sim.scrollTop + ratio * sim.viewportHeight).toBeCloseTo(lineBefore, 9);
    expect(sim.viewportIsMeasured()).toBe(true);
  });
});

describe('reference line position', () => {
  it('keeps the viewport top under top anchoring and the bottom under bottom anchoring on resize', () => {
    const top = simulation(27, 0);
    top.layout();
    top.scrollTo(20_000);
    const scrollTop = top.scrollTop;
    top.resize(400);
    expect(top.scrollTop).toBe(scrollTop);

    const bottom = simulation(27, 1);
    bottom.layout();
    bottom.scrollTo(20_000);
    const scrollBottom = bottom.scrollTop + bottom.viewportHeight;
    bottom.resize(400);
    expect(bottom.scrollTop + bottom.viewportHeight).toBe(scrollBottom);
  });

  it('does not compensate when the window is replaced', () => {
    const sim = simulation(28, 0.5);
    sim.layout();
    sim.scrollTo(20_000);
    const scrollTop = sim.scrollTop;
    const result = sim.change(() => sim.core.setKeys(messageKeys(5000, 6500)));
    expect(result.anchor).toBeNull();
    expect(sim.scrollTop).toBe(scrollTop);
  });
});
