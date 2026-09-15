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
}

/** Dates, unread markers, and other content share the message insertion layout. */
export interface ChatContentItem extends ChatItemBase {
  kind: 'content';
  content: ReactNode;
  align?: 'start' | 'end' | 'stretch';
}

export type ChatListItem = ChatMessage | ChatContentItem;

export function isChatMessage(item: ChatListItem | undefined): item is ChatMessage {
  return item !== undefined && item.kind !== 'content';
}

export function chatItemGap(item: ChatListItem, previous: ChatListItem | undefined) {
  if (!previous) return 0;
  if (item.gapBefore !== undefined) return item.gapBefore;
  return isChatMessage(item) && isChatMessage(previous) && item.variant === previous.variant ? 3 : 8;
}

export function chatItemStyle(gap: number): CSSProperties {
  return { '--chat-item-gap': `${gap}px` } as CSSProperties;
}

/** Read the final inset even when an active slot temporarily overrides padding. */
export function readChatItemGap(row: HTMLElement) {
  return Number.parseFloat(getComputedStyle(row).getPropertyValue('--chat-item-gap')) || 0;
}
