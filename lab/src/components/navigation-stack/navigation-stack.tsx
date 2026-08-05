import { cn } from '@monorepo/utils';
import type { FC, ReactNode } from 'react';

import { NavigationContainer } from './navigation-container.js';
import { NavigationContent } from './navigation-content.js';
import { NavBackButton, NavBreadcrumb, NavHeader, NavHeaderRow, NavTitle } from './navigation-header.js';
import { NavigationProvider } from './navigation-provider.js';
import { useNavigationStack, type NavigationView } from './use-navigation-stack.js';

export interface NavigationStackProps {
  rootView: NavigationView;
  /** Renders the body of each view; the chrome is supplied for you. */
  renderView: (view: NavigationView) => ReactNode;
  /** @default true */
  showBreadcrumb?: boolean;
  /** @default 84 */
  headerHeight?: number;
  className?: string;
}

/**
 * iOS-style navigation stack with push / pop transitions.
 *
 * Assembles the building blocks into the common arrangement: a fixed
 * header with back button, title and breadcrumb over a content area
 * where views slide in and out. Drop down to `NavigationContainer` +
 * `NavigationContent` directly if you need a different chrome.
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
  showBreadcrumb = true,
  headerHeight = 84,
  className,
}) => {
  const nav = useNavigationStack(rootView);

  return (
    <NavigationProvider value={nav}>
      <NavigationContainer
        headerHeight={headerHeight}
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
            // Each view is opaque so the one it covers can't show
            // through during the slide.
            <div
              className={cn(`
                h-full bg-white
                dark:bg-neutral-950
              `)}
              style={{ paddingTop: headerHeight }}
            >
              {renderView(view)}
            </div>
          )}
        />
      </NavigationContainer>
    </NavigationProvider>
  );
};
