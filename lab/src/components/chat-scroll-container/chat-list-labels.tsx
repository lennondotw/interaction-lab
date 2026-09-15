import { cn } from '@monorepo/utils';
import type { ComponentPropsWithoutRef } from 'react';

const labelClassName = 'm-0 block text-center text-xs text-neutral-500 dark:text-neutral-400';

/** Labels own their paint only; the enclosing list item owns spacing and motion. */
export function ChatDateLabel({ className, ...props }: ComponentPropsWithoutRef<'time'>) {
  return <time {...props} data-slot="chat-date-label" className={cn(labelClassName, className)} />;
}

export function ChatStatusLabel({ className, ...props }: ComponentPropsWithoutRef<'p'>) {
  return <p {...props} data-slot="chat-status-label" className={cn(labelClassName, className)} />;
}
