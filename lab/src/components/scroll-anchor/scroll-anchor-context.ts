import { createContext, type Ref } from 'react';

export interface ScrollAnchorContextValue {
  setViewport: (node: HTMLDivElement | null) => void;
  setContent: (node: HTMLDivElement | null) => void;
}

export const ScrollAnchorContext = createContext<ScrollAnchorContextValue | null>(null);

/** Forward a node to a consumer-supplied ref of either kind. */
export function assignRef<T>(forwarded: Ref<T> | undefined, node: T | null) {
  if (typeof forwarded === 'function') forwarded(node);
  else if (forwarded) forwarded.current = node;
}
