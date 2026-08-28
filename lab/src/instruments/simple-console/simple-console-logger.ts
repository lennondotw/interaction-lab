import { useMemo } from 'react';

export const createSimpleConsoleLogger = () => {
  let subscriptions: (() => void)[] = [];
  let logs: { message: string; timestamp: number }[] = [];
  let notifying = false;

  /**
   * Tell the subscribers, but not before the render that produced the log has finished.
   *
   * A log can arrive *during* render — that is exactly what `Studies/React render timing`
   * logs — and notifying there sets state on the console while a different component is
   * rendering, which React reports at runtime. The entry itself is appended synchronously,
   * so the sequence the log is there to show is unaffected; only the telling waits.
   *
   * Coalesced, so a render that logs eight lines wakes the console once rather than eight
   * times.
   */
  const notify = () => {
    if (notifying) return;

    notifying = true;
    queueMicrotask(() => {
      notifying = false;
      subscriptions.forEach((sub) => sub());
    });
  };

  return {
    log: (message: string) => {
      logs = [...logs, { message, timestamp: Date.now() }];
      notify();
    },
    getLogs: () => logs,
    subscribe: (callback: () => void) => {
      subscriptions.push(callback);
      return () => {
        subscriptions = subscriptions.filter((sub) => sub !== callback);
      };
    },
  };
};

export type SimpleConsoleLogger = ReturnType<typeof createSimpleConsoleLogger>;

export const useSimpleConsoleLogger = () => {
  const simpleLogger = useMemo(() => createSimpleConsoleLogger(), []);
  return simpleLogger;
};
