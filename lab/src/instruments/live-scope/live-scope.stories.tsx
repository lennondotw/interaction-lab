import { cn } from '@monorepo/utils';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';

import { ResizableWindow } from '#src/instruments/resizable-window/resizable-window.js';

import { LiveScope, type LiveScopeProps, type LiveScopeSample } from './live-scope.js';
import { SampleHistory } from './sample-history.js';

/**
 * Every story below supplies its plot background through `plotClassName` and its size
 * through `className`. Hiding the axes also hides the frame for a plain sparkline.
 */
type ScopeStoryArgs = Omit<LiveScopeProps, 'read' | 'formatTick'>;

const CHROME = `
  bg-neutral-50
  dark:bg-neutral-900/50
`;
const SAMPLE_INTERVAL_MS = 16;
const SAMPLE_RATE = 1000 / SAMPLE_INTERVAL_MS;

const meta: Meta<ScopeStoryArgs> = {
  title: 'Instruments/Live scope',
  args: {
    pixelsPerSecond: 120,
    sampleRate: SAMPLE_RATE,
    minScale: 0.5,
    headroom: 1.15,
    ticks: 4,
    threshold: 16.7,
    axisWidth: 40,
    colors: {},
    className: '',
    plotClassName: CHROME,
  },
  argTypes: {
    pixelsPerSecond: {
      description: 'Horizontal speed in CSS px/s. Wider plots reveal more history at the same speed.',
      control: { type: 'range', min: 30, max: 600, step: 10 },
      table: { defaultValue: { summary: '120' } },
    },
    sampleRate: {
      description: 'Expected sampling frequency in Hz; sets bar width. The demo producer stays at 62.5 Hz.',
      control: { type: 'range', min: 1, max: 240, step: 0.5 },
    },
    minScale: {
      description: 'Minimum y-axis top, even when the visible samples are smaller.',
      control: { type: 'number', min: 0.01, step: 0.1 },
      table: { defaultValue: { summary: '1' } },
    },
    headroom: {
      description: 'Multiplier applied to the visible peak before the y-axis spring follows it.',
      control: { type: 'range', min: 1, max: 3, step: 0.05 },
      table: { defaultValue: { summary: '1.15' } },
    },
    ticks: {
      description: 'Y-axis divisions. The frame supplies the top and bottom rules.',
      control: { type: 'range', min: 0, max: 10, step: 1 },
      table: { defaultValue: { summary: '4' } },
    },
    threshold: {
      description: 'Samples at or above this value use barOverThreshold.',
      control: { type: 'number', step: 0.1 },
    },
    axisWidth: {
      description: 'Axis gutter in CSS px. Zero hides the labels and frame; captions follow the plot edge.',
      control: { type: 'range', min: 0, max: 100, step: 1 },
      table: { defaultValue: { summary: '40' } },
    },
    colors: {
      description:
        'Overrides for grid, axis, label, bar, and barOverThreshold. Keep axis opaque; frame opacity applies to the whole layer.',
      control: 'object',
    },
    className: {
      description: 'Classes added to the scope, including sizing overrides.',
      control: 'text',
    },
    plotClassName: {
      description: 'Plot background classes, excluding the axis gutter.',
      control: 'text',
    },
  },
  parameters: { layout: 'centered' },
};

export default meta;

type Story = StoryObj<ScopeStoryArgs>;

/**
 * Somewhere to keep samples that is not React state, because `read` runs at refresh rate and
 * a producer at 60Hz would otherwise mean a re-render per sample.
 */
class Series {
  private readonly history = new SampleHistory<LiveScopeSample>();

  push(value: number): void {
    this.history.push({ at: performance.now(), value });
  }

  since(fromAt: number): LiveScopeSample[] {
    return this.history.since(fromAt);
  }

  get size(): number {
    return this.history.size;
  }
}

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
  spiky: 'A rare spike far above the baseline. Watch the axis stretch, then spring back once it scrolls out.',
};

const Harness: FC<ScopeStoryArgs & { mode: Mode; fill?: boolean; caption?: string }> = ({
  mode,
  fill = false,
  caption,
  axisWidth = 40,
  className,
  ...scopeArgs
}) => {
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
    }, SAMPLE_INTERVAL_MS);
    // The count is text, so it updates on a human timescale rather than once per sample.
    const label = setInterval(() => setRetained(series.size), 250);
    return () => {
      clearInterval(produce);
      clearInterval(label);
    };
  }, [mode, series]);

  return (
    <div className={cn('flex flex-col gap-2', fill ? 'size-full' : 'w-xl')}>
      <div
        className="flex shrink-0 flex-row items-baseline justify-between font-mono text-[10px] text-neutral-400"
        style={{ paddingLeft: axisWidth }}
      >
        <span>{mode}</span>
        <span>{retained} samples retained</span>
      </div>
      <LiveScope
        {...scopeArgs}
        read={read}
        axisWidth={axisWidth}
        className={cn('w-full', fill ? 'min-h-0 flex-1' : 'h-24', className)}
      />
      <p className="max-w-prose shrink-0 text-xs/relaxed text-neutral-500" style={{ marginLeft: axisWidth }}>
        {caption ?? NOTES[mode]}
      </p>
    </div>
  );
};

export const Steady: Story = { render: (args) => <Harness {...args} mode="steady" /> };

export const Bursty: Story = { render: (args) => <Harness {...args} mode="bursty" /> };

export const IdleThenBusy: Story = { render: (args) => <Harness {...args} mode="idle-then-busy" /> };

/**
 * The y axis is zero-based and its top follows the tallest sample *currently visible* with a
 * spring. A spike stretches it; once the spike scrolls out of the window the axis
 * comes back down instead of staying stretched by a peak nobody can see.
 */
export const DynamicAxis: Story = { render: (args) => <Harness {...args} mode="spiky" /> };

export const Resizable: Story = {
  parameters: { layout: 'fullscreen' },
  render: (args) => (
    <div className="flex min-h-svh items-start p-8">
      <ResizableWindow
        title="Live scope"
        label="Resizable live scope"
        initialSize={{ width: 640, height: 280 }}
        minimumSize={{ width: 280, height: 200 }}
      >
        <Harness
          {...args}
          mode="steady"
          fill
          caption={`Drag the edges: ${args.pixelsPerSecond}px/s stays fixed; a wider plot reveals older samples.`}
        />
      </ResizableWindow>
    </div>
  ),
};

/** No gutter, no ticks, no chrome: the same component as a sparkline. */
export const Sparkline: Story = {
  args: { pixelsPerSecond: 60, axisWidth: 0, ticks: 0, plotClassName: '' },
  render: (args) => {
    const series = useMemo(() => new Series(), []);
    const read = useCallback((fromAt: number) => series.since(fromAt), [series]);

    useEffect(() => {
      let tick = 0;
      const id = setInterval(() => {
        tick++;
        series.push(0.4 + 0.3 * Math.sin(tick / 9) + Math.random() * 0.1);
      }, SAMPLE_INTERVAL_MS);
      return () => clearInterval(id);
    }, [series]);

    return <LiveScope {...args} read={read} className={cn('h-8 w-64', args.className)} />;
  },
};
