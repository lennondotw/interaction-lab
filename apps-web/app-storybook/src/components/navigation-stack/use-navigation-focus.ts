import { useCallback, useLayoutEffect, useRef, type FocusEventHandler, type RefObject } from 'react';

/**
 * Attribute `NavigationContent` stamps on every view wrapper. Focus is
 * scoped by walking up to the nearest element carrying it, so the two
 * have to agree on the name.
 */
const VIEW_ID_SELECTOR = '[data-view-id]';

export interface NavigationFocusResult {
  /** Attach to the element that contains every view. */
  rootRef: RefObject<HTMLDivElement | null>;
  /** Attach to the same element, so focus inside any view is recorded. */
  onFocus: FocusEventHandler<HTMLElement>;
}

/**
 * Hands focus to whichever view is on top, the moment it gets there.
 *
 * The views that are *not* on top are made inert by `NavigationContent`,
 * which means the browser drops focus (to the body) as soon as a view is
 * covered or starts sliding out. Without this hook the user is left with
 * no focus at all, and the next Tab restarts from the top of the
 * document rather than from the view they just opened.
 *
 * Two rules:
 *
 * - Only *stale* focus is taken over — focus that was sitting in a view
 *   which is no longer on top, or that the browser has already dropped.
 *   Focus on the chrome (the back button) or anywhere outside the stack
 *   still means something, so it is left where it is.
 * - Focus is *restored* rather than reset: the element that had it when
 *   a view was covered gets it back when that view is revealed again,
 *   which is the focus counterpart of keeping the view mounted.
 */
export function useNavigationFocus(activeViewId: string | null): NavigationFocusResult {
  const rootRef = useRef<HTMLDivElement>(null);

  /** Where focus last sat inside each view, keyed by view id. */
  const lastFocusedByView = useRef(new Map<string, HTMLElement>());

  /** Focus at mount belongs to the page; only *changes* of the top view move it. */
  const hasSettled = useRef(false);

  const onFocus = useCallback<FocusEventHandler<HTMLElement>>((event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const viewId = target.closest<HTMLElement>(VIEW_ID_SELECTOR)?.dataset.viewId;
    if (viewId !== undefined) lastFocusedByView.current.set(viewId, target);
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || activeViewId === null) return;

    // Views that have unmounted for good would otherwise keep their
    // detached subtree alive through this map.
    for (const [viewId, element] of lastFocusedByView.current) {
      if (!element.isConnected) lastFocusedByView.current.delete(viewId);
    }

    if (!hasSettled.current) {
      hasSettled.current = true;
      return;
    }

    const activeView = root.querySelector<HTMLElement>(`[data-view-id="${CSS.escape(activeViewId)}"]`);
    if (!activeView) return;

    const focused = document.activeElement;
    const isStale =
      focused === null || focused === document.body || (root.contains(focused) && !activeView.contains(focused));
    if (!isStale) return;

    const remembered = lastFocusedByView.current.get(activeViewId);
    const target = remembered && activeView.contains(remembered) ? remembered : activeView;

    // The view is mid-slide, so scrolling it into view would fight the
    // transform — and there is nothing to scroll to anyway.
    target.focus({ preventScroll: true });
  }, [activeViewId]);

  return { rootRef, onFocus };
}
