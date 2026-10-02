import { describe, expect, it } from 'vitest';

import { SampleHistory } from '../sample-history.js';

describe('scope history with one viewport of overscan', () => {
  it.each([60, 107, 144, 240])(
    'retains a full visible window at %sHz and reveals older samples after widening',
    (rate) => {
      const history = new SampleHistory<{ at: number; value: number }>();
      for (let i = 0; i <= rate * 10; i++) history.push({ at: (i * 1000) / rate, value: i });
      const visible = history.since(6000, 10000);
      expect(visible[0]!.at).toBe(6000);
      expect(visible.length).toBe(rate * 4 + 1);
      expect(history.size).toBe(rate * 8 + 1);
      const wider = history.since(3000, 10000);
      expect(wider[0]!.at).toBe(3000);
      expect(wider.length).toBe(rate * 7 + 1);
      expect(history.visibleMs).toBe(7000);
    }
  );

  it('expires old overscan by time while statistics exclude retained offscreen samples', () => {
    const history = new SampleHistory<{ at: number }>();
    for (let at = 0; at <= 10000; at += 1000) history.push({ at });
    history.since(6000, 10000);
    expect(history.size).toBe(9);
    expect(history.visible(11000).map((s) => s.at)).toEqual([7000, 8000, 9000, 10000]);
    history.since(10000, 14000);
    expect(history.size).toBe(5);
    expect(history.visible(14000)).toEqual([{ at: 10000 }]);
  });

  it('keeps real idle intervals empty and releases history when it ages out', () => {
    const history = new SampleHistory<{ at: number }>();
    history.push({ at: 0 });
    history.push({ at: 1000 });
    history.push({ at: 9000 });
    expect(history.since(5000, 10000)).toEqual([{ at: 9000 }]);
    expect(history.since(20000, 25000)).toEqual([]);
    expect(history.size).toBe(0);
  });
});
