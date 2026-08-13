import { cn } from '@monorepo/utils';
import type { CSSProperties, FC, ReactNode } from 'react';

import { SAFE_TOP_VAR, useContainerLayout } from './container-context.js';

/**
 * The inset, taken from the custom property rather than from the context
 * value. Both carry the same number, but the property means a header that
 * changes height repaints these boxes without re-rendering the view tree
 * inside them. The context is still read, so being rendered outside a
 * `NavigationContainer` fails loudly instead of silently insetting by zero.
 */
const safeTopPadding: CSSProperties = { paddingTop: `var(${SAFE_TOP_VAR}, 0px)` };

export interface NavigationScrollAreaProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * Scrollable body that keeps its content clear of the chrome.
 *
 * In `inset` mode that inset is zero — the column already placed this box
 * below the header — so the same component is correct in both modes without
 * a branch, and can never double up with a padding applied further out.
 */
export const NavigationScrollArea: FC<NavigationScrollAreaProps> = ({ children, className, style }) => {
  useContainerLayout();

  return (
    <div className={cn('h-full overflow-y-auto', className)} style={{ ...safeTopPadding, ...style }}>
      {children}
    </div>
  );
};

export interface NavigationCenteredContentProps {
  children: ReactNode;
  className?: string;
}

/** Centred body that stays clear of the chrome — for empty states and leaves. */
export const NavigationCenteredContent: FC<NavigationCenteredContentProps> = ({ children, className }) => {
  useContainerLayout();

  return (
    <div className={cn('flex h-full items-center justify-center', className)} style={safeTopPadding}>
      {children}
    </div>
  );
};
