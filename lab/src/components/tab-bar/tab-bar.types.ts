import type { TabBarHoldState } from './tab-hover-hold.js';

export interface TabBarItem {
  id: string;
  title: string;
}

export interface TabBarProps {
  tabs: readonly TabBarItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
  /** Reports hover/leave-delay transitions for hosts that visualize the hold. */
  onHoldStateChange?: (state: TabBarHoldState) => void;
  className?: string;
}

export interface TabFootprint {
  set: (width: number, gap: number, immediate: boolean) => void;
  getTargetWidth: () => number;
}
