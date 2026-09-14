import type { ComponentPropsWithoutRef } from 'react';

import './message-bubble.css';

export interface MessageBubbleProps extends ComponentPropsWithoutRef<'div'> {
  /** Outgoing blue or incoming neutral; positioning belongs to the parent. */
  variant?: 'outgoing' | 'incoming';
  /** Show the curved tail at the sender's side. */
  tail?: boolean;
}

/** A content-sized, static message. The parent supplies the available width. */
export function MessageBubble({
  variant = 'outgoing',
  tail = true,
  className,
  children,
  ...props
}: MessageBubbleProps) {
  return (
    <div
      {...props}
      data-slot="message-bubble"
      data-variant={variant}
      data-tail={tail || undefined}
      className={className}
    >
      <div data-slot="message-bubble-content">{children}</div>
    </div>
  );
}
