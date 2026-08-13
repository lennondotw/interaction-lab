import { useCallback, useLayoutEffect, useRef, type FocusEventHandler, type RefObject } from 'react';

/**
 * Attribute `NavigationContent` stamps on every view wrapper. Focus is
 * scoped by walking up to the nearest element carrying it, so the two
 * have to agree on the name.
 *
 * The entry key rather than the view id: the same view can be on the stack
 * twice, and focus belongs to the visit, not to the destination. Keying this
 * by id would restore focus into whichever occupancy happened to come first
 * in the document.
 */
const ENTRY_KEY_SELECTOR = '[data-entry-key]';

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
export function useNavigationFocus(activeKey: string | null): NavigationFocusResult {
  const rootRef = useRef<HTMLDivElement>(null);

  /** Where focus last sat inside each view, keyed by entry. */
  const lastFocusedByEntry = useRef(new Map<string, HTMLElement>());

  /** Focus at mount belongs to the page; only *changes* of the top view move it. */
  const hasSettled = useRef(false);

  const onFocus = useCallback<FocusEventHandler<HTMLElement>>((event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const key = target.closest<HTMLElement>(ENTRY_KEY_SELECTOR)?.dataset.entryKey;
    if (key !== undefined) lastFocusedByEntry.current.set(key, target);
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || activeKey === null) return;

    // Views that have unmounted for good would otherwise keep their
    // detached subtree alive through this map.
    for (const [key, element] of lastFocusedByEntry.current) {
      if (!element.isConnected) lastFocusedByEntry.current.delete(key);
    }

    if (!hasSettled.current) {
      hasSettled.current = true;
      return;
    }

    const activeView = root.querySelector<HTMLElement>(`[data-entry-key="${CSS.escape(activeKey)}"]`);
    if (!activeView) return;

    const focused = document.activeElement;
    const isStale =
      focused === null || focused === document.body || (root.contains(focused) && !activeView.contains(focused));
    if (!isStale) return;

    const remembered = lastFocusedByEntry.current.get(activeKey);
    const target = remembered && activeView.contains(remembered) ? remembered : activeView;

    // The view is mid-slide, so scrolling it into view would fight the
    // transform — and there is nothing to scroll to anyway.
    target.focus({ preventScroll: true });
  }, [activeKey]);

  return { rootRef, onFocus };
}
