import { useRef, type FC, type ReactNode, type Ref } from 'react';

import type { NavigationHeaderMode } from './container-context.js';
import { NavigationContainer } from './navigation-container.js';
import { NavigationContent } from './navigation-content.js';
import {
  NavBackButton,
  NavBreadcrumb,
  NavHeader,
  NavHeaderRow,
  NavTitle,
  type NavBreadcrumbProps,
} from './navigation-header.js';
import { NavigationProvider } from './navigation-provider.js';
import { useNavigationStack, type NavigationStackResult, type NavigationView } from './use-navigation-stack.js';

export interface NavigationStackShellProps {
  /** The stack to render. Created and owned by the caller. */
  nav: NavigationStackResult;
  /**
   * Renders the body of each view; the chrome is supplied for you.
   *
   * `index` is the view's position in the stack, so content can tell whether
   * it is the one on top — `index === nav.depth - 1`. That is the fact a view
   * needs to decide its own lifecycle: a heavy view that is cheap to rebuild
   * can render nothing while it is covered, and one that is holding state a
   * user would miss can stay. The stack deliberately has no policy of its own
   * about this; it keeps every view mounted and lets the view opt out, because
   * only the view knows what is expensive and what is worth preserving.
   *
   * Comparing the view against `nav.currentView` is not a substitute:
   * `push` may be handed the same object twice, so two entries can hold one
   * reference and the comparison is true for both.
   */
  renderView: (view: NavigationView, index: number) => ReactNode;
  /** @default true */
  showBreadcrumb?: boolean;
  /**
   * What each breadcrumb crumb reads as. Defaults to the view's title.
   * Chrome's business, not the stack's — see `NavBreadcrumbProps.label`.
   */
  crumbLabel?: NavBreadcrumbProps['label'];
  /**
   * `inset` keeps the header in flow above the views. `overlay` floats it
   * over them and hands the whole frame to the content — wrap what you
   * return from `renderView` in a `NavigationScrollArea` (or inset it by
   * `var(--nav-safe-top)`) to keep it clear of the chrome.
   *
   * @default 'inset'
   */
  headerMode?: NavigationHeaderMode;
  /**
   * The frame element. Pass the same ref you gave `useNavigationStack` as its
   * `scopeRef`, so Escape is scoped to this stack.
   */
  ref?: Ref<HTMLDivElement>;
  className?: string;
}

/**
 * The standard chrome and layout, around a stack you already own.
 *
 * This is `NavigationStack` with the state lifted out, and it exists because
 * the two halves are wanted separately. A tab bar has to call `popToRoot` on
 * whichever stack is showing and read each stack's depth for a badge, and
 * both of those need the stack itself — but wanting the state does not mean
 * wanting to rebuild the header, and a copy of it in a caller is a copy that
 * drifts the first time this one changes.
 *
 * It is a separate component rather than an optional `nav` prop on
 * `NavigationStack` because hooks cannot be called conditionally: a preset
 * that accepted a supplied stack would still have to create one, and that
 * spare stack would register its own Escape binding and pop something nobody
 * is rendering.
 *
 * @example
 * ```tsx
 * const frameRef = useRef<HTMLDivElement>(null)
 * const nav = useNavigationStack({ id: 'root', title: 'Home' }, { scopeRef: frameRef })
 *
 * <NavigationStackShell ref={frameRef} nav={nav} renderView={renderView} />
 * <button onClick={nav.popToRoot}>Home</button>
 * ```
 */
export const NavigationStackShell: FC<NavigationStackShellProps> = ({
  nav,
  renderView,
  showBreadcrumb = true,
  crumbLabel,
  headerMode = 'inset',
  ref,
  className,
}) => (
  <NavigationProvider value={nav}>
    <NavigationContainer
      ref={ref}
      headerMode={headerMode}
      className={className}
      header={
        <NavHeader>
          <NavHeaderRow>
            <NavBackButton />
            <NavTitle />
          </NavHeaderRow>
          {showBreadcrumb && <NavBreadcrumb label={crumbLabel} />}
        </NavHeader>
      }
    >
      <NavigationContent
        renderView={(view, index) => (
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
            {renderView(view, index)}
          </div>
        )}
      />
    </NavigationContainer>
  </NavigationProvider>
);

export interface NavigationStackProps extends Omit<NavigationStackShellProps, 'nav' | 'ref'> {
  /**
   * Bottom of the stack.
   *
   * Read once, when the stack is created. Changing it later does nothing —
   * the stack owns its history from that point on, and re-seeding it from a
   * prop would throw away wherever the user had navigated to. Change the
   * `key` on this component to start a new stack instead.
   */
  rootView: NavigationView;
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
}

/**
 * iOS-style navigation stack with push / pop transitions.
 *
 * Owns its stack and renders it with the standard chrome: a header with back
 * button, title and breadcrumb over a content area where views slide in and
 * out. If something outside the chrome needs to drive the stack — a tab bar
 * popping to root on a second tap — hold it yourself with
 * `useNavigationStack` and render `NavigationStackShell`. For different
 * chrome entirely, drop to `NavigationContainer` + `NavigationContent`.
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
  initialViews,
  enableKeyboardNav = true,
  ...shell
}) => {
  // The frame doubles as the keyboard scope, so Escape belongs to whichever
  // stack the user is actually in.
  const frameRef = useRef<HTMLDivElement>(null);
  const nav = useNavigationStack(rootView, { initialViews, enableKeyboardNav, scopeRef: frameRef });

  return <NavigationStackShell ref={frameRef} nav={nav} {...shell} />;
};
