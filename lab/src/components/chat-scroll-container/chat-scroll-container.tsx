import { cn } from '@monorepo/utils';
import { useReducedMotion } from 'motion/react';
import {
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type Ref,
} from 'react';

import { MessageBubble, TypingBubble } from '../message-bubble/index.js';
import {
  createScrollAnchorController,
  type ScrollAnchorController,
  type ScrollAnchorState,
} from '../scroll-anchor/scroll-anchor-controller.js';
import { createChatBottomSpace, type ChatBottomSpace } from './chat-bottom-space.js';
import { createChatInsertions } from './chat-insertions.js';
import { createChatItemDebug } from './chat-item-debug.js';
import {
  chatItemGap,
  chatItemStyle,
  isChatMessage,
  sameChatItemContent,
  type ChatListItem,
  type ChatMessage,
} from './chat-items.js';
import { ChatDateLabel, ChatStatusLabel } from './chat-list-labels.js';
import { animateChatEntrance } from './chat-presence.js';
import { useTypingExit } from './use-typing-exit.js';

import styles from './chat-scroll-container.module.css';

export type ChatScrollState = ScrollAnchorState;

export type { ChatMessage, ChatListItem, ChatContentItem, ChatDateItem, ChatStatusItem } from './chat-items.js';

export interface ChatScrollContainerHandle {
  /** Animate to the bottom and follow subsequent layout changes. */
  scrollToBottom(): void;
}

export interface ChatScrollContainerProps extends ComponentPropsWithoutRef<'section'> {
  ref?: Ref<ChatScrollContainerHandle>;
  /** Ordered messages and custom content. Takes precedence over the messages shorthand. */
  items?: readonly ChatListItem[];
  messages?: readonly ChatMessage[];
  /** Show the remote typing indicator after the last message. */
  incomingTyping?: boolean;
  bottomThreshold?: number;
  /** Read-only per-item motion annotations outside the item layout boxes. */
  debugBubbles?: boolean;
  /** Highlight the reading anchor candidate; compensation uses it only while detached. */
  debugReadingAnchor?: boolean;
  /** Opt into interrupting follow and send flight on mouse press. Touch interrupts active catch-up independently. */
  interruptOnMouseDown?: boolean;
  /** Playback rate for programmatic scrolling. Native gestures remain immediate. */
  animationSpeed?: number;
  contentClassName?: string;
  /** Optional independent trailing clearance. Reset releases animate without owning a message. */
  bottomSpace?: ChatBottomSpace;
  onScrollStateChange?: (state: ChatScrollState) => void;
}

const emptyItems: readonly ChatListItem[] = [];

/** The host supplies the container's width and height; only the message list scrolls. */
export function ChatScrollContainer({
  ref,
  messages,
  items: suppliedItems,
  incomingTyping = false,
  bottomThreshold = 2,
  debugBubbles = false,
  debugReadingAnchor = false,
  interruptOnMouseDown = false,
  animationSpeed = 1,
  contentClassName,
  bottomSpace,
  onScrollStateChange,
  className,
  ...props
}: ChatScrollContainerProps) {
  const hasBottomSpace = bottomSpace !== undefined;
  const items = suppliedItems ?? messages ?? emptyItems;
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLOListElement>(null);
  const bottomSpaceRef = useRef<HTMLLIElement>(null);
  const bottomSpaceController = useRef<ReturnType<typeof createChatBottomSpace> | null>(null);
  const controllerRef = useRef<ScrollAnchorController | null>(null);
  const insertionsRef = useRef<ReturnType<typeof createChatInsertions> | null>(null);
  useImperativeHandle(
    ref,
    () => ({
      scrollToBottom: () => controllerRef.current?.scrollToBottom(),
    }),
    []
  );
  const previousItems = useRef(items);
  const previousTypingIntent = useRef(incomingTyping);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const registerRow = useCallback((row: HTMLLIElement | null) => {
    if (!row) return;
    const id = row.dataset.chatRowId!;
    rowRefs.current.set(id, row);
    insertionsRef.current?.register(row);
    return () => {
      rowRefs.current.delete(id);
      insertionsRef.current?.unregister(row);
    };
  }, []);
  const entranceAnimations = useRef(new Set<ReturnType<typeof animateChatEntrance>>());
  const reducedMotion = useReducedMotion();
  const typingLayoutChanged = useCallback(() => {
    controllerRef.current?.layoutChanged({ animated: true });
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
    const controller = createScrollAnchorController(viewportRef.current, contentRef.current, {
      threshold: 2,
      reducedMotion: true,
      animationSpeed: 1,
    });
    controllerRef.current = controller;
    const insertions = createChatInsertions(viewportRef.current, contentRef.current, (localSend, anchor) => {
      controller.layoutChanged({ follow: localSend, animated: true, anchor });
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
    if (!debugBubbles || !viewportRef.current || !contentRef.current) return;
    return createChatItemDebug(viewportRef.current, contentRef.current);
  }, [debugBubbles]);

  useLayoutEffect(() => {
    insertionsRef.current?.setDebugAnchor(debugReadingAnchor);
    return () => insertionsRef.current?.setDebugAnchor(false);
  }, [debugReadingAnchor]);

  useLayoutEffect(() => {
    insertionsRef.current?.updateOptions(Math.max(0.01, animationSpeed), reducedMotion === true);
    for (const animation of entranceAnimations.current) {
      animation.speed = Math.max(0.01, animationSpeed);
      if (reducedMotion) animation.complete();
    }
    controllerRef.current?.updateOptions({
      threshold: Math.max(0, bottomThreshold),
      interruptOnMouseDown,
      reducedMotion: reducedMotion === true,
      animationSpeed: Math.max(0.01, animationSpeed),
      onStateChange: onScrollStateChange,
    });
  }, [bottomThreshold, interruptOnMouseDown, animationSpeed, reducedMotion, onScrollStateChange]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const element = bottomSpaceRef.current;
    if (!viewport || !element) return;
    const space = createChatBottomSpace(viewport, element, (composerResize) => {
      controllerRef.current?.layoutChanged({ animated: true, clearance: composerResize });
      insertionsRef.current?.remember();
    });
    bottomSpaceController.current = space;
    return () => {
      space.dispose();
      bottomSpaceController.current = null;
    };
  }, [hasBottomSpace]);

  useLayoutEffect(() => {
    bottomSpaceController.current?.updateOptions(Math.max(0.01, animationSpeed), reducedMotion === true);
    if (bottomSpace) bottomSpaceController.current?.update(bottomSpace);
  }, [bottomSpace, animationSpeed, reducedMotion]);

  useLayoutEffect(() => {
    const typingTurnedOff = previousTypingIntent.current && !incomingTyping;
    previousTypingIntent.current = incomingTyping;
    const inserted: ChatListItem[] = [];
    let replacementId: string | undefined;
    const itemsChanged = previousItems.current !== items;
    const affected = new Set<HTMLElement>();
    if (itemsChanged) {
      // Data comparison is linear in the supplied array; geometry work is local.
      // Adjacency rules are resolved here, so the animation layer needs no graph
      // of CSS dependencies and no scan of unchanged DOM bodies.
      const previous = new Map(
        previousItems.current.map((item, index) => [
          item.id,
          {
            item,
            gap: chatItemGap(item, previousItems.current[index - 1]),
          },
        ])
      );
      items.forEach((item, index) => {
        const old = previous.get(item.id);
        if (!old) inserted.push(item);
        if (!old || old.gap !== chatItemGap(item, items[index - 1]) || !sameChatItemContent(old.item, item)) {
          const row = rowRefs.current.get(item.id);
          if (row) affected.add(row);
        }
      });
      if (typingTurnedOff) {
        const previousTail = previousItems.current.at(-1);
        const tailIndex = previousTail ? items.findIndex((item) => item.id === previousTail.id) : -1;
        const appended = items.slice(tailIndex + 1);
        const first = appended[0];
        // Replacement transfers space at the old typing position. It requires an
        // on-to-off intent edge in this commit and a new suffix immediately after
        // the old tail. A mounted exit is not permission to move its footprint to
        // a later receive or a history insertion; those keep independent slots.
        if (
          (!previousTail || tailIndex >= 0) &&
          isChatMessage(first) &&
          first.variant === 'incoming' &&
          appended.every((item) => !previous.has(item.id))
        ) {
          replacementId = first.id;
        }
      }
    }
    previousItems.current = items;
    const bodies = inserted.flatMap(({ id }) => {
      const body = rowRefs.current.get(id)?.firstElementChild;
      return body instanceof HTMLElement ? [body] : [];
    });
    const entranceIds = new Set(
      inserted.filter((item) => !isChatMessage(item) || item.entrance !== 'flight').map(({ id }) => id)
    );
    const replacement =
      typingMounted && replacementId && !typingReplacing
        ? bodies.find((body) => body.dataset.chatItemId === replacementId)
        : undefined;
    // Stop and snapshot the old animation before the replacement slot takes over.
    const handoff = replacement ? replaceTypingWith(replacement) : undefined;
    if (itemsChanged) {
      insertionsRef.current?.insert(
        new Set(inserted.map(({ id }) => id)),
        inserted.some((item) => isChatMessage(item) && (item.scrollToBottom ?? item.variant === 'outgoing')),
        replacement && typing.rowRef.current && handoff
          ? { body: replacement, row: typing.rowRef.current, velocity: handoff.velocity }
          : undefined,
        affected
      );
    }
    if (!reducedMotion) {
      for (const body of bodies) {
        if (!entranceIds.has(body.dataset.chatItemId!)) continue;
        const fadeOnly = body === replacement;
        const animation = animateChatEntrance(
          body,
          Math.max(0.01, animationSpeed),
          () => entranceAnimations.current.delete(animation),
          { fadeOnly }
        );
        entranceAnimations.current.add(animation);
      }
    }
    if (!itemsChanged && !typing.preparingEntry) controllerRef.current?.layoutChanged();
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
        <ol
          ref={contentRef}
          className={cn(
            styles.list,
            'm-0 flex list-none flex-col overflow-clip p-5',
            bottomSpace && 'pb-0',
            contentClassName
          )}
        >
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
                ref={registerRow}
                data-chat-row-id={item.id}
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
          {bottomSpace && (
            <li
              ref={bottomSpaceRef}
              data-slot="chat-bottom-space"
              role="presentation"
              aria-hidden="true"
              className="shrink-0"
            />
          )}
        </ol>
      </div>
    </section>
  );
}
