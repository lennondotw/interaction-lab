import { cn } from '@monorepo/utils';
import type { ComponentPropsWithoutRef } from 'react';

import styles from './typing-bubble.module.css';

export type TypingBubbleProps = Omit<ComponentPropsWithoutRef<'output'>, 'children'>;

/** Incoming typing indicator with a 28px body in a 33px message row. */
export function TypingBubble({ className, ...props }: TypingBubbleProps) {
  return (
    <output aria-label="Typing" {...props} data-slot="typing-bubble" className={cn(styles.bubble, className)}>
      <span className="sr-only">{props['aria-label'] ?? 'Typing'}</span>
      <span data-slot="typing-bubble-body" aria-hidden="true" className={styles.body}>
        <span data-slot="typing-bubble-dot" className={styles.dot} />
        <span data-slot="typing-bubble-dot" className={styles.dot} />
        <span data-slot="typing-bubble-dot" className={styles.dot} />
      </span>
    </output>
  );
}
