import { useRef, type FC, type ReactNode } from 'react';

import type { NavigationHeaderMode } from './container-context.js';
import { NavigationContainer } from './navigation-container.js';
import { NavigationContent } from './navigation-content.js';
import { NavBackButton, NavBreadcrumb, NavHeader, NavHeaderRow, NavTitle } from './navigation-header.js';
import { NavigationProvider } from './navigation-provider.js';
import { useNavigationStack, type NavigationView } from './use-navigation-stack.js';

export interface NavigationStackProps {
  /**
   * Bottom of the stack.
   *
   * Read once, when the stack is created. Changing it later does nothing —
   * the stack owns its history from that point on, and re-seeding it from a
   * prop would throw away wherever the user had navigated to. Change the
   * `key` on this component to start a new stack instead.
   */
  rootView: NavigationView;
  /** Renders the body of each view; the chrome is supplied for you. */
  renderView: (view: NavigationView) => ReactNode;
  /**
   * Views on top of the root at creation, e.g. to open on a deep link.
   * Read once, with the same reasoning as `rootView`.
   */
  initialViews?: NavigationView[];
  /**
   * Bind Escape to `pop`, scoped to this stack.
   * @default true
   */
  enableKeyboardNav?: boolean;
  /** @default true */
  showBreadcrumb?: boolean;
  /**
   * `inset` keeps the header in flow above the views. `overlay` floats it
   * over them and hands the whole frame to the content — wrap what you
   * return from `renderView` in a `NavigationScrollArea` (or inset it by
   * `var(--nav-safe-top)`) to keep it clear of the chrome.
   *
   * @default 'inset'
   */
  headerMode?: NavigationHeaderMode;
  className?: string;
}

/**
 * iOS-style navigation stack with push / pop transitions.
 *
 * Assembles the building blocks into the common arrangement: a header with
 * back button, title and breadcrumb over a content area where views slide in
 * and out. Drop down to `NavigationContainer` + `NavigationContent` directly
 * if you need a different chrome.
 *
 * @example
 * ```tsx
 * <NavigationStack
 *   rootView={{ id: 'root', title: 'Home' }}
 *   renderView={(view) => <MyContent view={view} />}
 * />
 * ```
 */
export const NavigationStack: FC<NavigationStackProps> = ({
  rootView,
  renderView,
  initialViews,
  enableKeyboardNav = true,
  showBreadcrumb = true,
  headerMode = 'inset',
  className,
}) => {
  // The frame doubles as the keyboard scope, so Escape belongs to whichever
  // stack the user is actually in.
  const frameRef = useRef<HTMLDivElement>(null);
  const nav = useNavigationStack(rootView, { initialViews, enableKeyboardNav, scopeRef: frameRef });

  return (
    <NavigationProvider value={nav}>
      <NavigationContainer
        ref={frameRef}
        headerMode={headerMode}
        className={className}
        header={
          <NavHeader>
            <NavHeaderRow>
              <NavBackButton />
              <NavTitle />
            </NavHeaderRow>
            {showBreadcrumb && <NavBreadcrumb />}
          </NavHeader>
        }
      >
        <NavigationContent
          renderView={(view) => (
            // Each view is opaque so the one it covers can't show through
            // during the slide. No inset of its own: in `inset` mode the
            // column has already placed the content area below the header,
            // and in `overlay` mode the whole point is that the content
            // reaches the edges and insets only what it chooses to.
            <div
              className={`
                h-full bg-white
                dark:bg-neutral-950
              `}
            >
              {renderView(view)}
            </div>
          )}
        />
      </NavigationContainer>
    </NavigationProvider>
  );
};
