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
  type Tracer,
} from '#src/utils/observation-trace.js';
import { cn } from '@monorepo/utils';
import { useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type FC } from 'react';
import { BeaconStoreContext } from './context.js';
import { BeaconFollower } from './follower.js';
import {
  describeStage,
  LAYOUT_CASES,
  resetStage,
  ROW_WIDTH,
  SCROLL_ROOM,
  STAGE_HEIGHT,
  TARGET_HEIGHT,
  TARGET_WIDTH,
  TRACE_HEIGHT,
  type LayoutCase,
  type StageNodes,
} from './layout-cases.js';
import { boxDelta, boxText, MATCH_EPSILON, type Box } from './layout-trace.js';
import { BeaconProvider } from './provider.js';
import type { BeaconStore } from './store.js';
import { useBeaconAnchor } from './use-beacon.js';

/**
 * Harness for the beacon layout-observation cases (`layout-cases.ts`).
 *
 * Runs one case at a time against a real `useBeaconAnchor` under a real
 * `BeaconProvider`, and reports, per frame, how far the beacon's belief about
 * its anchor has drifted from where the anchor actually is.
 *
 * Layout is pinned so a run cannot pollute itself. Trace lines are logged only
 * *outside* the sampling window, the trace panel is a fixed height, and it sits
 * below the stage — a growing panel would move the very element being tracked,
 * and the beacon would dutifully follow it.
 */

const FOLLOWER_CLASS = `
  rounded-md outline-2 outline-dashed outline-sky-500/80
`;

const BUTTON_CLASS = `
  shrink-0 cursor-pointer rounded-md bg-neutral-500/10 px-2 py-1 font-mono text-[11px]
  hover:bg-neutral-500/20
  disabled:cursor-default disabled:opacity-30 disabled:hover:bg-neutral-500/10
`;

const KIND_CLASS: Record<TraceKind, string> = {
  case: 'font-semibold text-sky-500',
  setup: 'opacity-40',
  baseline: 'opacity-60',
  mutate: 'text-amber-500',
  frames: 'text-violet-500',
  settle: 'opacity-60',
  verdict: 'font-semibold',
};

const TraceLog: FC<{ tracer: Tracer }> = ({ tracer }) => {
  const entries = useSyncExternalStore(tracer.subscribe, tracer.getEntries);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [entries]);

  return (
    <div
      data-testid="trace"
      className="rounded-lg bg-neutral-500/5 p-3 font-mono text-[11px] leading-[1.6]"
      style={{ height: TRACE_HEIGHT, overflowY: 'auto' }}
    >
      {entries.length === 0 ? (
        <p className="opacity-40">Press a case.</p>
      ) : (
        entries.map((entry: TraceEntry, i) => (
          <div key={i} className={cn('flex gap-2', KIND_CLASS[entry.kind])} style={{ whiteSpace: 'pre-wrap' }}>
            <span className="shrink-0 tabular-nums opacity-50" style={{ width: 44, textAlign: 'right' }}>
              {entry.t}ms
            </span>
            <span className="shrink-0 opacity-70" style={{ width: 56 }}>
              {entry.kind}
            </span>
            <span className="min-w-0">{entry.text}</span>
          </div>
        ))
      )}
      <div ref={endRef} />
    </div>
  );
};

/** The subject. `inset: 0` so the beacon box and the target's own box are comparable. */
const AnchoredTarget: FC<{ targetRef: React.RefObject<HTMLDivElement | null> }> = ({ targetRef }) => {
  useBeaconAnchor(targetRef, { inset: 0 });
  return (
    <div
      ref={targetRef}
      data-testid="target"
      className="flex items-center justify-center rounded-[4px] bg-neutral-500/15 font-mono text-[11px] opacity-70"
      style={{ width: TARGET_WIDTH, height: TARGET_HEIGHT, flex: 'none' }}
    >
      target
    </div>
  );
};

/**
 * Lifts the store out of the provider so the runner can read the raw
 * measurement channel. Sampling the follower instead would measure its springs.
 */
const StoreBridge: FC<{ storeRef: React.RefObject<BeaconStore | null> }> = ({ storeRef }) => {
  const store = useContext(BeaconStoreContext);
  useEffect(() => {
    storeRef.current = store;
  }, [storeRef, store]);
  return null;
};

export const BeaconLayoutObservation: FC = () => {
  const tracer = useTracer();
  const storeRef = useRef<BeaconStore | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);

  const readNodes = useCallback((): StageNodes | null => {
    const stage = stageRef.current;
    const scroller = scrollerRef.current;
    const wrap = wrapRef.current;
    const row = rowRef.current;
    const target = targetRef.current;
    if (!stage || !scroller || !wrap || !row || !target) return null;
    return { stage, scroller, wrap, row, target };
  }, []);

  /** Independent instrument: the visual rect, differenced against the container. */
  const readTarget = useCallback((n: StageNodes): Box => {
    const rect = n.target.getBoundingClientRect();
    const origin = n.stage.getBoundingClientRect();
    return { x: rect.left - origin.left, y: rect.top - origin.top, w: rect.width, h: rect.height };
  }, []);

  /** What the hook currently believes, before any spring touches it. */
  const readBeacon = useCallback((): Box | null => {
    const entry = storeRef.current?.getActive();
    if (!entry) return null;
    return { x: entry.x.get(), y: entry.y.get(), w: entry.w.get(), h: entry.h.get() };
  }, []);

  const runCase = useCallback(
    async (spec: LayoutCase): Promise<void> => {
      const n = readNodes();
      if (!n) return;

      const delta = (): number => {
        const beacon = readBeacon();
        return beacon ? boxDelta(readTarget(n), beacon) : Number.NaN;
      };

      resetStage(n);
      spec.setup?.(n);
      // The IO frame re-arms asynchronously after a mutation, so measuring too
      // soon would bill this case for the previous one's teardown.
      //
      // A `setup` is itself a layout change, so under ablation it can go
      // unobserved and leave the beacon wrong before the case even starts. That
      // is what the `baseline` Δ is for: a non-zero one means read the case as
      // "the setup was already missed", not as a result about the mutation. Only
      // C2 needs a setup that moves anything.
      await sleep(200);

      tracer.log('case', `${spec.id} · ${spec.vector}`);
      tracer.log('setup', describeStage(n));
      const target0 = readTarget(n);
      const beacon0 = readBeacon();
      tracer.log(
        'baseline',
        beacon0
          ? `target ${boxText(target0)} · beacon ${boxText(beacon0)} · Δ ${fmt(boxDelta(target0, beacon0))}`
          : 'no active beacon'
      );
      tracer.log(
        'mutate',
        `${spec.mutation}  →  expect: ${spec.expect}` + (spec.external ? `  ·  needs: ${spec.external}` : '')
      );

      // Every line above re-rendered the trace panel. Let that land and settle
      // before sampling starts, so no render competes for the frames about to
      // be measured.
      await nextFrame();
      await sleep(120);

      const stop = startSampling(delta);
      await spec.apply(n);
      await sleep(spec.tail ?? 500);
      const samples = stop();

      const verdict = verdictOf(samples, MATCH_EPSILON);
      tracer.log('frames', `Δ per frame: ${framesText(samples)}`);
      const recovery = !verdict.sawGap
        ? 'no frame ever disagreed'
        : verdict.frames === null
          ? 'never recovered'
          : `recovered in ${String(verdict.frames)} frames / ${String(verdict.lagMs)}ms`;
      tracer.log('settle', `max Δ ${fmt(verdict.maxDelta)}px · settled Δ ${fmt(verdict.settledDelta)}px · ${recovery}`);
      tracer.log(
        'verdict',
        verdict.settledDelta <= MATCH_EPSILON
          ? `tracked · settled Δ ${fmt(verdict.settledDelta)}px`
          : `NOT tracked · settled Δ ${fmt(verdict.settledDelta)}px`
      );
    },
    [readNodes, readBeacon, readTarget, tracer]
  );

  const onRunOne = useCallback(
    async (spec: LayoutCase): Promise<void> => {
      setRunning(true);
      tracer.reset();
      await runCase(spec);
      setRunning(false);
    },
    [runCase, tracer]
  );

  const onRunAll = useCallback(async (): Promise<void> => {
    setRunning(true);
    tracer.reset();
    for (const spec of LAYOUT_CASES) await runCase(spec);
    setRunning(false);
  }, [runCase, tracer]);

  return (
    <BeaconProvider containerRef={stageRef} renderFollower={false}>
      <StoreBridge storeRef={storeRef} />
      {/* Top-anchored and fixed-height throughout: nothing here may change size
          mid-run, or the stage moves and the measurement measures itself. */}
      <section className="space-y-3" style={{ width: '100%', maxWidth: 680, marginInline: 'auto' }}>
        <header>
          <h2 className="text-sm font-semibold">Beacon · layout observation</h2>
          <p className="mt-0.5 text-xs opacity-50">
            Which of the five observation sources catches which kind of layout change. The blue outline is the follower;
            the trace compares the beacon&apos;s raw measurement against the target&apos;s real rect, per frame.
          </p>
        </header>

        <div
          ref={stageRef}
          data-testid="stage"
          className="rounded-lg bg-neutral-500/5"
          style={{ position: 'relative', height: STAGE_HEIGHT, overflow: 'hidden' }}
        >
          <BeaconFollower className={FOLLOWER_CLASS} />
          <div ref={scrollerRef} data-testid="scroller" style={{ height: '100%', overflow: 'auto' }}>
            <div ref={wrapRef} style={{ padding: 24 }}>
              <div
                ref={rowRef}
                className="rounded-md border border-dashed border-current/20"
                style={{
                  display: 'flex',
                  width: ROW_WIDTH,
                  marginInline: 'auto',
                  boxSizing: 'border-box',
                  justifyContent: 'flex-start',
                  gap: 12,
                  padding: 12,
                }}
              >
                <AnchoredTarget targetRef={targetRef} />
              </div>
              <div style={{ height: SCROLL_ROOM }} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            data-testid="run-all"
            disabled={running}
            onClick={() => void onRunAll()}
            className={cn(BUTTON_CLASS, 'font-semibold')}
          >
            {running ? 'running…' : 'run all'}
          </button>
          {LAYOUT_CASES.map((spec) => (
            <button
              key={spec.id}
              type="button"
              data-testid={`run-${spec.id}`}
              disabled={running}
              onClick={() => void onRunOne(spec)}
              className={BUTTON_CLASS}
              title={`${spec.mutation} — expect: ${spec.expect}`}
            >
              {spec.id} {spec.vector}
            </button>
          ))}
        </div>

        <TraceLog tracer={tracer} />
      </section>
    </BeaconProvider>
  );
};
