import { afterEach, describe, expect, it, vi } from 'vitest';

import { statusOf, TraceLog } from '../rect-field/trace-log.js';

afterEach(() => vi.restoreAllMocks());

describe('trace history for variable-width scopes', () => {
  it('keeps high-rate visible history without letting overscan peaks affect statistics', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const log = new TraceLog();
    for (let i = 0; i < 1440; i++) {
      now = (i * 1000) / 120;
      log.push(now < 4000 ? 99 : 0.6, 10);
    }
    now = 12000;
    expect(log.since(4000)).toHaveLength(960);
    const stats = log.read();
    expect(stats.windowMs).toBe(8000);
    expect(stats.total).toBe(1440);
    expect(stats.samples).toHaveLength(960);
    expect(stats.peakMs).toBe(0.6);
    expect(stats.rate).toBeCloseTo(120);
    expect(log.since(1000)[0]!.at).toBe(1000);
  });

  it('remembers an idle producer after its visible and overscan history expires', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const log = new TraceLog();
    log.push(0.6, 10);
    log.since(-1000);
    now = 4000;
    expect(log.since(3000)).toEqual([]);
    const stats = log.read();
    expect(stats.samples).toEqual([]);
    expect(stats.sinceLast).toBe(4000);
    expect(statusOf(stats, false)).toBe('idle');
    log.clear();
    expect(statusOf(log.read(), false)).toBe('never');
  });
});
