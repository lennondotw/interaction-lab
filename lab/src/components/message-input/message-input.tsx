import { cn } from '@monorepo/utils';
import { useLayoutEffect, useRef, type ComponentPropsWithoutRef } from 'react';

import styles from './message-input.module.css';

export type MessageInputProps = ComponentPropsWithoutRef<'textarea'>;

function resizeToContent(field: HTMLTextAreaElement | null) {
  if (!field) return;
  field.style.height = '0px';
  field.style.height = `${field.scrollHeight}px`;
}

/** The host owns width; the 35px single-line composer is sized independently of message bubbles. */
export function MessageInput({ className, value, defaultValue, onInput, ...props }: MessageInputProps) {
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => resizeToContent(fieldRef.current), [value, defaultValue]);

  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    let previousWidth = field.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const width = field.getBoundingClientRect().width;
      if (width === previousWidth) return;
      previousWidth = width;
      resizeToContent(field);
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, []);

  return (
    <span
      data-slot="message-input"
      className={cn('relative inline-flex min-w-0 overflow-hidden rounded-[18px]', className)}
    >
      <span
        aria-hidden="true"
        data-slot="message-input-blur"
        className="pointer-events-none absolute inset-0 backdrop-blur-md"
      />
      <span
        aria-hidden="true"
        data-slot="message-input-tint"
        className="pointer-events-none absolute -inset-px bg-white/75 dark:bg-[#2E2E2E]/75"
      />
      <textarea
        ref={fieldRef}
        aria-label="Message"
        placeholder="Message"
        rows={1}
        {...props}
        value={value}
        defaultValue={defaultValue}
        onInput={(event) => {
          resizeToContent(event.currentTarget);
          onInput?.(event);
        }}
        data-slot="message-input-field"
        className={styles.field}
      />
      <span
        aria-hidden="true"
        data-slot="message-input-border"
        className={cn(styles.border, 'pointer-events-none absolute inset-0 rounded-[inherit]')}
      />
    </span>
  );
}
