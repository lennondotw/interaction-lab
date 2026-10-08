import { createContext } from 'react';

import type { TabHit } from './tab-geometry.js';

export interface TabInteractionState {
  /** Pointer feedback is resolved against presentation, not the action target. */
  hovered: TabHit | null;
  pressed: TabHit | null;
  /** Keyboard focus belongs to the sole semantic control. */
  focused: { hit: TabHit; visible: boolean } | null;
}

export const TabInteractionContext = createContext<{
  activeId: string | null;
  state: TabInteractionState;
} | null>(null);
