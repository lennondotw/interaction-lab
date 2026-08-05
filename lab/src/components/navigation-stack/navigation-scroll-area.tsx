import { cn } from '@monorepo/utils';
import type { CSSProperties, FC, ReactNode } from 'react';

import { useContainerLayout } from './container-context.js';

export interface NavigationScrollAreaProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * Scrollable body that clears the fixed header. Must be rendered inside
 * a {@link NavigationContainer}.
 */
export const NavigationScrollArea: FC<NavigationScrollAreaProps> = ({ children, className, style }) => {
  const { headerHeight } = useContainerLayout();

  return (
    <div className={cn('h-full overflow-y-auto', className)} style={{ paddingTop: headerHeight, ...style }}>
      {children}
    </div>
  );
};

export interface NavigationCenteredContentProps {
  children: ReactNode;
  className?: string;
}

/** Centred body that clears the fixed header — for empty states and leaves. */
export const NavigationCenteredContent: FC<NavigationCenteredContentProps> = ({ children, className }) => {
  const { headerHeight } = useContainerLayout();

  return (
    <div className={cn('flex h-full items-center justify-center', className)} style={{ paddingTop: headerHeight }}>
      {children}
    </div>
  );
};
