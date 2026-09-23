import {
  finalScrollBottom,
  hasPendingLayout,
  pendingLayoutEntries,
  pendingLayoutHeight,
  registerLayoutTransition,
  registerPendingLayout,
  type PendingLayoutEntry,
} from '../scroll-anchor/pending-layout.js';

/** Chat rows also animate their leading gap; flights need it to project a destination. */
export interface ChatLayoutEntry extends PendingLayoutEntry {
  gapRemaining: number;
}

/** Presence transitions share final geometry without becoming message insertion rows. */
export function registerChatTransition(viewport: HTMLElement, entry: ChatLayoutEntry) {
  return registerLayoutTransition(viewport, entry);
}

export function registerChatLayout(viewport: HTMLElement, entries: Set<ChatLayoutEntry>) {
  return registerPendingLayout(viewport, entries);
}

export const pendingChatHeight = pendingLayoutHeight;
export const hasChatLayoutAnimation = hasPendingLayout;

/** The chat content is the viewport's first child. */
export function finalChatBottom(viewport: HTMLElement) {
  return finalScrollBottom(viewport, viewport.firstElementChild!);
}

export function projectedChatY(viewport: HTMLElement, bubble: HTMLElement, y: number) {
  const row = bubble.parentElement!;
  // Every entry registered on a chat viewport is a ChatLayoutEntry.
  const own = pendingLayoutEntries(viewport).find((entry) => entry.row === row) as ChatLayoutEntry | undefined;
  const ownGap = own?.gapRemaining ?? 0;
  return y + ownGap + pendingLayoutHeight(viewport, row) - Math.max(0, finalChatBottom(viewport) - viewport.scrollTop);
}
