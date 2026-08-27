/**
 * The chord menu's state machine, as a reducer.
 *
 * Split out from the hook so the navigation semantics — push, pop, run, dismiss — can be
 * checked without mounting a component or faking a keyboard.
 */

import { chordIndexForKey } from './chord-keys.js';

export interface ChordMenuLevel {
  title?: string;
  actions: ChordMenuAction[];
}

/** What happens to the menu once an action has run. */
export type ChordMenuAfter =
  /** Show the result and close. The default: one press was the whole interaction. */
  | 'exit'
  /**
   * Keep the level open, with the result as a notice.
   *
   * For an action where one press is not the whole interaction — stepping through more than two
   * states, say. Closing after each press would mean reopening and re-navigating between every
   * step. A two-state toggle does not need this.
   */
  | 'stay';

export type ChordMenuAction =
  | {
      label: string;
      description: string;
      disabled?: boolean;
      type: 'run';
      run: () => string | Promise<string>;
      after?: ChordMenuAfter;
    }
  | {
      label: string;
      description: string;
      disabled?: boolean;
      type: 'level';
      level: () => ChordMenuLevel;
    };

export type ChordMenuState =
  | { phase: 'closed' }
  /** `notice` is the result of a `stay` action, reported without replacing the level. */
  | { phase: 'open'; stack: ChordMenuLevel[]; notice?: string }
  | { phase: 'result'; message: string };

export type ChordMenuTransition =
  | { type: 'open'; root: ChordMenuLevel }
  | { type: 'close' }
  /** Escape: up one level, or closed if this is the root. */
  | { type: 'back' }
  | { type: 'push'; level: ChordMenuLevel }
  | { type: 'result'; message: string }
  | { type: 'notice'; message: string };

export const initialChordMenuState: ChordMenuState = { phase: 'closed' };

export function chordMenuReducer(state: ChordMenuState, transition: ChordMenuTransition): ChordMenuState {
  switch (transition.type) {
    case 'open':
      return { phase: 'open', stack: [transition.root] };

    case 'close':
      return initialChordMenuState;

    case 'back': {
      if (state.phase !== 'open') return initialChordMenuState;

      return state.stack.length > 1 ? { phase: 'open', stack: state.stack.slice(0, -1) } : initialChordMenuState;
    }

    case 'push': {
      if (state.phase !== 'open') return state;

      return { phase: 'open', stack: [...state.stack, transition.level] };
    }

    case 'result':
      return { phase: 'result', message: transition.message };

    case 'notice': {
      // Drops the previous notice rather than accumulating: it reports the last press, not a log.
      if (state.phase !== 'open') return state;

      return { phase: 'open', stack: state.stack, notice: transition.message };
    }
  }
}

/** The level a keystroke would act on, or `undefined` when the menu is not open. */
export function currentChordMenuLevel(state: ChordMenuState): ChordMenuLevel | undefined {
  return state.phase === 'open' ? state.stack[state.stack.length - 1] : undefined;
}

/**
 * The action a keystroke selects, or `undefined` for a key this level does not use.
 *
 * `undefined` is the common case and not an error: the menu is an overlay rather than a modal,
 * so a key it has no use for belongs to whatever is underneath.
 */
export function resolveChordMenuAction(state: ChordMenuState, key: string): ChordMenuAction | undefined {
  const level = currentChordMenuLevel(state);

  if (!level) return undefined;

  const index = chordIndexForKey(key, level.actions.length);

  return index < 0 ? undefined : level.actions[index];
}
