/**
 * Pending layout: height a viewport's content will still gain (or lose) once the
 * layout animations currently running inside it settle. The scroll controller
 * projects its bottom from this so catch-up targets the final boundary instead of
 * chasing every intermediate frame.
 */
export interface PendingLayoutEntry {
  /** The element whose footprint is still animating. */
  row: HTMLElement;
  /** Final footprint minus the painted footprint. Negative while space is being released. */
  remaining: number;
}

const owned = new WeakMap<HTMLElement, Set<PendingLayoutEntry>>();
const transitions = new WeakMap<HTMLElement, Set<PendingLayoutEntry>>();

/** A layout manager publishes one live set per viewport; entries are mutated in place. */
export function registerPendingLayout(viewport: HTMLElement, entries: Set<PendingLayoutEntry>) {
  owned.set(viewport, entries);
  return () => owned.delete(viewport);
}

/** Ad-hoc transitions (releases, presence changes) share the projection without a manager. */
export function registerLayoutTransition(viewport: HTMLElement, entry: PendingLayoutEntry) {
  let entries = transitions.get(viewport);
  if (!entries) {
    entries = new Set();
    transitions.set(viewport, entries);
  }
  entries.add(entry);
  return () => entries.delete(entry);
}

export function pendingLayoutEntries(viewport: HTMLElement): readonly PendingLayoutEntry[] {
  return [...(owned.get(viewport) ?? []), ...(transitions.get(viewport) ?? [])];
}

/** Remaining height of every connected entry, optionally only for rows preceding `before`. */
export function pendingLayoutHeight(viewport: HTMLElement, before?: HTMLElement) {
  let height = 0;
  for (const entry of pendingLayoutEntries(viewport)) {
    if (!entry.row.isConnected) continue;
    if (!before || entry.row.compareDocumentPosition(before) & Node.DOCUMENT_POSITION_FOLLOWING) {
      height += entry.remaining;
    }
  }
  return height;
}

export function hasPendingLayout(viewport: HTMLElement) {
  return pendingLayoutEntries(viewport).length > 0;
}

/** The maximum scroll offset once pending layout settles, in fractional CSS pixels. */
export function finalScrollBottom(viewport: HTMLElement, content: Element) {
  return Math.max(0, content.getBoundingClientRect().height + pendingLayoutHeight(viewport) - viewport.clientHeight);
}
