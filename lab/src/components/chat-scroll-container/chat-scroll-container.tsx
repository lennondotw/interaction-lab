import { cn } from '@monorepo/utils';
import { useReducedMotion } from 'motion/react';
import { useLayoutEffect, useRef, type ComponentPropsWithoutRef } from 'react';

import { MessageBubble } from '../message-bubble/index.js';
import { createChatScrollController, type ChatScrollState } from './chat-scroll-controller.js';

import './chat-scroll-container.css';

export type { ChatScrollState } from './chat-scroll-controller.js';

export interface ChatMessage {
  id: string;
  content: string;
  variant: 'incoming' | 'outgoing';
}

export interface ChatScrollContainerProps extends ComponentPropsWithoutRef<'section'> {
  messages: readonly ChatMessage[];
  bottomThreshold?: number;
  contentClassName?: string;
  onScrollStateChange?: (state: ChatScrollState) => void;
}

/** The host supplies the container's width and height; only the message list scrolls. */
export function ChatScrollContainer({
  messages,
  bottomThreshold = 2,
  contentClassName,
  onScrollStateChange,
  className,
  ...props
}: ChatScrollContainerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLOListElement>(null);
  const controllerRef = useRef<ReturnType<typeof createChatScrollController> | null>(null);
  const previousLastId = useRef(messages.at(-1)?.id);
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    if (!viewportRef.current || !contentRef.current) return;
    const controller = createChatScrollController(viewportRef.current, contentRef.current, {
      threshold: 2,
      reducedMotion: true,
    });
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    controllerRef.current?.updateOptions({
      threshold: Math.max(0, bottomThreshold),
      reducedMotion: reducedMotion === true,
      onStateChange: onScrollStateChange,
    });
  }, [bottomThreshold, reducedMotion, onScrollStateChange]);

  useLayoutEffect(() => {
    const previousIndex = messages.findIndex((message) => message.id === previousLastId.current);
    const appended =
      previousLastId.current === undefined ? messages : previousIndex >= 0 ? messages.slice(previousIndex + 1) : [];
    controllerRef.current?.contentChanged(appended.some((message) => message.variant === 'outgoing'));
    previousLastId.current = messages.at(-1)?.id;
  }, [messages]);

  return (
    <section
      aria-label="Chat messages"
      {...props}
      data-slot="chat-scroll-container"
      className={cn(
        'min-h-0 min-w-0 overflow-clip rounded-lg border border-black/10 bg-white scheme-light has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-1 has-[:focus-visible]:outline-neutral-400 dark:border-white/15 dark:bg-[#1E1E1E] dark:scheme-dark',
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
        <ol ref={contentRef} className={cn('m-0 flex list-none flex-col p-5', contentClassName)}>
          {messages.map((message, index) => (
            <li
              key={message.id}
              className={cn('min-w-0 max-w-[80%]', message.variant === 'outgoing' ? 'self-end' : 'self-start')}
            >
              <MessageBubble variant={message.variant} tail={messages[index + 1]?.variant !== message.variant}>
                {message.content}
              </MessageBubble>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
