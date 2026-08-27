/**
 * Tests for the key allocation. Pure functions, exported precisely so the assignment can be
 * checked without mounting anything.
 */

import { describe, expect, it } from 'vitest';

import { CHORD_KEYS, chordIndexForKey, chordKeyAt } from '../chord-keys.js';

describe('chordKeyAt', () => {
  it('hands out digits first, in order', () => {
    expect([chordKeyAt(0), chordKeyAt(1), chordKeyAt(2)]).toEqual(['0', '1', '2']);
    expect(chordKeyAt(9)).toBe('9');
  });

  it('carries on into letters once the digits run out', () => {
    expect(chordKeyAt(10)).toBe('A');
    expect(chordKeyAt(CHORD_KEYS.length - 1)).toBe('D');
  });

  it('has nothing past the end, rather than reusing a key already taken', () => {
    // Wrapping would make one action shadow another, which no amount of showing the keys fixes.
    expect(chordKeyAt(CHORD_KEYS.length)).toBeUndefined();
    expect(chordKeyAt(-1)).toBeUndefined();
  });
});

describe('chordIndexForKey', () => {
  it('resolves a key to the action sitting at it', () => {
    expect(chordIndexForKey('0', 3)).toBe(0);
    expect(chordIndexForKey('2', 3)).toBe(2);
  });

  it('accepts a letter key in either case', () => {
    expect(chordIndexForKey('a', 11)).toBe(10);
    expect(chordIndexForKey('A', 11)).toBe(10);
  });

  it('rejects a key past the end of this level', () => {
    // The key exists in the alphabet, but this level is not that long.
    expect(chordIndexForKey('9', 3)).toBe(-1);
  });

  it('rejects a key that is not in the alphabet at all', () => {
    expect(chordIndexForKey('Z', 14)).toBe(-1);
    expect(chordIndexForKey('Escape', 14)).toBe(-1);
    expect(chordIndexForKey('', 14)).toBe(-1);
  });
});
