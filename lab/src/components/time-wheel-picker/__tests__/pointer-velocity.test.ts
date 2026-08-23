import { describe, expect, it } from 'vitest';

import { pushSample, trackVelocity, type PointerSample } from '../pointer-velocity.js';

/** A steady drag: one sample every `step` ms, moving `perStep` pixels each time. */
const drag = ({ count, step = 10, perStep = 5 }: { count: number; step?: number; perStep?: number }): PointerSample[] =>
  Array.from({ length: count }, (_unused, index) => ({ time: index * step, y: index * perStep }));

describe('trackVelocity', () => {
  it('reports the pixels per second of a steady drag', () => {
    const samples = drag({ count: 10, step: 10, perStep: 5 });
    expect(trackVelocity({ samples, now: 90 })).toBeCloseTo(500, 6);
  });

  it('is signed, so a drag in either direction throws the wheel the right way', () => {
    const samples = drag({ count: 10, step: 10, perStep: -5 });
    expect(trackVelocity({ samples, now: 90 })).toBeCloseTo(-500, 6);
  });

  it('reports nothing from a single sample', () => {
    expect(trackVelocity({ samples: [{ time: 0, y: 0 }], now: 0 })).toBe(0);
    expect(trackVelocity({ samples: [], now: 0 })).toBe(0);
  });

  it('reports nothing when the pointer paused before letting go', () => {
    const samples = drag({ count: 10, step: 10, perStep: 20 });
    // Same gesture, released 300ms after it stopped moving: a placement, not a throw.
    expect(trackVelocity({ samples, now: 390 })).toBe(0);
  });

  it('averages over the window rather than trusting the last pair', () => {
    // Nine samples of a slow drag, then one jittery final sample. Taking only the
    // last pair reads 5000px/s; the window keeps it near the gesture's real speed.
    const samples = [...drag({ count: 9, step: 10, perStep: 5 }), { time: 90, y: 90 }];
    const velocity = trackVelocity({ samples, now: 90 });
    expect(velocity).toBeLessThan(2000);
    expect(velocity).toBeGreaterThan(500);
  });

  it('measures a gesture shorter than one window against what it has', () => {
    const samples = drag({ count: 3, step: 10, perStep: 5 });
    expect(trackVelocity({ samples, now: 20 })).toBeCloseTo(500, 6);
  });
});

describe('pushSample', () => {
  it('keeps the history to the window, plus one sample either side of it', () => {
    const samples: PointerSample[] = [];
    for (let index = 0; index <= 40; index++) {
      pushSample(samples, { time: index * 10, y: index * 5 }, { window: 80 });
    }
    const last = samples.at(-1);
    const first = samples.at(0);
    expect(last?.time).toBe(400);
    expect(first).toBeDefined();
    expect(400 - (first?.time ?? 0)).toBeLessThanOrEqual(90);
    expect(400 - (first?.time ?? 0)).toBeGreaterThanOrEqual(80);
  });

  it('never drops below two samples, however long the pause', () => {
    const samples: PointerSample[] = [{ time: 0, y: 0 }];
    pushSample(samples, { time: 5000, y: 100 }, { window: 80 });
    expect(samples).toHaveLength(2);
  });
});
