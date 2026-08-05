import { cn } from '@monorepo/utils';
import type { FC, ReactNode } from 'react';
import { ContainerContext } from './container-context.js';

export interface NavigationContainerProps {
  /** Fixed at the top, above the views. */
  header: ReactNode;
  children: ReactNode;
  /** @default 84 */
  headerHeight?: number;
  className?: string;
}

/**
 * Clipping frame for the stack: a fixed header layer over a content
 * layer that the views slide through.
 */
export const NavigationContainer: FC<NavigationContainerProps> = ({
  header,
  children,
  headerHeight = 84,
  className,
}) => (
  <ContainerContext.Provider value={{ headerHeight }}>
    <div
      data-testid="navigation-container"
      // `contain` keeps each view's animation from invalidating layout
      // for the rest of the page.
      style={{ contain: 'layout style paint' }}
      className={cn(
        `
          relative h-full overflow-hidden rounded-2xl bg-neutral-200
          dark:bg-neutral-900
        `,
        className
      )}
    >
      <div data-testid="navigation-header" className="absolute inset-x-0 top-0 z-20">
        {header}
      </div>
      <div data-testid="navigation-body" className="flex h-full flex-col">
        {children}
      </div>
    </div>
  </ContainerContext.Provider>
);
