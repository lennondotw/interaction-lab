import { cn } from '@monorepo/utils';
import { useMemo, type CSSProperties, type FC, type ReactNode } from 'react';

import {
  ContainerContext,
  HEADER_HEIGHT_VAR,
  resolveSafeTop,
  SAFE_TOP_VAR,
  type NavigationHeaderMode,
} from './container-context.js';
import { useHeaderHeight } from './use-header-height.js';

export interface NavigationContainerProps {
  /** Above the views, either in flow or floating over them. */
  header: ReactNode;
  children: ReactNode;
  /**
   * Whether the header takes space or floats.
   * @default 'inset'
   */
  headerMode?: NavigationHeaderMode;
  className?: string;
}

/**
 * Clipping frame for the stack: a header over a content area that the views
 * slide through.
 *
 * The two modes differ in one line — whether the header is a flow item in
 * the column or is lifted out of it:
 *
 * - `inset` puts the header in the column, so the content area is whatever
 *   is left. No height crosses into JS, so the layout cannot disagree with
 *   the header's real size: take the breadcrumb away and the content grows
 *   by exactly the line that left.
 * - `overlay` lifts the header out, so the content area is the whole frame
 *   and views run edge to edge behind a floating bar. Only here does the
 *   height have to be measured, because content that wants to stay clear of
 *   the chrome has no layout relationship to it any more — it insets itself
 *   by `--nav-safe-top`.
 */
export const NavigationContainer: FC<NavigationContainerProps> = ({
  header,
  children,
  headerMode = 'inset',
  className,
}) => {
  const { headerRef, headerHeight } = useHeaderHeight();

  const isOverlay = headerMode === 'overlay';
  const safeTop = resolveSafeTop(headerMode, headerHeight);

  const layout = useMemo(() => ({ headerMode, headerHeight, safeTop }), [headerMode, headerHeight, safeTop]);

  return (
    <ContainerContext.Provider value={layout}>
      <div
        data-testid="navigation-container"
        data-header-mode={headerMode}
        // `contain` keeps each view's animation from invalidating layout
        // for the rest of the page.
        style={
          {
            contain: 'layout style paint',
            [SAFE_TOP_VAR]: `${safeTop}px`,
            [HEADER_HEIGHT_VAR]: `${headerHeight ?? 0}px`,
          } as CSSProperties
        }
        className={cn(
          `
            relative flex h-full flex-col overflow-hidden rounded-2xl bg-neutral-200
            dark:bg-neutral-900
          `,
          className
        )}
      >
        <div
          ref={headerRef}
          data-testid="navigation-header"
          className={cn('z-20', isOverlay ? 'absolute inset-x-0 top-0' : 'relative shrink-0')}
        >
          {header}
        </div>
        {/* `min-h-0` so a tall view is clipped by this box rather than
            stretching the column past the frame. */}
        <div data-testid="navigation-body" className="flex min-h-0 flex-1 flex-col">
          {children}
        </div>
      </div>
    </ContainerContext.Provider>
  );
};
