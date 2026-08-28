import { cn } from '@monorepo/utils';
import { throttle, type ThrottledFunction } from 'es-toolkit';
import { FC, useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';

import { SimpleConsoleLogger } from './simple-console-logger.js';

export const SimpleConsoleRender: FC<{ console: SimpleConsoleLogger; className?: string }> = ({
  console,
  className,
}) => {
  const logs = useSyncExternalStore(console.subscribe, console.getLogs);
  const containerRef = useRef<HTMLDivElement>(null);

  const atBottom = useRef<boolean>(true);

  const updateAtBottom = useCallback((container: HTMLDivElement) => {
    const scrollHeight = container.scrollHeight;
    const scrollTop = container.scrollTop;
    const isAtBottom = scrollTop + container.clientHeight >= scrollHeight - 1.0;
    atBottom.current = isAtBottom;
  }, []);

  useLayoutEffect(() => {
    if (containerRef.current) {
      updateAtBottom(containerRef.current);
    }
  }, [updateAtBottom]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (atBottom.current) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  }, [logs, updateAtBottom]);

  // Build the throttle in an effect rather than in render. It was previously
  // an argument to useCallback, which meant a fresh throttle — timer state and
  // all — on every render for useCallback to keep the first and drop the rest.
  // An effect also keeps creation and cancellation in one place, so the timer
  // cannot outlive the mount, and it keeps `updateAtBottom` (which writes
  // atBottom.current) out of the render phase.
  const throttledUpdateRef = useRef<ThrottledFunction<typeof updateAtBottom> | null>(null);
  useEffect(() => {
    const throttled = throttle(updateAtBottom, 100, { edges: ['leading', 'trailing'] });
    throttledUpdateRef.current = throttled;
    return () => {
      throttled.cancel();
      throttledUpdateRef.current = null;
    };
  }, [updateAtBottom]);

  // Take the element off the event instead of off containerRef. `currentTarget`
  // is only valid while the event dispatches, so it has to be captured here and
  // handed to the trailing call as an argument.
  const handleScroll: React.UIEventHandler<HTMLDivElement> = (event) => {
    throttledUpdateRef.current?.(event.currentTarget);
  };

  return (
    <div
      className={cn(
        `
          grid h-[10lh] grid-cols-[auto_1fr] content-start items-stretch gap-x-2 gap-y-1 overflow-x-clip overflow-y-auto
          rounded-sm border border-neutral-500/30 p-2 font-mono text-sm whitespace-pre-wrap
        `,
        className
      )}
      onWheel={handleScroll}
      onTouchMove={handleScroll}
      ref={containerRef}
    >
      {logs.map((log, index) => (
        <>
          <span className="min-w-0 self-start justify-self-end opacity-70">
            {new Date(log.timestamp).toLocaleTimeString()}
          </span>
          <div className="min-w-0" key={index}>
            {log.message}
          </div>
        </>
      ))}
    </div>
  );
};
