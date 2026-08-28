import { useMemo } from 'react';

export const createSimpleConsoleLogger = () => {
  let subscriptions: (() => void)[] = [];
  let logs: { message: string; timestamp: number }[] = [];

  return {
    log: (message: string) => {
      logs = [...logs, { message, timestamp: Date.now() }];
      subscriptions.forEach((sub) => sub());
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
