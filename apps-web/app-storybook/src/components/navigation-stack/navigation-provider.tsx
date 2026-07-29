import type { FC, ReactNode } from 'react';
import { NavigationContext } from './navigation-context.js';
import type { NavigationStackResult } from './use-navigation-stack.js';

export interface NavigationProviderProps {
  /** The result of `useNavigationStack`. */
  value: NavigationStackResult;
  children: ReactNode;
}

/**
 * Publishes the stack to descendants, keeping the state owner separate
 * from its consumers — the header and the content area both read it, but
 * neither owns it.
 */
export const NavigationProvider: FC<NavigationProviderProps> = ({ value, children }) => (
  <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
);
