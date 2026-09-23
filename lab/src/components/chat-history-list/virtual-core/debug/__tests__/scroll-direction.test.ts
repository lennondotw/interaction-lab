/** The directional overscan's scroll direction and its hysteresis. */

import { describe, expect, it } from 'vitest';

import { directionHysteresis, nextScrollDirection, type ScrollDirection } from '../playground-model.js';

const walk = (start: ScrollDirection, offsets: readonly number[]) => {
  let state = start;
  const directions: string[] = [];
  for (const offset of offsets) {
    state = nextScrollDirection(state, offset);
    directions.push(state.direction);
  }
  return { state, directions };
};

describe('nextScrollDirection', () => {
  it('keeps the direction and tracks the furthest point while moving forward', () => {
    const { state, directions } = walk({ direction: 'down', extreme: 0 }, [10, 50, 120]);
    expect(directions).toEqual(['down', 'down', 'down']);
    expect(state.extreme).toBe(120);
  });

  it('ignores back-and-forth jitter within the hysteresis', () => {
    const jitter = [1000, 999, 1000, 999, 1001, 1000, 1001 - directionHysteresis];
    expect(walk({ direction: 'down', extreme: 1000 }, jitter).directions.every((d) => d === 'down')).toBe(true);
  });

  it('measures the way back from the furthest point, not from the last step', () => {
    // Twenty small steps back, each within the hysteresis, still add up to a flip.
    const back = Array.from({ length: 20 }, (_, index) => 1000 - (index + 1) * 2);
    const { directions } = walk({ direction: 'down', extreme: 1000 }, back);
    expect(directions.indexOf('up')).toBe(Math.floor(directionHysteresis / 2));
  });

  it('flips once the way back exceeds the hysteresis, in both directions', () => {
    const down = walk({ direction: 'down', extreme: 1000 }, [1000 - directionHysteresis - 1]);
    expect(down.state).toEqual({ direction: 'up', extreme: 1000 - directionHysteresis - 1 });
    const up = walk({ direction: 'up', extreme: 1000 }, [1000 + directionHysteresis + 1]);
    expect(up.state).toEqual({ direction: 'down', extreme: 1000 + directionHysteresis + 1 });
  });

  it('flips at exactly the hysteresis plus any distance, never at the hysteresis itself', () => {
    expect(nextScrollDirection({ direction: 'down', extreme: 500 }, 500 - directionHysteresis).direction).toBe('down');
    expect(nextScrollDirection({ direction: 'down', extreme: 500 }, 500 - directionHysteresis - 0.5).direction).toBe(
      'up'
    );
  });
});
