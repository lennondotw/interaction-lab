/** Shared geometry for layout expansion, scrolling, and the independent send flight. */
export interface ChatLayoutEntry {
  row: HTMLElement;
  remaining: number;
  gapRemaining: number;
}

const layouts = new WeakMap<HTMLElement, Set<ChatLayoutEntry>>();
const transitions = new WeakMap<HTMLElement, Set<ChatLayoutEntry>>();

/** Presence transitions share final geometry without becoming message insertion rows. */
export function registerChatTransition(viewport: HTMLElement, entry: ChatLayoutEntry) {
  let entries = transitions.get(viewport);
  if (!entries) {
    entries = new Set();
    transitions.set(viewport, entries);
  }
  entries.add(entry);
  return () => entries.delete(entry);
}

function allEntries(viewport: HTMLElement) {
  return [...(layouts.get(viewport) ?? []), ...(transitions.get(viewport) ?? [])];
}

export function registerChatLayout(viewport: HTMLElement, entries: Set<ChatLayoutEntry>) {
  layouts.set(viewport, entries);
  return () => layouts.delete(viewport);
}

export function pendingChatHeight(viewport: HTMLElement, before?: HTMLElement) {
  let height = 0;
  for (const entry of allEntries(viewport)) {
    if (!entry.row.isConnected) continue;
    if (!before || entry.row.compareDocumentPosition(before) & Node.DOCUMENT_POSITION_FOLLOWING) {
      height += entry.remaining;
    }
  }
  return height;
}

export function hasChatLayoutAnimation(viewport: HTMLElement) {
  return allEntries(viewport).length > 0;
}

export function finalChatBottom(viewport: HTMLElement) {
  const content = viewport.firstElementChild!;
  return Math.max(0, content.getBoundingClientRect().height + pendingChatHeight(viewport) - viewport.clientHeight);
}

export function projectedChatY(viewport: HTMLElement, bubble: HTMLElement, y: number) {
  const row = bubble.parentElement!;
  const ownGap = allEntries(viewport).find((entry) => entry.row === row)?.gapRemaining ?? 0;
  return y + ownGap + pendingChatHeight(viewport, row) - Math.max(0, finalChatBottom(viewport) - viewport.scrollTop);
}
