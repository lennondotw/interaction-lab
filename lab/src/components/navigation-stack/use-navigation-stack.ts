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

export interface NavigationStackState {
  stack: NavigationView[];
  /** Direction of the last navigation — drives the transition. */
  direction: NavigationDirection;
}

export interface NavigationStackActions {
  push: (view: NavigationView) => void;
  pop: () => void;
  popToRoot: () => void;
}

export interface NavigationStackResult extends NavigationStackActions {
  stack: NavigationView[];
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
 */
export function navigationStackReducer(
  state: NavigationStackState,
  action: NavigationStackAction
): NavigationStackState {
  switch (action.type) {
    case 'PUSH':
      return { stack: [...state.stack, action.view], direction: 'push' };
    case 'POP':
      if (state.stack.length <= 1) return state;
      return { stack: state.stack.slice(0, -1), direction: 'pop' };
    case 'POP_TO_ROOT':
      if (state.stack.length <= 1) return state;
      return { stack: state.stack.slice(0, 1), direction: 'pop' };
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

  const [state, dispatch] = useReducer(navigationStackReducer, {
    stack: [rootView, ...initialViews],
    direction: 'push',
  });

  const push = useCallback((view: NavigationView) => dispatch({ type: 'PUSH', view }), []);
  const pop = useCallback(() => dispatch({ type: 'POP' }), []);
  const popToRoot = useCallback(() => dispatch({ type: 'POP_TO_ROOT' }), []);

  const canGoBack = state.stack.length > 1;

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
      stack: state.stack,
      currentView: state.stack[state.stack.length - 1] ?? null,
      depth: state.stack.length,
      canGoBack,
      direction: state.direction,
      push,
      pop,
      popToRoot,
    }),
    [state, canGoBack, push, pop, popToRoot]
  );
}
