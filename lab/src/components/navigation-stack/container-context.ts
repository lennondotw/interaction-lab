import { createContext, useContext } from 'react';

export interface ContainerLayout {
  headerHeight: number;
}

export const ContainerContext = createContext<ContainerLayout | null>(null);

/**
 * Header height published by `NavigationContainer`, for content that has
 * to clear the fixed header itself.
 */
export function useContainerLayout(): ContainerLayout {
  const ctx = useContext(ContainerContext);
  if (!ctx) throw new Error('useContainerLayout must be used within NavigationContainer');
  return ctx;
}
