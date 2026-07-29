/**
 * Tests for the navigation stack's state machine. The reducer is
 * exported precisely so the push / pop semantics can be checked without
 * mounting a component.
 */

import { describe, expect, it } from 'vitest';
import { navigationStackReducer, type NavigationStackState, type NavigationView } from '../use-navigation-stack.js';

const root: NavigationView = { id: 'root', title: 'Root' };
const detail: NavigationView = { id: 'detail', title: 'Detail' };
const nested: NavigationView = { id: 'nested', title: 'Nested' };

function stateOf(...stack: NavigationView[]): NavigationStackState {
  return { stack, direction: 'push' };
}

describe('navigationStackReducer', () => {
  describe('PUSH', () => {
    it('appends the view and records the direction', () => {
      const next = navigationStackReducer(stateOf(root), { type: 'PUSH', view: detail });
      expect(next.stack.map((v) => v.id)).toEqual(['root', 'detail']);
      expect(next.direction).toBe('push');
    });

    it('does not mutate the previous stack', () => {
      const prev = stateOf(root);
      navigationStackReducer(prev, { type: 'PUSH', view: detail });
      expect(prev.stack).toHaveLength(1);
    });

    it('allows the same view to be pushed twice', () => {
      // The stack is a history, not a set — a tree can legitimately
      // revisit a node deeper down.
      let state = stateOf(root);
      state = navigationStackReducer(state, { type: 'PUSH', view: detail });
      state = navigationStackReducer(state, { type: 'PUSH', view: detail });
      expect(state.stack).toHaveLength(3);
    });
  });

  describe('POP', () => {
    it('removes the top view and flips the direction', () => {
      const next = navigationStackReducer(stateOf(root, detail), { type: 'POP' });
      expect(next.stack.map((v) => v.id)).toEqual(['root']);
      expect(next.direction).toBe('pop');
    });

    it('is a no-op at the root, returning the identical state object', () => {
      // Identity matters: a fresh object would re-render and could flip
      // `direction`, animating a transition that never happened.
      const prev = stateOf(root);
      expect(navigationStackReducer(prev, { type: 'POP' })).toBe(prev);
    });

    it('unwinds one level at a time', () => {
      let state = stateOf(root, detail, nested);
      state = navigationStackReducer(state, { type: 'POP' });
      expect(state.stack.map((v) => v.id)).toEqual(['root', 'detail']);
      state = navigationStackReducer(state, { type: 'POP' });
      expect(state.stack.map((v) => v.id)).toEqual(['root']);
    });
  });

  describe('POP_TO_ROOT', () => {
    it('collapses to the first view', () => {
      const next = navigationStackReducer(stateOf(root, detail, nested), { type: 'POP_TO_ROOT' });
      expect(next.stack.map((v) => v.id)).toEqual(['root']);
      expect(next.direction).toBe('pop');
    });

    it('is a no-op when already at the root', () => {
      const prev = stateOf(root);
      expect(navigationStackReducer(prev, { type: 'POP_TO_ROOT' })).toBe(prev);
    });

    it('keeps whichever view is at the bottom, not one named "root"', () => {
      const next = navigationStackReducer(stateOf(detail, nested), { type: 'POP_TO_ROOT' });
      expect(next.stack.map((v) => v.id)).toEqual(['detail']);
    });
  });

  describe('push / pop round trip', () => {
    it('returns to the starting stack', () => {
      let state = stateOf(root);
      state = navigationStackReducer(state, { type: 'PUSH', view: detail });
      state = navigationStackReducer(state, { type: 'PUSH', view: nested });
      state = navigationStackReducer(state, { type: 'POP' });
      state = navigationStackReducer(state, { type: 'POP' });

      expect(state.stack.map((v) => v.id)).toEqual(['root']);
      expect(state.direction).toBe('pop');
    });

    it('preserves the view payload across a round trip', () => {
      const withData: NavigationView = { id: 'x', title: 'X', data: { hello: 'world' } };
      const pushed = navigationStackReducer(stateOf(root), { type: 'PUSH', view: withData });
      expect(pushed.stack[1]?.data).toEqual({ hello: 'world' });
    });
  });
});
