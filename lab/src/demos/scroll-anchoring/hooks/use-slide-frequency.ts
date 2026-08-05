import { useEffect, useRef } from 'react';

export const useSlidingFrequency = (windowSize = 1000, interval = 200, onFreqUpdate?: (freq: number) => void) => {
  const history = useRef<number[]>([]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = performance.now();
      history.current = history.current.filter((t) => now - t < windowSize);
      onFreqUpdate?.((history.current.length * 1000) / windowSize);
    }, interval);
    return () => clearInterval(id);
  }, [windowSize, interval, onFreqUpdate]);

  const track = () => {
    history.current.push(performance.now());
    history.current = history.current.filter((t) => performance.now() - t < windowSize);
  };

  return { track };
};
