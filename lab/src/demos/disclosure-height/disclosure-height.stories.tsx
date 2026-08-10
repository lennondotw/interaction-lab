import type { Meta, StoryObj } from '@storybook/react-vite';
import { useCallback, useRef, useState, type FC, type ReactNode } from 'react';

import type { FileTreeNode } from '#src/components/file-tree/file-tree-model.js';

import { DisclosureTree, type DisclosureMode } from './disclosure-tree.js';

const PARENT = '/Applications';
const CHILD = '/Applications/Utilities';

/**
 * The exact shape the artefact needs: a folder with three children, one of which is
 * itself a folder with three children, and siblings below it so the displacement has
 * something to displace.
 */
const nodes: FileTreeNode[] = [
  {
    children: [
      {
        children: [
          { id: `${CHILD}/Activity Monitor.app`, name: 'Activity Monitor.app' },
          { id: `${CHILD}/Disk Utility.app`, name: 'Disk Utility.app' },
          { id: `${CHILD}/Terminal.app`, name: 'Terminal.app' },
        ],
        id: CHILD,
        name: 'Utilities',
      },
      { id: `${PARENT}/Safari.app`, name: 'Safari.app' },
      { id: `${PARENT}/System Settings.app`, name: 'System Settings.app' },
    ],
    id: PARENT,
    name: 'Applications',
  },
  { children: [{ id: '/Library/Fonts', name: 'Fonts' }], id: '/Library', name: 'Library' },
  { children: [], id: '/System', name: 'System' },
  { id: '/mach_kernel', name: 'mach_kernel' },
];

interface Trace {
  /** Largest movement of the row below the subtree in a single frame. */
  maxStep: number;
  /** Longest run of frames where nothing moved *while the disclosure was still running*. */
  stallMs: number;
  /** Where the row below ended up, relative to where it started. */
  travelled: number;
  /** Normalised series for the sparkline. */
  series: number[];
}

const measure = (samples: { t: number; top: number }[]): Trace => {
  const first = samples[0];
  const last = samples.at(-1);

  if (first === undefined || last === undefined) return { maxStep: 0, series: [], stallMs: 0, travelled: 0 };

  const travelled = last.top - first.top;
  let maxStep = 0;
  // The disclosure is "still running" until the row below first reaches its final
  // position; a stall after that is just the tail of the recording.
  let settledAt = samples.length - 1;

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];
    if (sample !== undefined && Math.abs(sample.top - last.top) < 0.5) {
      settledAt = i;
      break;
    }
  }

  let stallMs = 0;
  let runStart: number | null = null;

  for (let i = 1; i <= settledAt; i += 1) {
    const previous = samples[i - 1];
    const current = samples[i];

    if (previous === undefined || current === undefined) continue;

    const step = Math.abs(current.top - previous.top);
    maxStep = Math.max(maxStep, step);

    if (step < 0.5) {
      runStart ??= previous.t;
      stallMs = Math.max(stallMs, current.t - runStart);
    } else {
      runStart = null;
    }
  }

  return {
    maxStep: Math.round(maxStep * 10) / 10,
    series: samples.map((s) => (travelled === 0 ? 0 : (s.top - first.top) / travelled)),
    stallMs: Math.round(stallMs),
    travelled: Math.round(travelled),
  };
};

/**
 * The recorded travel of the row below the subtree, over time.
 *
 * The reason to plot it rather than print a number: the `length` mode's failure is a
 * *shape* — a ramp, a flat run, then a cliff — and a cliff in a 40-sample series is
 * unmistakable in a way that "max step: 156px" is not.
 */
const Sparkline: FC<{ series: number[]; className?: string }> = ({ className, series }) => {
  if (series.length < 2) return null;

  const points = series.map((v, i) => `${(i / (series.length - 1)) * 100},${(1 - v) * 100}`).join(' ');

  return (
    <svg className={className} preserveAspectRatio="none" viewBox="0 0 100 100">
      <polyline fill="none" points={points} stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

const Panel: FC<{ title: string; subtitle: string; trace: Trace | null; children: ReactNode }> = ({
  children,
  subtitle,
  title,
  trace,
}) => (
  <div className="flex min-w-0 flex-1 flex-col gap-3">
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-xs text-neutral-500">{title}</span>
      <span className="font-mono text-[11px] text-neutral-400">{subtitle}</span>
    </div>

    <div
      className={`
        flex h-24 items-stretch gap-3 rounded-lg bg-black/3
        dark:bg-white/5
      `}
    >
      <Sparkline className="h-full flex-1 text-blue-500 dark:text-blue-400" series={trace?.series ?? []} />
      <div className="flex w-28 shrink-0 flex-col justify-center gap-1 pr-3 font-mono text-[11px]">
        <span className={trace && trace.maxStep > 60 ? 'text-red-500' : 'text-neutral-500'}>
          step {trace ? `${trace.maxStep}px` : '—'}
        </span>
        <span className={trace && trace.stallMs > 30 ? 'text-red-500' : 'text-neutral-500'}>
          stall {trace ? `${trace.stallMs}ms` : '—'}
        </span>
        <span className="text-neutral-400">moved {trace ? `${trace.travelled}px` : '—'}</span>
      </div>
    </div>

    {children}
  </div>
);

const button = `
  cursor-pointer rounded-lg bg-black/5 px-3 py-1.5 text-sm
  hover:bg-black/10
  disabled:cursor-default disabled:opacity-40
  dark:bg-white/10 dark:hover:bg-white/16
`;

/**
 * Both modes, driven from one replay so the only difference on screen is the
 * mechanism.
 */
const Comparison: FC = () => {
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [delay, setDelay] = useState(150);
  const [running, setRunning] = useState(false);
  const [traces, setTraces] = useState<Record<DisclosureMode, Trace | null>>({ length: null, ratio: null });

  const markers = useRef<Record<DisclosureMode, HTMLDivElement | null>>({ length: null, ratio: null });

  const toggle = useCallback((id: string) => {
    setExpandedIds((current) => (current.includes(id) ? current.filter((v) => v !== id) : [...current, id]));
  }, []);

  const replay = async (): Promise<void> => {
    setRunning(true);
    setTraces({ length: null, ratio: null });

    // Start from fully closed, and let any animation in flight finish first —
    // otherwise the replay measures the tail of the previous one.
    setExpandedIds([]);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const samples: Record<DisclosureMode, { t: number; top: number }[]> = { length: [], ratio: [] };
    const t0 = performance.now();
    let interrupted = false;

    setExpandedIds([PARENT]);

    await new Promise<void>((resolve) => {
      const tick = (): void => {
        const now = performance.now() - t0;

        for (const mode of ['length', 'ratio'] as const) {
          const marker = markers.current[mode];
          if (marker) samples[mode].push({ t: now, top: marker.getBoundingClientRect().top });
        }

        if (!interrupted && now > delay) {
          interrupted = true;
          setExpandedIds([PARENT, CHILD]);
        }

        if (now < 900) requestAnimationFrame(tick);
        else resolve();
      };

      requestAnimationFrame(tick);
    });

    setTraces({ length: measure(samples.length), ratio: measure(samples.ratio) });
    setRunning(false);
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-2 py-8">
      <div className="flex flex-wrap items-center gap-4">
        <button className={button} disabled={running} type="button" onClick={() => void replay()}>
          {running ? 'Recording…' : 'Replay the interrupt'}
        </button>

        <label className="flex items-center gap-2 font-mono text-xs text-neutral-500">
          interrupt after
          <input
            max={400}
            min={0}
            step={10}
            type="range"
            value={delay}
            onChange={(event) => setDelay(Number(event.currentTarget.value))}
          />
          <span className="w-12 tabular-nums">{delay}ms</span>
        </label>

        <button className={button} disabled={running} type="button" onClick={() => setExpandedIds([])}>
          Collapse all
        </button>
      </div>

      <p className="m-0 max-w-prose text-sm/relaxed text-neutral-500">
        Both trees share one expansion state, one spring and one set of icons. Replay opens <code>Applications</code>,
        waits, then opens <code>Utilities</code> inside it — the second expand lands while the first is still in flight.
        Watch the rows below the subtree.
      </p>

      <div className="flex flex-col gap-8 md:flex-row md:gap-6">
        <Panel subtitle="animate height 0 -> auto" title="length — what ships today" trace={traces.length}>
          <DisclosureTree expandedIds={expandedIds} mode="length" nodes={nodes} onToggle={toggle} />
          <div ref={(node) => void (markers.current.length = node)} className="h-px w-full bg-red-500/40" />
        </Panel>

        <Panel subtitle="animate grid-template-rows 0fr -> 1fr" title="ratio — proposed" trace={traces.ratio}>
          <DisclosureTree expandedIds={expandedIds} mode="ratio" nodes={nodes} onToggle={toggle} />
          <div ref={(node) => void (markers.current.ratio = node)} className="h-px w-full bg-red-500/40" />
        </Panel>
      </div>
    </div>
  );
};

const meta: Meta<typeof DisclosureTree> = {
  title: 'Demos/DisclosureHeight',
  component: DisclosureTree,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof DisclosureTree>;

/**
 * Two trees, one replay, both modes measured.
 *
 * The `length` tree animates `height: 0 → auto`, which motion resolves by measuring
 * the box once, on the frame the animation starts. When the nested folder opens after
 * that, the parent is already flying at a target 156px short of the content it now
 * has: it pins there, clipping the lower half of the subtree, and then the frame that
 * finishes the animation writes `height: auto` back and everything below steps down
 * at once.
 *
 * The `ratio` tree animates `grid-template-rows: 0fr → 1fr`. The animation carries a
 * dimensionless fraction, so there is no length to go stale — what the fraction is a
 * fraction *of* is resolved by layout on every frame, and the nested folder's growth
 * pushes its parent open on the same frame it happens.
 *
 * The plot is the travel of the marker under each tree, normalised. `length` draws a
 * ramp, a flat run and a cliff; `ratio` draws one curve. Move the slider to see that
 * the artefact depends on *when* the second expand lands: at `0ms` it usually beats
 * motion's keyframe-resolution frame and the target comes out correct, so the cliff
 * disappears — which is exactly why this was hard to catch by hand.
 */
export const Interrupted: Story = {
  parameters: {
    controls: { disable: true },
  },
  render: () => <Comparison />,
};
