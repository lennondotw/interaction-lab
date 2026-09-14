import { cn } from '@monorepo/utils';
import { useLayoutEffect, useRef, type ComponentPropsWithoutRef } from 'react';

import { MessageBubble } from '../message-bubble/index.js';

export interface ChatMessage {
  id: string;
  content: string;
  variant: 'incoming' | 'outgoing';
}

export interface ChatScrollContainerProps extends ComponentPropsWithoutRef<'section'> {
  messages: readonly ChatMessage[];
}

/** The host supplies the container's width and height; only the message list scrolls. */
export function ChatScrollContainer({ messages, className, ...props }: ChatScrollContainerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    // Set the initial position before paint; later updates preserve the user's scroll position.
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior: 'instant' });
  }, []);

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
        className="size-full overflow-y-auto rounded-[calc(var(--radius-lg)-1px)] outline-none"
      >
        <ol className="m-0 flex list-none flex-col gap-3 p-5">
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
