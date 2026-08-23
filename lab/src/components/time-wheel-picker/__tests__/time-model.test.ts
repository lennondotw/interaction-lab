import { describe, expect, it } from 'vitest';

import {
  displayHour,
  formatTime,
  fromWheelIndices,
  hourItems,
  meridiemItems,
  meridiemOf,
  minuteItems,
  timeParts,
  toWheelIndices,
} from '../time-model.js';

describe('item lists', () => {
  it('runs the 12-hour wheel 1 to 12, unpadded, as system pickers do', () => {
    expect(hourItems(12)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);
  });

  it('runs the 24-hour wheel 00 to 23, padded, so the hour is always two digits', () => {
    const items = hourItems(24);
    expect(items).toHaveLength(24);
    expect(items[0]).toBe('00');
    expect(items[9]).toBe('09');
    expect(items[23]).toBe('23');
  });

  it('pads minutes and gives sixty of them', () => {
    const items = minuteItems();
    expect(items).toHaveLength(60);
    expect(items[0]).toBe('00');
    expect(items[5]).toBe('05');
    expect(items[59]).toBe('59');
  });

  it('has two meridiem items, which is why that column loops through repeats', () => {
    expect(meridiemItems()).toEqual(['AM', 'PM']);
  });
});

describe('displayHour', () => {
  it('shows midnight and noon as 12, not 0', () => {
    expect(displayHour(0)).toBe(12);
    expect(displayHour(12)).toBe(12);
    expect(displayHour(1)).toBe(1);
    expect(displayHour(13)).toBe(1);
    expect(displayHour(23)).toBe(11);
  });
});

describe('meridiemOf', () => {
  it('splits at noon, with noon itself in the afternoon', () => {
    expect(meridiemOf(0)).toBe(0);
    expect(meridiemOf(11)).toBe(0);
    expect(meridiemOf(12)).toBe(1);
    expect(meridiemOf(23)).toBe(1);
  });
});

describe('the round trip', () => {
  it('preserves every hour of the day in both formats', () => {
    for (const format of [12, 24] as const) {
      for (let hour = 0; hour < 24; hour++) {
        for (const minute of [0, 5, 30, 59]) {
          const value = { hour, minute };
          expect(fromWheelIndices(toWheelIndices(value, format), format), `${format}h ${hour}:${minute}`).toEqual(
            value
          );
        }
      }
    }
  });

  it('keeps 12 AM and 12 PM apart, which is the case a displayed-hour model loses', () => {
    expect(fromWheelIndices({ hour: 11, minute: 0, meridiem: 0 }, 12)).toEqual({ hour: 0, minute: 0 });
    expect(fromWheelIndices({ hour: 11, minute: 0, meridiem: 1 }, 12)).toEqual({ hour: 12, minute: 0 });
  });

  it('does not let 1 PM become hour 25 or noon become hour 24', () => {
    expect(fromWheelIndices({ hour: 0, minute: 0, meridiem: 1 }, 12)).toEqual({ hour: 13, minute: 0 });
    expect(fromWheelIndices({ hour: 10, minute: 0, meridiem: 1 }, 12)).toEqual({ hour: 23, minute: 0 });
  });

  it('leaves the meridiem index alone at 24-hour, where there is no such column', () => {
    expect(fromWheelIndices({ hour: 0, minute: 0, meridiem: 1 }, 24)).toEqual({ hour: 0, minute: 0 });
  });
});

describe('timeParts', () => {
  it('leaves the 12-hour hour unpadded, so a caller has to reserve its width', () => {
    expect(timeParts({ hour: 9, minute: 41 }, 12)).toEqual({ hour: '9', minute: '41', meridiem: 'AM' });
    expect(timeParts({ hour: 22, minute: 5 }, 12)).toEqual({ hour: '10', minute: '05', meridiem: 'PM' });
    expect(timeParts({ hour: 0, minute: 0 }, 12)).toEqual({ hour: '12', minute: '00', meridiem: 'AM' });
  });

  it('pads the 24-hour hour and has no meridiem at all', () => {
    expect(timeParts({ hour: 9, minute: 41 }, 24)).toEqual({ hour: '09', minute: '41', meridiem: null });
    expect(timeParts({ hour: 23, minute: 59 }, 24)).toEqual({ hour: '23', minute: '59', meridiem: null });
  });

  it('never gives an hour wider than the two characters a caller reserves', () => {
    for (const format of [12, 24] as const) {
      for (let hour = 0; hour < 24; hour++) {
        const { hour: shown, minute } = timeParts({ hour, minute: 7 }, format);
        expect(shown.length, `${format}h hour ${hour}`).toBeLessThanOrEqual(2);
        expect(minute).toHaveLength(2);
      }
    }
  });
});

describe('formatTime', () => {
  it('is the join of the parts, so a caller laying them out cannot drift from it', () => {
    for (const format of [12, 24] as const) {
      for (let hour = 0; hour < 24; hour++) {
        const value = { hour, minute: 8 };
        const { hour: h, minute: m, meridiem } = timeParts(value, format);
        const joined = meridiem === null ? `${h}:${m}` : `${h}:${m} ${meridiem}`;
        expect(formatTime(value, format), `${format}h ${hour}`).toBe(joined);
      }
    }
  });

  it('reads back what the wheels show', () => {
    expect(formatTime({ hour: 0, minute: 5 }, 12)).toBe('12:05 AM');
    expect(formatTime({ hour: 12, minute: 0 }, 12)).toBe('12:00 PM');
    expect(formatTime({ hour: 13, minute: 45 }, 12)).toBe('1:45 PM');
    expect(formatTime({ hour: 0, minute: 5 }, 24)).toBe('00:05');
    expect(formatTime({ hour: 23, minute: 59 }, 24)).toBe('23:59');
  });
});
