/**
 * Tests for the navigation stack's state machine. The reducer is
 * exported precisely so the push / pop semantics can be checked without
 * mounting a component.
 */

import { describe, expect, it } from 'vitest';

import {
  initialNavigationState,
  navigationStackReducer,
  type NavigationStackState,
  type NavigationView,
} from '../use-navigation-stack.js';

const root: NavigationView = { id: 'root', title: 'Root' };
const detail: NavigationView = { id: 'detail', title: 'Detail' };
const nested: NavigationView = { id: 'nested', title: 'Nested' };

function stateOf(...views: NavigationView[]): NavigationStackState {
  return initialNavigationState(views[0] ?? root, views.slice(1));
}

/** Business ids, in stack order. */
const ids = (state: NavigationStackState): string[] => state.entries.map((entry) => entry.view.id);
/** Entry keys, in stack order. */
const keys = (state: NavigationStackState): string[] => state.entries.map((entry) => entry.key);

describe('initialNavigationState', () => {
  it('gives the root and every deep-linked view its own key', () => {
    const state = stateOf(root, detail, nested);
    expect(ids(state)).toEqual(['root', 'detail', 'nested']);
    expect(new Set(keys(state)).size).toBe(3);
  });

  it('leaves the counter past the keys it handed out', () => {
    // Otherwise the first push would collide with a deep-linked entry.
    const state = stateOf(root, detail);
    expect(state.nextKey).toBe(2);
    expect(keys(navigationStackReducer(state, { type: 'PUSH', view: nested }))).toEqual(['0', '1', '2']);
  });
});

describe('navigationStackReducer', () => {
  describe('PUSH', () => {
    it('appends the view and records the direction', () => {
      const next = navigationStackReducer(stateOf(root), { type: 'PUSH', view: detail });
      expect(ids(next)).toEqual(['root', 'detail']);
      expect(next.direction).toBe('push');
    });

    it('does not mutate the previous stack', () => {
      const prev = stateOf(root);
      navigationStackReducer(prev, { type: 'PUSH', view: detail });
      expect(prev.entries).toHaveLength(1);
    });

    it('gives the same view two entries when it is pushed twice', () => {
      // The stack is a history, not a set — a tree can legitimately revisit a
      // node deeper down. Both occupancies are real, and they are told apart
      // by their key rather than by the view's id, which is what lets the
      // renderer key on them without collapsing them into one element.
      let state = stateOf(root);
      state = navigationStackReducer(state, { type: 'PUSH', view: detail });
      state = navigationStackReducer(state, { type: 'PUSH', view: detail });

      expect(ids(state)).toEqual(['root', 'detail', 'detail']);
      expect(new Set(keys(state)).size).toBe(3);
    });

    it('never reuses a key, even after the entry holding it has been popped', () => {
      // A popped entry can still be animating out when the next push lands.
      // Reusing its key would hand the new entry the old one's identity — its
      // React element, its remembered focus, its place in the hidden set.
      let state = stateOf(root);
      state = navigationStackReducer(state, { type: 'PUSH', view: detail });
      const firstKey = keys(state).at(-1);
      state = navigationStackReducer(state, { type: 'POP' });
      state = navigationStackReducer(state, { type: 'PUSH', view: detail });

      expect(keys(state).at(-1)).not.toBe(firstKey);
    });
  });

  describe('POP', () => {
    it('removes the top view and flips the direction', () => {
      const next = navigationStackReducer(stateOf(root, detail), { type: 'POP' });
      expect(ids(next)).toEqual(['root']);
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
      expect(ids(state)).toEqual(['root', 'detail']);
      state = navigationStackReducer(state, { type: 'POP' });
      expect(ids(state)).toEqual(['root']);
    });

    it('keeps the surviving entries on their own keys', () => {
      // A pop must not renumber what is left, or every remaining view would
      // look like a different one to the renderer and remount.
      const before = stateOf(root, detail, nested);
      const after = navigationStackReducer(before, { type: 'POP' });
      expect(keys(after)).toEqual(keys(before).slice(0, -1));
    });
  });

  describe('POP_TO_ROOT', () => {
    it('collapses to the first view', () => {
      const next = navigationStackReducer(stateOf(root, detail, nested), { type: 'POP_TO_ROOT' });
      expect(ids(next)).toEqual(['root']);
      expect(next.direction).toBe('pop');
    });

    it('is a no-op when already at the root', () => {
      const prev = stateOf(root);
      expect(navigationStackReducer(prev, { type: 'POP_TO_ROOT' })).toBe(prev);
    });

    it('keeps whichever view is at the bottom, not one named "root"', () => {
      const next = navigationStackReducer(stateOf(detail, nested), { type: 'POP_TO_ROOT' });
      expect(ids(next)).toEqual(['detail']);
    });
  });

  describe('push / pop round trip', () => {
    it('returns to the starting stack', () => {
      let state = stateOf(root);
      state = navigationStackReducer(state, { type: 'PUSH', view: detail });
      state = navigationStackReducer(state, { type: 'PUSH', view: nested });
      state = navigationStackReducer(state, { type: 'POP' });
      state = navigationStackReducer(state, { type: 'POP' });

      expect(ids(state)).toEqual(['root']);
      expect(state.direction).toBe('pop');
    });

    it('preserves the view payload across a round trip', () => {
      const withData: NavigationView = { id: 'x', title: 'X', data: { hello: 'world' } };
      const pushed = navigationStackReducer(stateOf(root), { type: 'PUSH', view: withData });
      expect(pushed.entries[1]?.view.data).toEqual({ hello: 'world' });
    });
  });
});
