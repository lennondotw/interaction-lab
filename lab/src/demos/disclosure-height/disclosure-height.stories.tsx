import type { Meta, StoryObj } from '@storybook/react-vite';
import { useCallback, useRef, useState, type FC, type ReactNode } from 'react';

import { WireframeTree, type DisclosureMode, type WireNode } from './wireframe-tree.js';

const PARENT = 'applications';
const CHILD = 'utilities';

/**
 * The shape the artefact needs: a folder with three children, one of which is itself a
 * folder with three, and siblings below so the displacement has something to displace.
 */
const nodes: WireNode[] = [
  {
    children: [{ children: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], id: CHILD }, { id: 'safari' }, { id: 'settings' }],
    id: PARENT,
  },
  { children: [{ id: 'fonts' }], id: 'library' },
  { children: [], id: 'system' },
  { id: 'kernel' },
];

const MODES: { mode: DisclosureMode; title: string; subtitle: string }[] = [
  { mode: 'length', subtitle: 'height: 0 -> auto', title: 'length — ships today' },
  { mode: 'ratio', subtitle: 'grid-template-rows: 0fr -> 1fr', title: 'ratio' },
  { mode: 'arithmetic', subtitle: 'height: 0 -> count * pitch', title: 'arithmetic' },
  { mode: 'observed', subtitle: 'height: 0 -> measured, re-issued', title: 'observed' },
];

interface Trace {
  /** Largest movement of the row below the subtree in a single frame. */
  maxStep: number;
  /** Longest run of frames where nothing moved *while the disclosure was running*. */
  stallMs: number;
  /** When the row below first reached its final position. */
  settleMs: number;
  travelled: number;
  /** Normalised series for the plot. */
  series: number[];
}

const EMPTY: Trace = { maxStep: 0, series: [], settleMs: 0, stallMs: 0, travelled: 0 };

const measure = (samples: { t: number; top: number }[]): Trace => {
  const first = samples[0];
  const last = samples.at(-1);

  if (first === undefined || last === undefined) return EMPTY;

  const travelled = last.top - first.top;
  let settledAt = samples.length - 1;

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];

    if (sample !== undefined && Math.abs(sample.top - last.top) < 0.5) {
      settledAt = i;
      break;
    }
  }

  let maxStep = 0;
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
    settleMs: Math.round(samples[settledAt]?.t ?? 0),
    stallMs: Math.round(stallMs),
    travelled: Math.round(travelled),
  };
};

/**
 * The recorded travel of the marker under each tree, over time.
 *
 * Plotted rather than only tabulated because `length`'s failure is a *shape* — ramp,
 * flat run, cliff — and a cliff is unmistakable in a way that "max step 152px" is not.
 *
 * `overflow-visible` plus a padded wrapper, because the polyline runs along the
 * viewBox edges: with `preserveAspectRatio="none"` and `non-scaling-stroke`, half of
 * the 2px stroke would otherwise be clipped on all four sides, flattening the top of
 * every curve and shaving the first and last sample. Insetting the plot in user units
 * instead would need to know the rendered size, since the two axes are scaled by
 * different factors while the stroke is not scaled at all.
 */
const Plot: FC<{ series: number[] }> = ({ series }) => (
  // `shrink-0` and no `flex-1`: `flex-1` sets `flex-basis: 0%`, which replaces the
  // declared height as the item's main size, so `h-20` next to it is dead and the box
  // grows to whatever free space it is handed instead of staying 80px.
  <div className="flex h-20 shrink-0 items-stretch p-1">
    {series.length < 2 ? null : (
      <svg
        className="size-full overflow-visible text-blue-500 dark:text-blue-400"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        <polyline
          fill="none"
          points={series.map((v, i) => `${(i / (series.length - 1)) * 100},${(1 - v) * 100}`).join(' ')}
          stroke="currentColor"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    )}
  </div>
);

const Metric: FC<{ label: string; value: string; bad?: boolean }> = ({ bad = false, label, value }) => (
  <div className="flex items-baseline justify-between gap-2 font-mono text-[11px]">
    <span className="text-neutral-400">{label}</span>
    <span className={bad ? 'text-red-500 tabular-nums' : 'text-neutral-500 tabular-nums'}>{value}</span>
  </div>
);

const Panel: FC<{ title: string; subtitle: string; trace: Trace | null; children: ReactNode }> = ({
  children,
  subtitle,
  title,
  trace,
}) => (
  <div className="flex min-w-0 flex-col gap-3">
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate font-mono text-xs text-neutral-600 dark:text-neutral-300">{title}</span>
      <span className="truncate font-mono text-[11px] text-neutral-400">{subtitle}</span>
    </div>

    <div
      className={`
        flex shrink-0 flex-col rounded-lg bg-black/6
        dark:bg-white/5
      `}
    >
      <Plot series={trace?.series ?? []} />
      <div className="flex flex-col gap-0.5 px-3 pb-2">
        <Metric bad={trace !== null && trace.maxStep > 60} label="step" value={trace ? `${trace.maxStep}px` : '—'} />
        <Metric bad={trace !== null && trace.stallMs > 40} label="stall" value={trace ? `${trace.stallMs}ms` : '—'} />
        <Metric label="settled" value={trace ? `${trace.settleMs}ms` : '—'} />
        <Metric label="moved" value={trace ? `${trace.travelled}px` : '—'} />
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

const Comparison: FC = () => {
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [delay, setDelay] = useState(150);
  const [running, setRunning] = useState(false);
  const [traces, setTraces] = useState<Partial<Record<DisclosureMode, Trace>>>({});

  const markers = useRef(new Map<DisclosureMode, HTMLDivElement | null>());

  const toggle = useCallback((id: string) => {
    setExpandedIds((current) => (current.includes(id) ? current.filter((v) => v !== id) : [...current, id]));
  }, []);

  const replay = async (): Promise<void> => {
    setRunning(true);
    setTraces({});

    // From fully closed, and let anything in flight finish — otherwise the replay
    // records the tail of the previous one.
    setExpandedIds([]);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const samples = new Map<DisclosureMode, { t: number; top: number }[]>(MODES.map(({ mode }) => [mode, []]));
    const t0 = performance.now();
    let interrupted = false;

    setExpandedIds([PARENT]);

    await new Promise<void>((resolve) => {
      const tick = (): void => {
        const now = performance.now() - t0;

        for (const { mode } of MODES) {
          const marker = markers.current.get(mode);

          if (marker) samples.get(mode)?.push({ t: now, top: marker.getBoundingClientRect().top });
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

    setTraces(Object.fromEntries(MODES.map(({ mode }) => [mode, measure(samples.get(mode) ?? [])])));
    setRunning(false);
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8">
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
        One wireframe subject, one spring, one expansion state — the only difference between the four columns is which
        quantity the disclosure animates. Replay opens the outer folder, waits, then opens the nested one while the
        first is still in flight, and records the travel of the marker under each tree.
      </p>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-6 xl:grid-cols-4">
        {MODES.map(({ mode, subtitle, title }) => (
          <Panel key={mode} subtitle={subtitle} title={title} trace={traces[mode] ?? null}>
            <WireframeTree expandedIds={expandedIds} mode={mode} nodes={nodes} onToggle={toggle} />
            <div ref={(node) => void markers.current.set(mode, node)} className="h-px w-full shrink-0 bg-red-500/40" />
          </Panel>
        ))}
      </div>
    </div>
  );
};

const meta: Meta<typeof WireframeTree> = {
  title: 'Demos/DisclosureHeight',
  component: WireframeTree,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof WireframeTree>;

/**
 * Four ways to own a disclosure's height, under one interrupted nested expand.
 *
 * - **length** — the animation holds a pixel target that motion resolved by measuring
 *   once, before the nested folder existed. It pins 156px short, clipping the lower
 *   half of the subtree, and the frame that finishes the animation writes `auto` back:
 *   ramp, flat run, cliff.
 * - **ratio** — the animation holds a dimensionless fraction, so there is no length to
 *   go stale; layout resolves what the fraction is a fraction *of* every frame.
 * - **arithmetic** — still a length, but recomputed from the row count on every render,
 *   so it re-targets to the child's *final* contribution the moment the child opens.
 * - **observed** — still a length, re-issued from a `ResizeObserver`, so it re-targets
 *   to the child's *current* contribution and chases a target that is itself moving.
 *
 * Read `settled` across the row as well as `step`: the three live modes all avoid the
 * cliff, but they do not converge at the same time, and that difference is the
 * difference between knowing the end state and measuring the present one.
 *
 * The slider matters. At `0ms` the second expand usually beats motion's
 * keyframe-resolution frame, so even `length` measures the correct target and the
 * cliff disappears — which is exactly why this was hard to catch by hand.
 */
export const Interrupted: Story = {
  parameters: {
    controls: { disable: true },
  },
  render: () => <Comparison />,
};
