import { cn } from '@monorepo/utils';
import { useReducedMotion } from 'motion/react';
import { useCallback, useLayoutEffect, useRef, type ComponentPropsWithoutRef } from 'react';

import { MessageBubble, TypingBubble } from '../message-bubble/index.js';
import { createChatInsertions } from './chat-insertions.js';
import { chatItemGap, chatItemStyle, isChatMessage, type ChatListItem, type ChatMessage } from './chat-items.js';
import { ChatDateLabel, ChatStatusLabel } from './chat-list-labels.js';
import { animateChatEntrance } from './chat-presence.js';
import { createChatScrollController, type ChatScrollState } from './chat-scroll-controller.js';
import { useTypingExit } from './use-typing-exit.js';

import './chat-scroll-container.css';

export type { ChatScrollState } from './chat-scroll-controller.js';

export type { ChatMessage, ChatListItem, ChatContentItem, ChatDateItem, ChatStatusItem } from './chat-items.js';

export interface ChatScrollContainerProps extends ComponentPropsWithoutRef<'section'> {
  /** Ordered messages and custom content. Takes precedence over the messages shorthand. */
  items?: readonly ChatListItem[];
  messages?: readonly ChatMessage[];
  /** Show the remote typing indicator after the last message. */
  incomingTyping?: boolean;
  bottomThreshold?: number;
  /** Playback rate for programmatic scrolling. Native gestures remain immediate. */
  animationSpeed?: number;
  contentClassName?: string;
  onScrollStateChange?: (state: ChatScrollState) => void;
}

const emptyItems: readonly ChatListItem[] = [];

/** The host supplies the container's width and height; only the message list scrolls. */
export function ChatScrollContainer({
  messages,
  items: suppliedItems,
  incomingTyping = false,
  bottomThreshold = 2,
  animationSpeed = 1,
  contentClassName,
  onScrollStateChange,
  className,
  ...props
}: ChatScrollContainerProps) {
  const items = suppliedItems ?? messages ?? emptyItems;
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLOListElement>(null);
  const controllerRef = useRef<ReturnType<typeof createChatScrollController> | null>(null);
  const previousIds = useRef(new Set(items.map(({ id }) => id)));
  const previousItems = useRef(items);
  const insertionsRef = useRef<ReturnType<typeof createChatInsertions> | null>(null);
  const entranceAnimations = useRef(new Set<ReturnType<typeof animateChatEntrance>>());
  const reducedMotion = useReducedMotion();
  const typingLayoutChanged = useCallback(() => {
    controllerRef.current?.contentChanged(false, { animatedLayout: true });
    insertionsRef.current?.remember();
  }, []);
  const typing = useTypingExit(
    incomingTyping,
    Math.max(0.01, animationSpeed),
    reducedMotion === true,
    typingLayoutChanged
  );
  const { present: typingMounted, replacing: typingReplacing, replaceWith: replaceTypingWith } = typing;
  const typingPresent = incomingTyping || typing.present;

  useLayoutEffect(() => {
    if (!viewportRef.current || !contentRef.current) return;
    const controller = createChatScrollController(viewportRef.current, contentRef.current, {
      threshold: 2,
      reducedMotion: true,
      animationSpeed: 1,
    });
    controllerRef.current = controller;
    const insertions = createChatInsertions(viewportRef.current, contentRef.current, (localSend, anchor) => {
      controller.contentChanged(localSend, { animatedLayout: true, anchor });
    });
    insertionsRef.current = insertions;
    const entrances = entranceAnimations.current;
    return () => {
      for (const animation of entrances) animation.stop();
      entrances.clear();
      insertions.dispose();
      insertionsRef.current = null;
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    insertionsRef.current?.updateOptions(Math.max(0.01, animationSpeed), reducedMotion === true);
    for (const animation of entranceAnimations.current) {
      animation.speed = Math.max(0.01, animationSpeed);
      if (reducedMotion) animation.complete();
    }
    controllerRef.current?.updateOptions({
      threshold: Math.max(0, bottomThreshold),
      reducedMotion: reducedMotion === true,
      animationSpeed: Math.max(0.01, animationSpeed),
      onStateChange: onScrollStateChange,
    });
  }, [bottomThreshold, animationSpeed, reducedMotion, onScrollStateChange]);

  useLayoutEffect(() => {
    const inserted = items.filter(({ id }) => !previousIds.current.has(id));
    const itemsChanged = previousItems.current !== items;
    previousItems.current = items;
    previousIds.current = new Set(items.map(({ id }) => id));
    const bodies = [...(contentRef.current?.querySelectorAll<HTMLElement>('[data-chat-item-id]') ?? [])];
    const incomingIds = new Set(
      inserted.filter((item) => isChatMessage(item) && item.variant === 'incoming').map(({ id }) => id)
    );
    const entranceIds = new Set(
      inserted.filter((item) => !isChatMessage(item) || item.entrance !== 'flight').map(({ id }) => id)
    );
    const replacement =
      typingMounted && !incomingTyping && !typingReplacing
        ? bodies.find((body) => incomingIds.has(body.dataset.chatItemId!))
        : undefined;
    if (itemsChanged) {
      insertionsRef.current?.insert(
        new Set(inserted.map(({ id }) => id)),
        inserted.some((item) => isChatMessage(item) && item.variant === 'outgoing'),
        replacement && typing.rowRef.current ? { body: replacement, row: typing.rowRef.current } : undefined
      );
    }
    if (!reducedMotion) {
      for (const body of bodies) {
        if (!entranceIds.has(body.dataset.chatItemId!)) continue;
        const fadeOnly = body === replacement;
        if (fadeOnly) replaceTypingWith(body);
        const animation = animateChatEntrance(
          body,
          Math.max(0.01, animationSpeed),
          () => entranceAnimations.current.delete(animation),
          { fadeOnly }
        );
        entranceAnimations.current.add(animation);
      }
    }
    if (!itemsChanged && !typing.preparingEntry) controllerRef.current?.contentChanged();
    // Presentation copies must reflect committed grouping before the next paint.
    for (const animation of entranceAnimations.current) animation.sync();
    if (!typing.preparingEntry) insertionsRef.current?.remember();
  }, [
    items,
    typingPresent,
    reducedMotion,
    animationSpeed,
    incomingTyping,
    typingMounted,
    typingReplacing,
    replaceTypingWith,
    typing.rowRef,
    typing.preparingEntry,
  ]);

  return (
    <section
      aria-label="Chat messages"
      {...props}
      data-slot="chat-scroll-container"
      className={cn(
        'relative min-h-0 min-w-0 overflow-clip rounded-lg border border-black/10 bg-white scheme-light has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-1 has-[:focus-visible]:outline-neutral-400 dark:border-white/15 dark:bg-[#1E1E1E] dark:scheme-dark',
        className
      )}
    >
      <div
        ref={viewportRef}
        data-slot="chat-scroll-viewport"
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- The scroll region needs keyboard access.
        tabIndex={0}
        className="size-full overflow-y-auto overscroll-y-contain scroll-auto rounded-[calc(var(--radius-lg)-1px)] outline-none [overflow-anchor:none]"
      >
        {/* Bound the scroll extent to layout height. Entrance visuals render outside
            this surface; their hidden measurement anchors must not extend it. */}
        <ol ref={contentRef} className={cn('m-0 flex list-none flex-col overflow-clip p-5', contentClassName)}>
          {items.map((item, index) => {
            const message = isChatMessage(item);
            const next = items[index + 1];
            const nextVariant = isChatMessage(next) ? next.variant : !next && incomingTyping ? 'incoming' : undefined;
            const align = message
              ? item.variant === 'outgoing'
                ? 'end'
                : 'start'
              : item.kind === 'content'
                ? (item.align ?? 'stretch')
                : 'stretch';
            return (
              <li
                key={item.id}
                data-chat-item=""
                className={cn(
                  'min-w-0',
                  message && 'max-w-[80%]',
                  align === 'end' ? 'self-end' : align === 'start' ? 'self-start' : 'self-stretch'
                )}
                style={chatItemStyle(chatItemGap(item, items[index - 1]))}
              >
                {message ? (
                  <MessageBubble
                    data-chat-item-id={item.id}
                    data-message-id={item.id}
                    variant={item.variant}
                    tail={nextVariant !== item.variant}
                  >
                    {item.content}
                  </MessageBubble>
                ) : item.kind === 'date' ? (
                  <ChatDateLabel data-chat-item-id={item.id} dateTime={item.dateTime}>
                    {item.label}
                  </ChatDateLabel>
                ) : item.kind === 'status' ? (
                  <ChatStatusLabel data-chat-item-id={item.id}>{item.content}</ChatStatusLabel>
                ) : (
                  <div data-chat-item-id={item.id} className="flow-root min-w-0">
                    {item.content}
                  </div>
                )}
              </li>
            );
          })}
          {typing.present && (
            <li
              ref={typing.rowRef}
              data-chat-item=""
              className="relative self-start"
              data-slot={
                typing.replacing
                  ? 'typing-replacement'
                  : typing.geometry?.entry
                    ? 'typing-entry-placeholder'
                    : typing.geometry
                      ? 'typing-exit-placeholder'
                      : 'chat-typing-row'
              }
              aria-hidden={!incomingTyping && typing.geometry ? true : undefined}
              style={{
                ...chatItemStyle(chatItemGap({ id: 'typing', variant: 'incoming', content: '' }, items.at(-1))),
                ...(typing.geometry ? { height: typing.geometry.height, paddingTop: 0 } : {}),
              }}
            >
              <TypingBubble
                data-chat-item-body=""
                className={typing.geometry ? 'left-0' : undefined}
                style={typing.geometry ? { position: 'absolute', top: typing.geometry.gap } : undefined}
              />
            </li>
          )}
        </ol>
      </div>
    </section>
  );
}
