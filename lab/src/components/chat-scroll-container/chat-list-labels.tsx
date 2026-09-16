import { cn } from '@monorepo/utils';
import type { ComponentPropsWithoutRef } from 'react';

const labelClassName = 'm-0 block text-center text-xs text-neutral-500 dark:text-neutral-400';

/** Labels own their paint only; the enclosing list item owns spacing and motion. */
export function ChatDateLabel({ className, children, ...props }: ComponentPropsWithoutRef<'time'>) {
  return (
    <time {...props} data-slot="chat-date-label" className={cn(labelClassName, className)}>
      <span data-slot="chat-label-content" className="inline-block max-w-full align-top">
        {children}
      </span>
    </time>
  );
}

export function ChatStatusLabel({ className, children, ...props }: ComponentPropsWithoutRef<'p'>) {
  return (
    <p {...props} data-slot="chat-status-label" className={cn(labelClassName, className)}>
      <span data-slot="chat-label-content" className="inline-block max-w-full align-top">
        {children}
      </span>
    </p>
  );
}
