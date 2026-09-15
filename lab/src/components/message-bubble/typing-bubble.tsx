import type { ComponentPropsWithoutRef } from 'react';

import './typing-bubble.css';

export type TypingBubbleProps = Omit<ComponentPropsWithoutRef<'output'>, 'children'>;

/** Incoming typing indicator with a 28px body in a 33px message row. */
export function TypingBubble(props: TypingBubbleProps) {
  return (
    <output aria-label="Typing" {...props} data-slot="typing-bubble">
      <span className="sr-only">{props['aria-label'] ?? 'Typing'}</span>
      <span data-slot="typing-bubble-body" aria-hidden="true">
        <span data-slot="typing-bubble-dot" />
        <span data-slot="typing-bubble-dot" />
        <span data-slot="typing-bubble-dot" />
      </span>
    </output>
  );
}
