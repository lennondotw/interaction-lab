import type { CSSProperties, ReactNode } from 'react';

interface ChatItemBase {
  id: string;
  /** This item owns the space before its content, including during layout animation. */
  gapBefore?: number;
}

export interface ChatMessage extends ChatItemBase {
  kind?: 'message';
  content: string;
  variant: 'incoming' | 'outgoing';
  /** Fade upward by default; composer sends explicitly opt into flight. */
  entrance?: 'fade' | 'flight';
  /** Request catch-up on insertion; defaults to true for outgoing messages.
   * False preserves existing follow/reading intent, including history insertion. */
  scrollToBottom?: boolean;
}

/** Custom content shares the built-in item insertion layout. */
export interface ChatContentItem extends ChatItemBase {
  kind: 'content';
  content: ReactNode;
  align?: 'start' | 'end' | 'stretch';
}

export interface ChatDateItem extends ChatItemBase {
  kind: 'date';
  dateTime: string;
  label: string;
}

export interface ChatStatusItem extends ChatItemBase {
  kind: 'status';
  content: string;
}

export type ChatListItem = ChatMessage | ChatContentItem | ChatDateItem | ChatStatusItem;

export function isChatMessage(item: ChatListItem | undefined): item is ChatMessage {
  return item !== undefined && (item.kind === undefined || item.kind === 'message');
}

export function chatItemGap(item: ChatListItem, previous: ChatListItem | undefined) {
  if (!previous) return 0;
  if (item.gapBefore !== undefined) return item.gapBefore;
  if (item.kind === 'date' || previous.kind === 'date') return 16;
  return isChatMessage(item) && isChatMessage(previous) && item.variant === previous.variant ? 3 : 8;
}

export function chatItemStyle(gap: number): CSSProperties {
  return { '--chat-item-gap': `${gap}px` } as CSSProperties;
}

/** Read the final inset even when an active slot temporarily overrides padding. */
export function readChatItemGap(row: HTMLElement) {
  return Number.parseFloat(getComputedStyle(row).getPropertyValue('--chat-item-gap')) || 0;
}

/** Compare intrinsic-layout inputs, not presentation state such as tail visibility. */
export function sameChatItemContent(previous: ChatListItem, next: ChatListItem) {
  if (previous === next) return true;
  if (previous.kind !== next.kind) return false;
  if (previous.kind === 'date' && next.kind === 'date') return previous.label === next.label;
  if (previous.kind === 'content' && next.kind === 'content') {
    return previous.content === next.content && previous.align === next.align;
  }
  if (isChatMessage(previous) && isChatMessage(next)) {
    return previous.content === next.content && previous.variant === next.variant;
  }
  return previous.kind === 'status' && next.kind === 'status' && previous.content === next.content;
}
