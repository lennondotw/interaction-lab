import { createContext, useContext } from 'react';

import type { NavigationStackResult } from './use-navigation-stack.js';

// Context + hook live apart from the provider component so each .tsx in
// this folder exports only components, which is what Fast Refresh needs
// to swap them without remounting the tree.
export const NavigationContext = createContext<NavigationStackResult | null>(null);

/** Read the navigation stack from any descendant of `NavigationProvider`. */
export function useNavigation(): NavigationStackResult {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider');
  return ctx;
}
