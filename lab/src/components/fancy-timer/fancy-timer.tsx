import { useAnimationFrame } from 'motion/react';
import { ComponentProps, forwardRef, Ref, useCallback, useImperativeHandle, useRef } from 'react';

import { formatTime } from './timer-utils.js';

type FancyTimerProps = Omit<ComponentProps<'div'>, 'children' | 'ref'> & {
  ref?: Ref<FancyTimerRef>;
};

export interface FancyTimerRef {
  start: () => void;
  pause: () => void;
  reset: () => void;
}

export const FancyTimer = forwardRef<FancyTimerRef, FancyTimerProps>(function Timer(props, ref) {
  const isRunningRef = useRef(false);
  const startTimeRef = useRef(0);
  const totalPausedRef = useRef(0);
  const lastPauseStartRef = useRef(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const getCurrentElapsed = useCallback(() => {
    if (!isRunningRef.current || startTimeRef.current === 0) return 0;
    return performance.now() - startTimeRef.current - totalPausedRef.current;
  }, []);

  const updateDisplay = useCallback(() => {
    if (contentRef.current) {
      contentRef.current.textContent = formatTime(getCurrentElapsed() / 1000);
    }
  }, [getCurrentElapsed]);

  useAnimationFrame(() => {
    if (isRunningRef.current) {
      updateDisplay();
    }
  });

  const start = useCallback(() => {
    if (isRunningRef.current) return;

    if (startTimeRef.current === 0) {
      // First start
      startTimeRef.current = performance.now();
      totalPausedRef.current = 0;
    } else {
      // Resume from pause
      totalPausedRef.current += performance.now() - lastPauseStartRef.current;
    }

    isRunningRef.current = true;
  }, []);

  const pause = useCallback(() => {
    if (!isRunningRef.current) return;

    isRunningRef.current = false;
    lastPauseStartRef.current = performance.now();
  }, []);

  const reset = useCallback(() => {
    isRunningRef.current = false;
    startTimeRef.current = 0;
    totalPausedRef.current = 0;
    lastPauseStartRef.current = 0;
    updateDisplay();
  }, [updateDisplay]);

  useImperativeHandle(ref, () => ({
    start,
    pause,
    reset,
  }));

  return (
    <div ref={contentRef} {...props}>
      {/* should be 0 at initial render */}
      {}
      {formatTime(getCurrentElapsed() / 1000)}
    </div>
  );
});
