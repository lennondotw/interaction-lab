import type { Meta, StoryObj } from '@storybook/react-vite';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';

import { LiveScope, type LiveScopeSample } from './live-scope.js';

/**
 * The component ships styleless — no border, no background, no radius, no height. Every story
 * below supplies its own chrome through `className`, which is how a consumer is meant to use
 * it, and the last one removes the chrome entirely to get a sparkline out of the same code.
 */
const meta: Meta = {
  title: 'Instruments/Live scope',
  parameters: { layout: 'centered' },
};

export default meta;

/**
 * Somewhere to keep samples that is not React state, because `read` runs at refresh rate and
 * a producer at 60Hz would otherwise mean a re-render per sample.
 */
class Series {
  private readonly buffer: LiveScopeSample[] = [];

  push(value: number): void {
    this.buffer.push({ at: performance.now(), value });
    if (this.buffer.length > 800) this.buffer.shift();
  }

  since(fromAt: number): LiveScopeSample[] {
    // A linear scan from the front is fine at this size; a deeper buffer would binary-search
    // the cutoff instead.
    let start = 0;
    while (start < this.buffer.length && (this.buffer[start]?.at ?? 0) < fromAt) start++;
    return this.buffer.slice(start);
  }

  get size(): number {
    return this.buffer.length;
  }
}

const CHROME = `
  h-24 w-[36rem] rounded-lg border border-neutral-200 bg-neutral-50
  dark:border-neutral-800 dark:bg-neutral-900/50
`;

/**
 * The shape of the *producer* is what the scope exists to show, so each mode is a different
 * one. Steady looks like an ordinary bar chart; bursty and idle only read correctly because
 * the x axis is wall-clock time; spiky is there to watch the axis move.
 */
type Mode = 'steady' | 'bursty' | 'idle-then-busy' | 'spiky';

const NOTES: Record<Mode, string> = {
  steady: 'A sample every frame — the one case where sample index and wall-clock time would look alike.',
  bursty: 'Twelve frames of four samples, then twenty-eight of nothing. Indexing by sample would close the silence up.',
  'idle-then-busy': 'One second producing, one second stopped. The gaps are the information.',
  spiky: 'A rare spike far above the baseline. Watch the axis stretch, then ease back once it scrolls out.',
};

const Harness: FC<{ mode: Mode }> = ({ mode }) => {
  const series = useMemo(() => new Series(), []);
  const read = useCallback((fromAt: number) => series.since(fromAt), [series]);
  const [retained, setRetained] = useState(0);

  useEffect(() => {
    let tick = 0;
    // An interval rather than rAF, deliberately: the producer is allowed to be irregular and
    // out of step with the display, and the scope should still scroll smoothly.
    const produce = setInterval(() => {
      tick++;
      if (mode === 'steady') {
        series.push(0.3 + 0.1 * Math.sin(tick / 6));
      } else if (mode === 'spiky') {
        series.push(tick % 37 === 0 ? 14 + Math.random() * 6 : 0.3 + Math.random() * 0.2);
      } else if (mode === 'bursty') {
        if (tick % 40 < 12) for (let i = 0; i < 4; i++) series.push(0.4 + Math.random() * 1.2);
      } else if (Math.floor(tick / 60) % 2 === 1) {
        series.push(0.5 + Math.random() * 0.6);
      }
    }, 16);
    // The count is text, so it updates on a human timescale rather than once per sample.
    const label = setInterval(() => setRetained(series.size), 250);
    return () => {
      clearInterval(produce);
      clearInterval(label);
    };
  }, [mode, series]);

  return (
    <div className="flex w-xl flex-col gap-2">
      <div className="flex flex-row items-baseline justify-between font-mono text-[10px] text-neutral-400">
        <span>{mode}</span>
        <span>{retained} samples retained</span>
      </div>
      <LiveScope read={read} minScale={0.5} threshold={16.7} className={CHROME} />
      <p className="max-w-prose text-xs/relaxed text-neutral-500">{NOTES[mode]}</p>
    </div>
  );
};

export const Steady: StoryObj = { render: () => <Harness mode="steady" /> };

export const Bursty: StoryObj = { render: () => <Harness mode="bursty" /> };

export const IdleThenBusy: StoryObj = { render: () => <Harness mode="idle-then-busy" /> };

/**
 * The y axis is zero-based and its top follows the tallest sample *currently visible*, eased
 * rather than snapped. A spike stretches it; once the spike scrolls out of the window the axis
 * comes back down instead of staying stretched by a peak nobody can see.
 */
export const DynamicAxis: StoryObj = { render: () => <Harness mode="spiky" /> };

/** No gutter, no ticks, no chrome: the same component as a sparkline. */
export const Sparkline: StoryObj = {
  render: () => {
    const series = useMemo(() => new Series(), []);
    const read = useCallback((fromAt: number) => series.since(fromAt), [series]);

    useEffect(() => {
      let tick = 0;
      const id = setInterval(() => {
        tick++;
        series.push(0.4 + 0.3 * Math.sin(tick / 9) + Math.random() * 0.1);
      }, 16);
      return () => clearInterval(id);
    }, [series]);

    return <LiveScope read={read} axisWidth={0} ticks={0} barWidth={1} minScale={0.5} className="h-8 w-64" />;
  },
};
