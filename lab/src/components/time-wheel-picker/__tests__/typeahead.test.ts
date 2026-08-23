import { describe, expect, it } from 'vitest';

import { hourItems, minuteItems } from '../time-model.js';
import { numericTypeahead, prefixTypeahead, type Typeahead } from '../typeahead.js';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** The list the `<select>` reference was measured against: two `m` words after the days. */
const MEASURED = [...WEEKDAYS, 'March', 'May'];

interface Typed {
  /** Label selected after each keystroke, or `-` where the wheel did not move. */
  trail: string[];
  /** Label selected at the end. */
  landed: string;
  settledAt: number[];
}

/**
 * Types `keys` into one column and reports what it selected, the way a person would
 * see it. Mirrors what `useWheel` does with a step: apply the index, carry the buffer.
 */
const type = (strategy: Typeahead, items: readonly string[], keys: string, from = 0): Typed => {
  let buffer = '';
  let index = from;
  const trail: string[] = [];
  const settledAt: number[] = [];

  // `charAt` rather than iterating the string, which would decompose it into code
  // points; a typed key is always one UTF-16 unit, so there is nothing to decompose.
  for (let at = 0; at < keys.length; at++) {
    const step = strategy.step({ buffer, key: keys.charAt(at), items, index });
    if (step === null) {
      trail.push('(ignored)');
      continue;
    }
    buffer = step.buffer;
    if (step.index !== null) index = step.index;
    trail.push(step.index === null ? '-' : (items[step.index] ?? '?'));
    if (step.settled) settledAt.push(at);
  }

  return { trail, landed: items[index] ?? '?', settledAt };
};

describe('prefixTypeahead', () => {
  it('cycles through the items sharing a first letter, and wraps', () => {
    // Measured in Chrome: t, t, t walks Tuesday, Thursday, Tuesday.
    expect(type(prefixTypeahead, MEASURED, 'ttt').trail).toEqual(['Tuesday', 'Thursday', 'Tuesday']);
    expect(type(prefixTypeahead, MEASURED, 'sss').trail).toEqual(['Saturday', 'Sunday', 'Saturday']);
  });

  it('matches a multi-character prefix rather than continuing to cycle', () => {
    // Each of these was measured against a real <select>.
    expect(type(prefixTypeahead, MEASURED, 'th').landed).toBe('Thursday');
    expect(type(prefixTypeahead, MEASURED, 'mo').landed).toBe('Monday');
    expect(type(prefixTypeahead, MEASURED, 'su').landed).toBe('Sunday');
    expect(type(prefixTypeahead, MEASURED, 'thu').landed).toBe('Thursday');
    expect(type(prefixTypeahead, MEASURED, 'may').landed).toBe('May');
  });

  it('is case-insensitive', () => {
    expect(type(prefixTypeahead, MEASURED, 'TH').landed).toBe('Thursday');
    expect(type(prefixTypeahead, WEEKDAYS, 'Fr').landed).toBe('Friday');
  });

  it('ignores a key that matches nothing, and does not let it poison the buffer', () => {
    expect(type(prefixTypeahead, MEASURED, 'z').landed).toBe('Monday');
    // The `z` is dropped rather than appended, so `mo` still resolves afterwards.
    expect(type(prefixTypeahead, MEASURED, 'mzo').landed).toBe('Monday');
  });

  it('leaves non-character keys to the caller', () => {
    expect(prefixTypeahead.step({ buffer: '', key: 'ArrowUp', items: WEEKDAYS, index: 0 })).toBeNull();
    expect(prefixTypeahead.step({ buffer: '', key: 'Enter', items: WEEKDAYS, index: 0 })).toBeNull();
  });

  it('settles once a prefix has identified exactly one item and consumed all of it', () => {
    expect(type(prefixTypeahead, MEASURED, 'wednesday').settledAt).toEqual([8]);
    // Still cycling, so never settled however many times the key is pressed.
    expect(type(prefixTypeahead, MEASURED, 'ttt').settledAt).toEqual([]);
  });

  /**
   * The one case where the two modes want different things, and every expectation
   * here was measured against a real `<select>` on the same list.
   */
  describe('a list holding both a T word and a TT word', () => {
    // Ordered so cycling and prefix matching disagree on the second `t`: cycling
    // advances to Thursday, a `tt` prefix would jump to TTY.
    const AMBIGUOUS = ['Alpha', 'Tuesday', 'Thursday', 'TTY', 'TTX'];

    it('cycles rather than treating the repeat as a prefix', () => {
      expect(type(prefixTypeahead, AMBIGUOUS, 'tt').trail).toEqual(['Tuesday', 'Thursday']);
      expect(type(prefixTypeahead, AMBIGUOUS, 'tttt').trail).toEqual(['Tuesday', 'Thursday', 'TTY', 'TTX']);
      // And wraps back round rather than stopping at the last match.
      expect(type(prefixTypeahead, AMBIGUOUS, 'ttttt').landed).toBe('Tuesday');
    });

    it('reaches the TT word once a third character breaks the repeat', () => {
      // So the item is not stranded — what is lost is only the ability to stop at `tt`.
      expect(type(prefixTypeahead, AMBIGUOUS, 'tty').landed).toBe('TTY');
      expect(type(prefixTypeahead, AMBIGUOUS, 'ttx').landed).toBe('TTX');
    });

    it('stays put when a repeat appears later in the buffer and matches nothing', () => {
      expect(type(prefixTypeahead, AMBIGUOUS, 'thh').trail).toEqual(['Tuesday', 'Thursday', '-']);
      expect(type(prefixTypeahead, AMBIGUOUS, 'thh').landed).toBe('Thursday');
    });

    it('settles on the repeat only when one item is left to reach', () => {
      // Cycling is never settled, however many times the key is pressed.
      expect(type(prefixTypeahead, AMBIGUOUS, 'tttt').settledAt).toEqual([]);
      // `tty` identifies exactly one item and consumes all of it.
      expect(type(prefixTypeahead, AMBIGUOUS, 'tty').settledAt).toEqual([2]);
    });

    it('holds still on a repeat when the TT word is the only match', () => {
      const only = ['Alpha', 'TTY', 'Beta'];
      expect(type(prefixTypeahead, only, 'ttt').trail).toEqual(['TTY', 'TTY', 'TTY']);
    });
  });

  it('needs a clock, because a prefix buffer has no width to limit it', () => {
    // Measured: alive at 800ms, gone by 1000ms.
    expect(prefixTypeahead.idleTimeout).toBe(1000);
  });
});

describe('numericTypeahead', () => {
  const MINUTES = minuteItems();
  const HOURS_12 = hourItems(12);
  const HOURS_24 = hourItems(24);

  it('accumulates digits into a value rather than matching a label prefix', () => {
    // The reason a numeric wheel cannot use prefix matching: on `00`-`59`, a prefix
    // `1` finds `10`, but the person typing meant one.
    expect(type(numericTypeahead, MINUTES, '1').landed).toBe('01');
    expect(type(prefixTypeahead, MINUTES, '1').landed).toBe('10');
    expect(type(numericTypeahead, MINUTES, '15').landed).toBe('15');
  });

  it('holds a leading zero that is not itself a label', () => {
    // A twelve-hour wheel has no `0`, but `09` is on its way.
    const typed = type(numericTypeahead, HOURS_12, '09');
    expect(typed.trail).toEqual(['-', '9']);
    expect(typed.landed).toBe('9');
  });

  it('starts over from the newest digit when the accumulation is a dead end', () => {
    // 15 is not an hour on a twelve-hour wheel, so the 5 begins again.
    expect(type(numericTypeahead, HOURS_12, '15').landed).toBe('5');
    // 65 is not a minute, and 6 could not be extended anyway.
    expect(type(numericTypeahead, MINUTES, '65').trail).toEqual(['06', '05']);
  });

  it('settles on width as well as on value, which is what makes 0141 read as 01:41', () => {
    // The value 1 is extendable on a twelve-hour wheel — 10, 11 and 12 exist — so
    // without the width test `01` would never settle, the buffer would stay open and
    // the next digit would be swallowed as a third hour digit.
    const typed = type(numericTypeahead, HOURS_12, '01');
    expect(typed.landed).toBe('1');
    expect(typed.settledAt).toEqual([1]);
  });

  it('settles as soon as no digit could extend the value', () => {
    // 9 on a twelve-hour wheel: nothing is 90-99, so the segment is done at once.
    expect(type(numericTypeahead, HOURS_12, '9').settledAt).toEqual([0]);
    // 6 on a minute wheel: nothing is 60-69.
    expect(type(numericTypeahead, MINUTES, '6').settledAt).toEqual([0]);
    // 1 on a twelve-hour wheel is not done — 10, 11 and 12 are still reachable.
    expect(type(numericTypeahead, HOURS_12, '1').settledAt).toEqual([]);
    // 2 on a twenty-four-hour wheel is not done either — 20 to 23 exist.
    expect(type(numericTypeahead, HOURS_24, '2').settledAt).toEqual([]);
  });

  it('reproduces the native segment cases that were measured', () => {
    // Chrome's 24-hour hour segment: 1 then 5 is fifteen, 0 then 9 is nine.
    expect(type(numericTypeahead, HOURS_24, '15').landed).toBe('15');
    expect(type(numericTypeahead, HOURS_24, '09').landed).toBe('09');
    // 9 cannot be extended, so it finishes and the next digit belongs to the minutes.
    expect(type(numericTypeahead, HOURS_24, '9').settledAt).toEqual([0]);
    // Minutes: 5 then 9 accumulates.
    expect(type(numericTypeahead, MINUTES, '59').landed).toBe('59');
  });

  it('ignores everything that is not a digit', () => {
    expect(numericTypeahead.step({ buffer: '', key: 'a', items: MINUTES, index: 0 })).toBeNull();
    expect(numericTypeahead.step({ buffer: '', key: 'ArrowDown', items: MINUTES, index: 0 })).toBeNull();
    expect(numericTypeahead.step({ buffer: '', key: '-', items: MINUTES, index: 0 })).toBeNull();
  });

  it('needs no clock, because the width of the value ends the buffer', () => {
    expect(numericTypeahead.idleTimeout).toBeNull();
  });

  it('makes every digit a no-op on labels that are not numbers', () => {
    const step = numericTypeahead.step({ buffer: '', key: '5', items: ['AM', 'PM'], index: 0 });
    expect(step?.index).toBeNull();
  });
});

/**
 * The whole point of the split, as one assertion each: a time picker uses the numeric
 * strategy for its digit columns and the generic one for its meridiem column, so
 * "time" is not a mode — it is two columns overriding a default.
 */
describe('the two strategies together', () => {
  it('spells a time across columns, digit columns numeric and the meridiem generic', () => {
    const hours = hourItems(12);
    const minutes = minuteItems();

    // `0941p`: 09 settles the hour, 41 settles the minute, p picks the meridiem.
    const hour = type(numericTypeahead, hours, '09');
    expect(hour.landed).toBe('9');
    expect(hour.settledAt).toEqual([1]);

    const minute = type(numericTypeahead, minutes, '41');
    expect(minute.landed).toBe('41');
    expect(minute.settledAt).toEqual([1]);

    expect(type(prefixTypeahead, ['AM', 'PM'], 'p').landed).toBe('PM');
    expect(type(prefixTypeahead, ['AM', 'PM'], 'a').landed).toBe('AM');
  });

  it('spells 941 as well, because the unextendable 9 finishes the hour on its own', () => {
    expect(type(numericTypeahead, hourItems(12), '9').settledAt).toEqual([0]);
    expect(type(numericTypeahead, minuteItems(), '41').landed).toBe('41');
  });
});
