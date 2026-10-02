import { useEffect, useState } from 'react';

/**
 * Nominal rate for a producer driven by rAF. Calibrate from the display clock once, rather
 * than resizing bars from the producer's fluctuating throughput or pauses. Until the
 * calibration completes, the host uses a nominal 60Hz clock.
 */
export function useDisplaySampleRate(): number {
  const [rate, setRate] = useState(60);
  useEffect(() => {
    const intervals: number[] = [];
    let previous: number | null = null;
    let handle: number;
    const sample = (timestamp: number) => {
      if (previous !== null) intervals.push(timestamp - previous);
      previous = timestamp;
      if (intervals.length === 60) {
        intervals.sort((a, b) => a - b);
        setRate(1000 / intervals[30]!);
      } else {
        handle = requestAnimationFrame(sample);
      }
    };
    handle = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(handle);
  }, []);
  return rate;
}
