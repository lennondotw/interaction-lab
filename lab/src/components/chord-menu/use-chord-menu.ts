'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';

import {
  chordMenuReducer,
  initialChordMenuState,
  resolveChordMenuAction,
  type ChordMenuLevel,
  type ChordMenuState,
} from './chord-menu-state.js';

/** How long an open level waits before dismissing itself. */
const OPEN_TIMEOUT_MS = 3000;

/** How long a result stays up. Shorter: there is nothing left to read but one line. */
const RESULT_TIMEOUT_MS = 1500;

export interface UseChordMenuOptions {
  /**
   * Whether the trigger listens at all. Defaults to `true`.
   *
   * `false` registers no key handler and leaves the menu closed, for a host that wants the menu
   * behind a runtime capability rather than behind a build flag.
   */
  enabled?: boolean;
}

export interface ChordMenuController {
  state: ChordMenuState;
  close: () => void;
  /** Pointer is over the menu — hold it open. */
  holdOpen: () => void;
  /** Pointer left — start the countdown over. */
  releaseHold: () => void;
}

/**
 * A chord menu: one modifier chord opens it, then single keys walk it.
 *
 * The state machine lives in `chord-menu-state.ts`; this is the part that cannot be a reducer —
 * the keyboard, the dismiss timer, and the hover hold.
 *
 * Two things worth knowing about how it treats the keyboard:
 *
 * - It only claims the keys the current level actually uses. The menu is an overlay, not a modal,
 *   so swallowing every keystroke while it happens to be open would break whatever the page binds.
 *   Which keys count differs level by level, so the decision is made per keystroke.
 * - The keys it does claim are taken properly, from a capture-phase listener. A bubble-phase
 *   listener on `window` runs *after* the page has already acted on Escape.
 */
export function useChordMenu(root: ChordMenuLevel, { enabled = true }: UseChordMenuOptions = {}): ChordMenuController {
  const [state, dispatch] = useReducer(chordMenuReducer, initialChordMenuState);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissDelayRef = useRef<number | null>(null);
  const isHoveredRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    clearTimer();
    dismissDelayRef.current = null;
    // A menu closed from the keyboard while the pointer was over it never gets a mouseleave, and a
    // hold left set would keep the next one open indefinitely.
    isHoveredRef.current = false;
    dispatch({ type: 'close' });
  }, [clearTimer]);

  /**
   * Arm the auto-dismiss, remembering how long this phase waits.
   *
   * Nothing is armed while the pointer is over the menu: reading a dozen rows takes longer than the
   * timeout, and having them vanish under the cursor is the opposite of helpful. The delay is still
   * recorded, so releasing the hold can start the same countdown afresh.
   */
  const scheduleDismiss = useCallback(
    (delayMs: number) => {
      clearTimer();
      dismissDelayRef.current = delayMs;

      if (isHoveredRef.current) return;

      timeoutRef.current = setTimeout(close, delayMs);
    },
    [clearTimer, close]
  );

  const holdOpen = useCallback(() => {
    isHoveredRef.current = true;
    clearTimer();
  }, [clearTimer]);

  const releaseHold = useCallback(() => {
    isHoveredRef.current = false;

    const delayMs = dismissDelayRef.current;

    if (delayMs == null) return;

    clearTimer();
    timeoutRef.current = setTimeout(close, delayMs);
  }, [clearTimer, close]);

  const showResult = useCallback(
    (message: string) => {
      dispatch({ type: 'result', message });
      scheduleDismiss(RESULT_TIMEOUT_MS);
    },
    [scheduleDismiss]
  );

  const openRoot = useCallback(() => {
    dispatch({ type: 'open', root });
    scheduleDismiss(OPEN_TIMEOUT_MS);
  }, [root, scheduleDismiss]);

  useEffect(() => {
    if (!enabled) return;

    const MODIFIER_KEYS = new Set(['Meta', 'Control', 'Alt', 'Shift']);

    /**
     * Claim a keystroke the menu acted on.
     *
     * `stopPropagation` as well as `preventDefault`, from the capture phase, so a key the menu
     * handles never reaches the page's own binding for it — Escape especially, which plenty of
     * surfaces treat as "close me".
     */
    const claim = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    function handleKeyDown(event: KeyboardEvent) {
      if (MODIFIER_KEYS.has(event.key)) return;

      const isChord = (event.metaKey || event.ctrlKey) && event.key === '.';
      const isEscape = event.key === 'Escape';

      if (state.phase === 'closed') {
        if (isChord) {
          claim(event);
          openRoot();
        }

        return;
      }

      if (state.phase === 'result') {
        if (isEscape || isChord) {
          claim(event);
          if (isChord) openRoot();
          else close();
        }

        return;
      }

      if (isChord) {
        claim(event);
        // From a nested level the chord goes back to the root; from the root it closes.
        if (state.stack.length > 1) openRoot();
        else close();

        return;
      }

      if (isEscape) {
        claim(event);
        dispatch({ type: 'back' });
        scheduleDismiss(OPEN_TIMEOUT_MS);

        return;
      }

      const action = resolveChordMenuAction(state, event.key);

      if (!action) return;

      claim(event);

      if (action.disabled) {
        showResult(`${action.label} (unavailable)`);

        return;
      }

      if (action.type === 'level') {
        dispatch({ type: 'push', level: action.level() });
        scheduleDismiss(OPEN_TIMEOUT_MS);

        return;
      }

      const settle = (message: string) => {
        if (action.after !== 'stay') {
          // An action with nothing to report closes rather than putting up an empty card for a
          // second and a half.
          if (message) showResult(message);
          else close();

          return;
        }

        // Dispatched even when there is nothing to report, so a press with nothing to say clears
        // the line the press before it left. The countdown restarts either way: a run of presses
        // should not have the level vanish part-way through.
        dispatch({ type: 'notice', message });
        scheduleDismiss(OPEN_TIMEOUT_MS);
      };

      const result = action.run();

      if (result instanceof Promise) {
        settle(`${action.label}…`);
        result.then(settle, (error: unknown) =>
          settle(`Failed: ${error instanceof Error ? error.message : String(error)}`)
        );

        return;
      }

      settle(result);
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [close, enabled, openRoot, scheduleDismiss, showResult, state]);

  useEffect(() => clearTimer, [clearTimer]);

  return { state, close, holdOpen, releaseHold };
}
