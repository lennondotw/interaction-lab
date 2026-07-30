import { cn } from '@monorepo/utils';
import { AnimatePresence, motion } from 'motion/react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FC,
  type ReactNode,
} from 'react';
import { useExitTracer, type ExitTracer, type TraceEntry, type TraceKind } from './exit-trace.js';

/**
 * Shared harness for the AnimatePresence exit-batching scenarios.
 *
 * The behaviour: `AnimatePresence` does not remove an exiting child when that
 * child's own exit animation finishes. It removes all pending children together,
 * once the last one is done. A fast element can therefore sit in the DOM — at
 * rest, invisible, still holding its node — for as long as a slow sibling keeps
 * animating. Not a prop; in `mode="sync"` it is unconditional. See the
 * `exitComplete` Map and the `isEveryExitComplete` gate in
 * `AnimatePresence/index.tsx`.
 *
 * Why: there is exactly one removal path and it swaps the whole child list, so
 * a group re-measures once per flush instead of N times, re-renders once instead
 * of N (`onExit` fires from an animation callback, outside React's batching),
 * and keeps stable indices for splicing exiting children back into place.
 */

export interface SlideSpec {
  key: string;
  label: string;
  /** Drives both legs — same `transition` for enter and exit. */
  exitDuration: number;
  className: string;
}

export interface ScenarioSpec {
  id: string;
  title: string;
  /** The one question this scenario answers. */
  question: string;
  /** What Run does. Keep each step to one short line. */
  script: string[];
  /** The answer, in a sentence or two. */
  finding: ReactNode;
  /** The mechanism. Also a sentence or two. */
  why: ReactNode;
  slides: SlideSpec[];
  initialPresent: string[];
  run: (ctx: {
    setPresent: (keys: string[]) => void;
    container: HTMLDivElement | null;
    tracer: ExitTracer;
  }) => Promise<void>;
}

/** Slides travel between these, so every x in the trace is on this scale. */
const ENTER_FROM_X = 300;
const EXIT_TO_X = -300;

// The stage geometry is the measurement instrument here: chip width and travel
// distance are what make the trace's x values mean anything, and a collapsed
// stage silently destroys the whole demo. So it is inline style, not utility
// classes — immune to a Tailwind build that hasn't picked up this file yet.
const STAGE_HEIGHT = 96;
const CHIP_WIDTH = 150;

const stageStyle: CSSProperties = { position: 'relative', height: STAGE_HEIGHT, overflow: 'hidden' };

const chipStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: '50%',
  width: CHIP_WIDTH,
  marginLeft: -CHIP_WIDTH / 2,
};

const BUTTON_CLASS = `
  shrink-0 cursor-pointer rounded-lg bg-neutral-500/10 py-2 text-sm font-medium
  hover:bg-neutral-500/20
  disabled:cursor-default disabled:opacity-30 disabled:hover:bg-neutral-500/10
`;

// Fixed width, not padding: the label swaps between "Run S1" and "Running…", so
// an intrinsically-sized button would resize the moment you press it.
const buttonStyle: CSSProperties = { width: 104 };

// `exit-done` with no `unmount` beside it is the entire finding, so those two
// are the lines that have to pop. Everything else stays scaffolding-quiet.
const KIND_CLASS: Record<TraceKind, string> = {
  script: 'opacity-40',
  mount: 'text-emerald-500',
  unmount: 'text-rose-500',
  'exit-done': 'text-amber-500',
  'enter-done': 'text-sky-500',
  snapshot: 'opacity-60',
  sample: 'opacity-60',
};

const Panel: FC<{ label: string; children: ReactNode; className?: string }> = ({ label, children, className }) => (
  <div className={cn('rounded-lg bg-neutral-500/5 p-3 text-xs leading-relaxed', className)}>
    <div className="mb-1 text-[10px] font-semibold tracking-wider uppercase opacity-40">{label}</div>
    {children}
  </div>
);

const TraceLog: FC<{ tracer: ExitTracer }> = ({ tracer }) => {
  const entries = useSyncExternalStore(tracer.subscribe, tracer.getEntries);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [entries]);

  return (
    // maxHeight inline for the same reason as the stage: a trace panel that
    // grows unbounded pushes the stage off screen, which defeats the demo.
    <div
      data-testid="trace"
      className="rounded-lg bg-neutral-500/5 p-3 font-mono text-xs"
      style={{ maxHeight: 300, overflowY: 'auto' }}
    >
      {entries.length === 0 ? (
        <p className="opacity-40">Press Run.</p>
      ) : (
        entries.map((entry: TraceEntry, i) => (
          <div key={i} className={cn('flex gap-2', KIND_CLASS[entry.kind])} style={{ whiteSpace: 'pre-wrap' }}>
            <span className="shrink-0 tabular-nums opacity-50" style={{ width: 52, textAlign: 'right' }}>
              {entry.t}ms
            </span>
            <span className="shrink-0 opacity-70" style={{ width: 84 }}>
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

export const ExitBatchingScenario: FC<ScenarioSpec> = ({
  id,
  title,
  question,
  script,
  finding,
  why,
  slides,
  initialPresent,
  run,
}) => {
  const tracer = useExitTracer();
  const containerRef = useRef<HTMLDivElement>(null);
  const [present, setPresent] = useState<string[]>(initialPresent);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    return el ? tracer.observeMounts(el) : undefined;
  }, [tracer]);

  const onRun = useCallback(async () => {
    setRunning(true);
    tracer.reset();
    setPresent(initialPresent);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await run({ setPresent, container: containerRef.current, tracer });
    setRunning(false);
  }, [initialPresent, run, tracer]);

  return (
    // Horizontally centred but top-anchored: the trace grows as a run proceeds,
    // so vertical centring would drift the whole demo up the viewport mid-run.
    <section className="space-y-3" style={{ width: '100%', maxWidth: 680, marginInline: 'auto' }}>
      <header>
        <h2 className="text-sm font-semibold">
          {id}. {title}
        </h2>
        <p className="mt-0.5 text-xs opacity-50">{question}</p>
      </header>

      {/* The stage. Chips are absolutely positioned and animate x only, so an
          element that finished exiting parks at the left edge rather than
          vanishing — which is what makes the batching visible. */}
      <div ref={containerRef} data-testid={`stage-${id}`} className="rounded-lg bg-neutral-500/10" style={stageStyle}>
        <AnimatePresence>
          {slides
            .filter((slide) => present.includes(slide.key))
            .map((slide) => (
              <motion.div
                key={slide.key}
                data-slide={slide.key}
                // Registering on mount gives the trace stable `#n` ids, so
                // element reuse across a re-entry is directly observable.
                ref={(el: HTMLDivElement | null) => {
                  if (el) tracer.nodeId(el);
                }}
                className={cn(
                  'flex items-center justify-center rounded-md text-xs font-semibold text-white',
                  slide.className
                )}
                style={chipStyle}
                initial={{ opacity: 0, x: ENTER_FROM_X }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: EXIT_TO_X }}
                // Linear so x reads as a direct progress readout in the trace.
                transition={{ duration: slide.exitDuration, ease: 'linear' }}
                onAnimationComplete={(definition) => {
                  const isExit = (definition as { x?: number }).x === EXIT_TO_X;
                  tracer.log(isExit ? 'exit-done' : 'enter-done', `${slide.key} ${isExit ? 'EXIT' : 'enter'} finished`);
                }}
              >
                {slide.label}
              </motion.div>
            ))}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid={`run-${id}`}
          disabled={running}
          onClick={() => void onRun()}
          className={BUTTON_CLASS}
          style={buttonStyle}
        >
          {running ? 'Running…' : `Run ${id}`}
        </button>
        <ol
          className="text-xs opacity-50"
          style={{ margin: 0, paddingInlineStart: '1.25em', listStyleType: 'decimal' }}
        >
          {script.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </div>

      <TraceLog tracer={tracer} />

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <Panel label="What you should see">{finding}</Panel>
        <Panel label="Why">{why}</Panel>
      </div>
    </section>
  );
};
