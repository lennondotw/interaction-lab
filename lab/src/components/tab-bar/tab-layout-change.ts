export interface TabLayoutSnapshot {
  width: number;
  ids: readonly string[];
  heldWidths: ReadonlyMap<string, number> | null;
}

/** Observation is geometry, not intent: repeat notifications cannot restart motion. */
export function getTabLayoutChange(previous: TabLayoutSnapshot | null, next: TabLayoutSnapshot) {
  if (previous === null) return 'mount';
  if (previous.width !== next.width) return 'resize';
  if (previous.ids.length !== next.ids.length || previous.ids.some((id, index) => id !== next.ids[index])) {
    return 'tabs';
  }
  if (previous.heldWidths !== next.heldWidths) return 'hold';
  return 'unchanged';
}
