/**
 * Does the merged surface keep up with the layout it is derived from?
 *
 * The same question `archive/2026-07-beacon-layout-observation` asks of the beacon,
 * against a subject where a miss is harder to see. A beacon that misses a change
 * paints one element in the wrong place, which is obvious. A surface that misses one
 * participant reports the wrong *topology* — a lobe that is not there any more, or a
 * bridge between two items that have moved apart — and a plausible-looking blob is
 * not self-evidently wrong.
 *
 * So it gets an instrument rather than an eye. Each case reads a baseline, mutates the
 * layout, samples the error every frame until things settle, and reports a verdict:
 * how far off the contour got, whether it came back, and how many frames it took. The
 * error is `max |field(v)|` over the painted vertices against freshly measured rects
 * (`surface-error.ts`), which is non-zero if any participant has gone stale.
 *
 * This is the tier-1 instrument: it watches the cascade through one consumer. It does
 * not ablate the five observation sources one at a time the way the beacon's probe
 * does — that harness exists, watches the same shared `useLayoutObservation`, and is
 * where a dead source would be caught. Worth building here only if these cases start
 * reporting gaps.
 */

import { Button } from '#src/components/button/button.js';
import {
  fmt,
  framesText,
  nextFrame,
  sleep,
  startSampling,
  useTracer,
  verdictOf,
  type TraceEntry,
  type TraceKind,
} from '#src/utils/observation-trace.js';
import { cn } from '@monorepo/utils';
import { useCallback, useRef, useState, useSyncExternalStore, type FC } from 'react';
import { MetaSurface } from './meta-surface.js';
import { createSurfaceErrorReader, type MeasuredRect } from './surface-error.js';
import type { SurfaceTraceResult } from './use-surface-trace.js';

const BLEND = 48;
const CELL = 2;

/**
 * Floor below which the instrument cannot tell agreement from noise.
 *
 * Not the beacon's 1px, which comes from `offsetLeft` being integer while
 * `getBoundingClientRect` is not. Here it is marching-squares interpolation error: a
 * vertex is placed by linear interpolation along a cell edge, so it sits on the true
 * iso only to within the curvature error across one cell. Measured at rest for this
 * configuration and rounded up — the unit tests pin the same quantity under 0.6px at
 * cell 1.
 */
const EPSILON = CELL;

interface StageState {
  wide: boolean;
  extra: boolean;
  padded: boolean;
  spread: boolean;
  tall: boolean;
}

const INITIAL: StageState = { wide: false, extra: false, padded: false, spread: false, tall: false };

interface ProbeCase {
  id: string;
  label: string;
  /** Which observation source is expected to catch it. */
  expect: string;
  mutate: (set: (next: StageState) => void, current: StageState) => void;
}

const CASES: readonly ProbeCase[] = [
  {
    id: 'S1',
    label: 'S1 · a participant grows',
    expect: 'self ResizeObserver',
    mutate: (set, current) => set({ ...current, wide: true }),
  },
  {
    id: 'S2',
    label: 'S2 · a participant mounts',
    expect: 'ancestor RO + layout-shift frame',
    mutate: (set, current) => set({ ...current, extra: true }),
  },
  {
    id: 'S3',
    label: 'S3 · the row re-distributes',
    expect: 'layout-shift frame (no size changes)',
    mutate: (set, current) => set({ ...current, spread: true }),
  },
  {
    id: 'S4',
    label: 'S4 · the container gains padding',
    expect: 'ancestor ResizeObserver',
    mutate: (set, current) => set({ ...current, padded: true }),
  },
  {
    id: 'S5',
    label: 'S5 · a participant grows on the cross axis',
    expect: 'self RO, and the region resizes with it',
    mutate: (set, current) => set({ ...current, tall: true }),
  },
];

const KIND_CLASS: Record<TraceKind, string> = {
  case: 'text-neutral-900 dark:text-neutral-100',
  setup: 'text-neutral-500',
  baseline: 'text-neutral-500',
  mutate: 'text-indigo-600 dark:text-indigo-400',
  frames: 'text-neutral-500',
  settle: 'text-neutral-700 dark:text-neutral-300',
  verdict: 'font-medium',
};

export const MetaSurfaceProbe: FC = () => {
  const tracer = useTracer();
  const entries = useSyncExternalStore(
    useCallback((cb: () => void) => tracer.subscribe(cb), [tracer]),
    () => tracer.getEntries()
  );

  const [stage, setStage] = useState<StageState>(INITIAL);
  const [running, setRunning] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pathRef = useRef('');
  const lastTraceRef = useRef<SurfaceTraceResult | null>(null);

  const handleTraced = useCallback((result: SurfaceTraceResult) => {
    pathRef.current = result.surface;
    lastTraceRef.current = result;
  }, []);

  /**
   * Rects read the *other* way: `getBoundingClientRect` differenced against the
   * container, where the items use the `offsetParent` walk. Two implementations that
   * should agree, so a bug in either shows up as a number instead of as both copies
   * making the same mistake.
   */
  const measureRects = useCallback((): MeasuredRect[] => {
    // The origin is the surface element, not the stage wrapper around it. The contour is
    // in region coordinates, so differencing against anything else offsets every rect by
    // the difference — with `p-8` on the stage that read as a flat 46.7px of error at
    // rest, which is 33px on both axes and nothing to do with tracking. The instrument
    // disagreeing with the subject is the whole point of building it independently; it
    // just means one of the two is wrong, and the first job is finding out which.
    const stage = containerRef.current;
    const container = stage?.querySelector<HTMLElement>('[data-slot="meta-surface"]') ?? null;
    if (!container) return [];
    const origin = container.getBoundingClientRect();
    return [...container.querySelectorAll('[data-slot="meta-surface-item"]')].map((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        x: rect.left - origin.left,
        y: rect.top - origin.top,
        width: rect.width,
        height: rect.height,
        radius: Number.parseFloat(style.borderTopLeftRadius) || 0,
      };
    });
  }, []);

  // Built per run rather than held in a ref. It caches parsed vertices for the life of
  // one case, which is exactly the scope that wants a fresh cache, and it keeps refs
  // out of render entirely.
  const makeReader = useCallback(
    () =>
      createSurfaceErrorReader({
        getPathData: () => pathRef.current,
        measureRects,
        getBlend: () => BLEND,
      }),
    [measureRects]
  );

  const run = useCallback(
    async (probeCase: ProbeCase) => {
      setRunning(probeCase.id);
      const errorReader = makeReader();

      tracer.reset();
      tracer.log('case', probeCase.label);
      setStage(INITIAL);
      // Two frames: one for React to paint the reset, one for the rAF-coalesced trace
      // that the resulting registry churn scheduled.
      await nextFrame();
      await nextFrame();
      await sleep(120);

      const trace = lastTraceRef.current;
      // Read before logging the count: `lastCount` describes the previous read, so
      // logging it first reported 0 vertices checked on every case.
      const baseline = errorReader.read();
      tracer.log(
        'setup',
        `${trace?.shapes.length ?? 0} participants · ${trace?.surfaceLoops ?? 0} loops · ${errorReader.lastCount()} vertices checked`
      );
      tracer.log('baseline', `max |field| ${fmt(baseline)}px · ε ${EPSILON}px`);
      tracer.log('mutate', probeCase.expect);

      const stop = startSampling(errorReader.read);
      probeCase.mutate((next) => setStage(next), INITIAL);
      await sleep(1200);
      const samples = stop();

      const verdict = verdictOf(samples, EPSILON);
      tracer.log('frames', `Δ per frame: ${framesText(samples)}`);
      tracer.log(
        'settle',
        verdict.sawGap
          ? `max Δ ${fmt(verdict.maxDelta)}px · settled Δ ${fmt(verdict.settledDelta)}px · ${
              verdict.frames === null
                ? 'never recovered'
                : `recovered in ${verdict.frames} frames / ${verdict.lagMs ?? 0}ms`
            }`
          : `max Δ ${fmt(verdict.maxDelta)}px · settled Δ ${fmt(verdict.settledDelta)}px · no frame ever disagreed`
      );
      const tracked = verdict.settledDelta <= EPSILON;
      tracer.log('verdict', `${tracked ? 'tracked' : 'MISSED'} · settled Δ ${fmt(verdict.settledDelta)}px`);
      setRunning(null);
    },
    [makeReader, tracer]
  );

  return (
    <div className="flex w-full max-w-4xl flex-col gap-5 p-6">
      <header className="flex flex-col gap-1">
        <h1
          className={`
            text-base font-medium text-neutral-900
            dark:text-neutral-100
          `}
        >
          MetaSurface layout tracking
        </h1>
        <p className="max-w-prose text-sm/relaxed text-neutral-500">
          Each case mutates the layout and samples how far the painted contour drifts from where the participants
          actually are. The error is <span className="font-mono text-xs">max |field(v)|</span> over the painted vertices
          against rects measured the other way — <span className="font-mono text-xs">getBoundingClientRect</span> where
          the items use the <span className="font-mono text-xs">offsetParent</span> walk — so a bug in either shows up
          as a number rather than as both agreeing.
        </p>
      </header>

      <div className="flex flex-row flex-wrap gap-2">
        {CASES.map((probeCase) => (
          <Button
            key={probeCase.id}
            size="sm"
            disabled={running !== null}
            data-testid={`run-${probeCase.id}`}
            onClick={() => void run(probeCase)}
            allPossibleContents={[probeCase.id, 'Running…']}
          >
            {running === probeCase.id ? 'Running…' : probeCase.id}
          </Button>
        ))}
      </div>

      <div
        ref={containerRef}
        data-testid="stage"
        className={cn(
          `
            rounded-2xl border border-neutral-200
            dark:border-neutral-800
          `,
          stage.padded ? 'p-16' : 'p-8'
        )}
      >
        <MetaSurface
          blend={BLEND}
          cell={CELL}
          outline={10}
          className={cn('flex w-full flex-row items-center gap-6', stage.spread && 'justify-between')}
          onTraced={handleTraced}
        >
          <MetaSurface.Item className={cn('shrink-0 rounded-3xl', stage.wide ? 'h-24 w-56' : 'size-24')} />
          <MetaSurface.Item className={cn('shrink-0 rounded-3xl', stage.tall ? 'h-40 w-24' : 'size-24')} />
          {stage.extra && <MetaSurface.Item className="size-20 shrink-0 rounded-full" />}
        </MetaSurface>
      </div>

      <div
        data-testid="trace"
        className={`
          flex h-56 flex-col gap-0.5 overflow-y-auto rounded-xl border border-neutral-200 p-3 font-mono text-xs
          dark:border-neutral-800
        `}
      >
        {entries.map((entry: TraceEntry, index) => (
          <div key={index} className={KIND_CLASS[entry.kind]}>
            <span className="text-neutral-400">{entry.t}ms </span>
            {entry.text}
          </div>
        ))}
      </div>
    </div>
  );
};
