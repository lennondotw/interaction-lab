import { describe, expect, it } from 'vitest';

import { closeTabWidths } from '../tab-close-layout.js';
import { resolveTabWidths } from '../tab-target-layout.js';

const BASIS = 176;
const GAP = 4;
const ADD_WIDTH = 36;
const AVAILABLE = 606;

function naturalTargets(count: number) {
  const width = Math.min(BASIS, (AVAILABLE - ADD_WIDTH - count * GAP) / count);
  return Array.from({ length: count }, (_, index) => ({ id: String(index), width }));
}

function occupiedWidth(widths: readonly number[]) {
  return widths.reduce((sum, width) => sum + width, 0) + widths.length * GAP + ADD_WIDTH;
}

describe('tab target widths during a hover hold', () => {
  it('adds a compressed tab into free space after consecutive middle closes', () => {
    const initial = naturalTargets(8).map((target) => target.width);
    const closedOnce = closeTabWidths(initial, 3, GAP, BASIS);
    const closedTwice = closeTabWidths(closedOnce, 3, GAP, BASIS);
    const held = new Map(closedTwice.map((width, index) => [String(index), width]));
    expect(occupiedWidth(closedTwice)).toBeLessThan(AVAILABLE);

    const targets = naturalTargets(7);
    expect(targets[6]!.width).toBeGreaterThan(initial[0]!);
    const next = resolveTabWidths(targets, held);
    expect(next).toEqual(Array<number>(7).fill(67.25));
    expect(next[6]).toBeLessThan(BASIS);
    expect(occupiedWidth(next)).toBeLessThan(AVAILABLE);
  });

  it('keeps new tabs compressed as repeated additions fill all remaining space', () => {
    const held = new Map(naturalTargets(6).map((target) => [target.id, 67.25]));
    const next = resolveTabWidths(naturalTargets(8), held);
    expect(next).toEqual(Array<number>(8).fill(67.25));
    expect(occupiedWidth(next)).toBe(AVAILABLE);
  });

  it('compresses all existing and new tabs further when the held strip no longer fits', () => {
    const held = new Map(naturalTargets(8).map((target) => [target.id, target.width]));
    const next = resolveTabWidths(naturalTargets(9), held);
    expect(next.every((width) => width < 67.25)).toBe(true);
    expect(occupiedWidth(next)).toBeCloseTo(AVAILABLE, 10);
  });

  it('restores natural sizing when the hold is released', () => {
    const targets = naturalTargets(7);
    expect(resolveTabWidths(targets, null)).toEqual(targets.map((target) => target.width));
    expect(resolveTabWidths(targets, null)[6]).toBeGreaterThan(67.25);
  });

  it('allows a new tab at its base size during a natural-size hold', () => {
    expect(
      resolveTabWidths(
        naturalTargets(3),
        new Map([
          ['0', BASIS],
          ['1', BASIS],
        ])
      )
    ).toEqual([BASIS, BASIS, BASIS]);
  });

  it('uses natural sizing when adding after the final held tab was closed', () => {
    expect(resolveTabWidths(naturalTargets(1), new Map())).toEqual([BASIS]);
  });
});
