import { useCallback, useEffect, useMemo, useReducer } from 'react';

import type { NavigationPresentation } from './navigation-presentation.js';

export type NavigationDirection = 'push' | 'pop';

export interface NavigationView {
  /** Unique identifier for this view. */
  id: string;
  title: string;
  subtitle?: string;
  /**
   * How this view arrives and leaves.
   *
   * Travels with the view rather than being passed to `push`, because it
   * is needed again on the way out — a view that covered from the bottom
   * has to leave downwards, and by then the push that decided so is long
   * gone. On the root view it is only ever used for the transition
   * *back* to it, since the root never animates in.
   *
   * @default 'slide'
   */
  presentation?: NavigationPresentation;
  /** Arbitrary payload the renderer can read back off the view. */
  data?: unknown;
}

/**
 * One occupancy of the stack: a view, plus an identity for *this* time it is
 * on it.
 *
 * The stack is a history, not a set — a tree can legitimately revisit a node
 * deeper down, and `A → B → A` is an ordinary path. So `view.id` cannot be
 * what the renderer keys by: two occupancies of one view would collide on
 * React's `key`, on the sets tracking which views are parked or leaving, and
 * on the map remembering where focus sat in each. `key` is what they all use
 * instead, and it is never reused, so a view that is popped and pushed again
 * is a genuinely new entry rather than the old one reappearing.
 */
export interface NavigationEntry {
  /** Identity of this occupancy. Not an index, and never reused. */
  key: string;
  view: NavigationView;
}

export interface NavigationStackState {
  entries: NavigationEntry[];
  /** Direction of the last navigation — drives the transition. */
  direction: NavigationDirection;
  /** Monotonic source of entry keys. Only ever counts up. */
  nextKey: number;
}

/** The stack a fresh `useNavigationStack` starts on. Exported for tests. */
export function initialNavigationState(
  rootView: NavigationView,
  initialViews: readonly NavigationView[] = []
): NavigationStackState {
  const views = [rootView, ...initialViews];
  return {
    entries: views.map((view, i) => ({ key: String(i), view })),
    direction: 'push',
    nextKey: views.length,
  };
}

export interface NavigationStackActions {
  push: (view: NavigationView) => void;
  pop: () => void;
  popToRoot: () => void;
}

export interface NavigationStackResult extends NavigationStackActions {
  /** The views on the stack, root first — for reading titles and payloads. */
  stack: NavigationView[];
  /**
   * The same stack as addressable occupancies. Anything that keys, indexes or
   * remembers something *per view on screen* has to use these, not `stack`,
   * because the same view can be on the stack twice.
   */
  entries: NavigationEntry[];
  /** Top of the stack. */
  currentView: NavigationView | null;
  /** Stack depth; 1 means only the root view. */
  depth: number;
  canGoBack: boolean;
  direction: NavigationDirection;
}

export interface UseNavigationStackOptions {
  /** Views pushed on top of the root at initialisation, e.g. for a deep link. */
  initialViews?: NavigationView[];
  /**
   * Bind Escape to `pop`.
   * @default true
   */
  enableKeyboardNav?: boolean;
}

export type NavigationStackAction = { type: 'PUSH'; view: NavigationView } | { type: 'POP' } | { type: 'POP_TO_ROOT' };

/**
 * Pure state machine behind {@link useNavigationStack}. Exported so the
 * push / pop semantics can be tested without mounting anything.
 *
 * Popping at the root is a no-op that returns the same state object, so
 * it can't trigger a re-render or a spurious `direction` flip.
 *
 * `nextKey` only counts up, including across pops. Reusing a key would give
 * a new entry the identity of one that may still be animating out, which is
 * the collision the keys exist to prevent.
 */
export function navigationStackReducer(
  state: NavigationStackState,
  action: NavigationStackAction
): NavigationStackState {
  switch (action.type) {
    case 'PUSH':
      return {
        entries: [...state.entries, { key: String(state.nextKey), view: action.view }],
        direction: 'push',
        nextKey: state.nextKey + 1,
      };
    case 'POP':
      if (state.entries.length <= 1) return state;
      return { ...state, entries: state.entries.slice(0, -1), direction: 'pop' };
    case 'POP_TO_ROOT':
      if (state.entries.length <= 1) return state;
      return { ...state, entries: state.entries.slice(0, 1), direction: 'pop' };
  }
}

/**
 * Navigation stack state with push / pop and optional Escape-to-go-back.
 *
 * @example
 * ```tsx
 * const nav = useNavigationStack({ id: 'root', title: 'Home' })
 *
 * // Deep link straight to a detail view:
 * const nav = useNavigationStack(
 *   { id: 'root', title: 'Home' },
 *   { initialViews: [{ id: 'detail', title: 'Detail', data: item }] }
 * )
 * ```
 */
export function useNavigationStack(
  rootView: NavigationView,
  options?: UseNavigationStackOptions
): NavigationStackResult {
  const { initialViews = [], enableKeyboardNav = true } = options ?? {};

  // Lazy initialiser: the root view and any deep link are read once, at mount.
  const [state, dispatch] = useReducer(navigationStackReducer, undefined, () =>
    initialNavigationState(rootView, initialViews)
  );

  const push = useCallback((view: NavigationView) => dispatch({ type: 'PUSH', view }), []);
  const pop = useCallback(() => dispatch({ type: 'POP' }), []);
  const popToRoot = useCallback(() => dispatch({ type: 'POP_TO_ROOT' }), []);

  const canGoBack = state.entries.length > 1;

  useEffect(() => {
    if (!enableKeyboardNav || !canGoBack) return;

    const handleKeyDown = (event: KeyboardEvent): void => {
      // Respect anything that already claimed the key — a dialog or
      // combobox nested in a view should close before we pop.
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        pop();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enableKeyboardNav, canGoBack, pop]);

  return useMemo(
    () => ({
      // Derived from `entries` rather than stored beside it, so the two can
      // never disagree about what is on the stack.
      stack: state.entries.map((entry) => entry.view),
      entries: state.entries,
      currentView: state.entries[state.entries.length - 1]?.view ?? null,
      depth: state.entries.length,
      canGoBack,
      direction: state.direction,
      push,
      pop,
      popToRoot,
    }),
    [state, canGoBack, push, pop, popToRoot]
  );
}
