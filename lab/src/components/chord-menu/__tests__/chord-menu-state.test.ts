/**
 * Tests for the chord menu's state machine. The reducer is exported precisely so push / pop /
 * run semantics can be checked without mounting a component or faking a keyboard.
 */

import { describe, expect, it } from 'vitest';

import {
  chordMenuReducer,
  currentChordMenuLevel,
  initialChordMenuState,
  resolveChordMenuAction,
  type ChordMenuLevel,
  type ChordMenuState,
} from '../chord-menu-state.js';

const run = (label: string): ChordMenuLevel['actions'][number] => ({
  label,
  description: label,
  type: 'run',
  run: () => label,
});

const root: ChordMenuLevel = { title: 'Root', actions: [run('First'), run('Second')] };
const nested: ChordMenuLevel = { title: 'Nested', actions: [run('Deep')] };

const opened = (...stack: ChordMenuLevel[]): ChordMenuState => ({ phase: 'open', stack });

describe('chordMenuReducer', () => {
  it('opens onto the root level', () => {
    expect(chordMenuReducer(initialChordMenuState, { type: 'open', root })).toEqual(opened(root));
  });

  it('pushes a level onto the stack', () => {
    const state = chordMenuReducer(opened(root), { type: 'push', level: nested });

    expect(state).toEqual(opened(root, nested));
  });

  it('goes back one level at a time', () => {
    expect(chordMenuReducer(opened(root, nested), { type: 'back' })).toEqual(opened(root));
  });

  it('closes when going back from the root', () => {
    expect(chordMenuReducer(opened(root), { type: 'back' })).toEqual(initialChordMenuState);
  });

  it('reopens at the root rather than restoring the stack', () => {
    // Reopening from a nested level is how you get back to the top without pressing Escape twice.
    expect(chordMenuReducer(opened(root, nested), { type: 'open', root })).toEqual(opened(root));
  });

  it('replaces the level with a result', () => {
    expect(chordMenuReducer(opened(root), { type: 'result', message: 'done' })).toEqual({
      phase: 'result',
      message: 'done',
    });
  });

  it('keeps the level and its stack when reporting a notice', () => {
    const state = chordMenuReducer(opened(root, nested), { type: 'notice', message: 'stepped' });

    expect(state).toEqual({ phase: 'open', stack: [root, nested], notice: 'stepped' });
  });

  it('reports the last press rather than accumulating a log', () => {
    const first = chordMenuReducer(opened(root), { type: 'notice', message: 'one' });
    const second = chordMenuReducer(first, { type: 'notice', message: 'two' });

    expect(second).toEqual({ phase: 'open', stack: [root], notice: 'two' });
  });

  it('ignores a push or a notice while closed', () => {
    expect(chordMenuReducer(initialChordMenuState, { type: 'push', level: nested })).toBe(initialChordMenuState);
    expect(chordMenuReducer(initialChordMenuState, { type: 'notice', message: 'x' })).toBe(initialChordMenuState);
  });
});

describe('currentChordMenuLevel', () => {
  it('is the top of the stack', () => {
    expect(currentChordMenuLevel(opened(root, nested))).toBe(nested);
  });

  it('is nothing unless the menu is open', () => {
    expect(currentChordMenuLevel(initialChordMenuState)).toBeUndefined();
    expect(currentChordMenuLevel({ phase: 'result', message: 'done' })).toBeUndefined();
  });
});

describe('resolveChordMenuAction', () => {
  it('picks the action sitting at the key', () => {
    expect(resolveChordMenuAction(opened(root), '1')?.label).toBe('Second');
  });

  it('resolves against the level on top, not the root', () => {
    expect(resolveChordMenuAction(opened(root, nested), '0')?.label).toBe('Deep');
    expect(resolveChordMenuAction(opened(root, nested), '1')).toBeUndefined();
  });

  it('has nothing for a key this level does not use', () => {
    // Not an error: the menu is an overlay, so that key belongs to whatever is underneath it.
    expect(resolveChordMenuAction(opened(root), 'Z')).toBeUndefined();
    expect(resolveChordMenuAction(opened(root), '5')).toBeUndefined();
  });

  it('has nothing while the menu is closed', () => {
    expect(resolveChordMenuAction(initialChordMenuState, '0')).toBeUndefined();
  });
});
