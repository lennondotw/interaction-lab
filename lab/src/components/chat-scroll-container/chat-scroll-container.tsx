import { cn } from '@monorepo/utils';
import { useReducedMotion } from 'motion/react';
import { useCallback, useLayoutEffect, useRef, type ComponentPropsWithoutRef } from 'react';

import { MessageBubble, TypingBubble } from '../message-bubble/index.js';
import { createChatInsertions } from './chat-insertions.js';
import { animateChatEntrance } from './chat-presence.js';
import { createChatScrollController, type ChatScrollState } from './chat-scroll-controller.js';
import { useTypingExit } from './use-typing-exit.js';

import './chat-scroll-container.css';

export type { ChatScrollState } from './chat-scroll-controller.js';

export interface ChatMessage {
  id: string;
  content: string;
  variant: 'incoming' | 'outgoing';
  /** Messages fade upward by default; composer sends explicitly use the external flight hook. */
  entrance?: 'fade' | 'flight';
}

export interface ChatScrollContainerProps extends ComponentPropsWithoutRef<'section'> {
  messages: readonly ChatMessage[];
  /** Show the remote typing indicator after the last message. */
  incomingTyping?: boolean;
  bottomThreshold?: number;
  /** Playback rate for programmatic scrolling. Native gestures remain immediate. */
  animationSpeed?: number;
  contentClassName?: string;
  onScrollStateChange?: (state: ChatScrollState) => void;
}

/** The host supplies the container's width and height; only the message list scrolls. */
export function ChatScrollContainer({
  messages,
  incomingTyping = false,
  bottomThreshold = 2,
  animationSpeed = 1,
  contentClassName,
  onScrollStateChange,
  className,
  ...props
}: ChatScrollContainerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLOListElement>(null);
  const controllerRef = useRef<ReturnType<typeof createChatScrollController> | null>(null);
  const previousIds = useRef(new Set(messages.map(({ id }) => id)));
  const previousMessages = useRef(messages);
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
    const inserted = messages.filter(({ id }) => !previousIds.current.has(id));
    const messagesChanged = previousMessages.current !== messages;
    previousMessages.current = messages;
    previousIds.current = new Set(messages.map(({ id }) => id));
    const bubbles = [...(contentRef.current?.querySelectorAll<HTMLElement>('[data-message-id]') ?? [])];
    const incomingIds = new Set(inserted.filter((message) => message.variant === 'incoming').map(({ id }) => id));
    const entranceIds = new Set(inserted.filter((message) => message.entrance !== 'flight').map(({ id }) => id));
    const replacement =
      typingMounted && !incomingTyping && !typingReplacing
        ? bubbles.find((bubble) => incomingIds.has(bubble.dataset.messageId!))
        : undefined;
    if (messagesChanged) {
      insertionsRef.current?.insert(
        new Set(inserted.map(({ id }) => id)),
        inserted.some((message) => message.variant === 'outgoing'),
        replacement && typing.rowRef.current ? { bubble: replacement, row: typing.rowRef.current } : undefined
      );
    }
    if (!reducedMotion) {
      for (const bubble of bubbles) {
        if (!entranceIds.has(bubble.dataset.messageId!)) continue;
        const fadeOnly = bubble === replacement;
        if (fadeOnly) replaceTypingWith(bubble);
        const animation = animateChatEntrance(
          bubble,
          Math.max(0.01, animationSpeed),
          () => entranceAnimations.current.delete(animation),
          { fadeOnly }
        );
        entranceAnimations.current.add(animation);
      }
    }
    if (!messagesChanged && !typing.preparingEntry) controllerRef.current?.contentChanged();
    // Presentation copies must reflect committed grouping before the next paint.
    for (const animation of entranceAnimations.current) animation.sync();
    if (!typing.preparingEntry) insertionsRef.current?.remember();
  }, [
    messages,
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
          {messages.map((message, index) => (
            <li
              key={message.id}
              className={cn('min-w-0 max-w-[80%]', message.variant === 'outgoing' ? 'self-end' : 'self-start')}
            >
              <MessageBubble
                data-message-id={message.id}
                variant={message.variant}
                tail={(messages[index + 1]?.variant ?? (incomingTyping ? 'incoming' : undefined)) !== message.variant}
              >
                {message.content}
              </MessageBubble>
            </li>
          ))}
          {typing.present && (
            <li
              ref={typing.rowRef}
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
              style={typing.geometry ? { height: typing.geometry.height, marginTop: 0 } : undefined}
            >
              <TypingBubble
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
