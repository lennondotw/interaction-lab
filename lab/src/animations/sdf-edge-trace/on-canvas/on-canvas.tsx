import { cn } from '@monorepo/utils';
import { useIntervalEffect, useMeasure } from '@react-hookz/web';
import { useAnimationFrame } from 'motion/react';
import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Ball,
  ContourTracer,
  FieldKind,
  Traversal,
  effectiveTraversal,
} from '#src/components/meta-surface/sdf/field.js';
import { Field, Segmented, Stat, Toggle } from '#src/instruments/controls/controls.js';

import {
  BLEND,
  CELL_SIZES,
  MAX_BALLS,
  MIN_CELL,
  OVERSCAN,
  RADIUS,
  SIGMA,
  TRACED,
  VIEW,
  createBalls,
  median,
  orbitBalls,
} from '../shape.js';
import { useBallDrag } from '../use-ball-drag.js';
import { BenchmarkPanel } from './benchmark-panel.js';
import { renderScene } from './renderer.js';

const STAT_WINDOW = 90;

const FIELD_HINTS = { sdf: 'distance', density: 'density, saturates' } as const;
const ALL_FIELD_HINTS = [FIELD_HINTS.sdf, FIELD_HINTS.density] as const;
/** The only degradation that exists: density + quadtree falls back to bounded. */
const ALL_TRAVERSAL_HINTS = ['→ bounded'] as const;

const numberFormatter = new Intl.NumberFormat('en-US');

interface LiveStats {
  ms: number;
  fieldEvals: number;
  loopCount: number;
  pointCount: number;
  cellsTested: number;
  cellsCulled: number;
}

const EMPTY_STATS: LiveStats = {
  ms: 0,
  fieldEvals: 0,
  loopCount: 0,
  pointCount: 0,
  cellsTested: 0,
  cellsCulled: 0,
};

export const SdfOnCanvas: FC<{ className?: string }> = ({ className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [measures, containerRef] = useMeasure<HTMLDivElement>(true);

  const tracer = useMemo(() => new ContourTracer(VIEW, OVERSCAN, MIN_CELL), []);
  const ballsRef = useRef<Ball[]>(createBalls(4));
  const readBalls = useCallback(() => ballsRef.current, []);
  const moveBall = useCallback((index: number, x: number, y: number) => {
    const ball = ballsRef.current[index];
    if (!ball) return;
    ball.x = x;
    ball.y = y;
  }, []);
  const { activeBallRef, handlers } = useBallDrag({ readBalls, moveBall, view: VIEW, radius: RADIUS });
  const dashRef = useRef(0);
  const samplesRef = useRef<number[]>([]);
  const lastStatsRef = useRef<LiveStats>(EMPTY_STATS);

  const [field, setField] = useState<FieldKind>('sdf');
  const [traversal, setTraversal] = useState<Traversal>('sparse');
  const [cell, setCell] = useState<number>(2);
  const [ballCount, setBallCount] = useState(4);
  const [showOverlay, setShowOverlay] = useState(true);
  const [showFill, setShowFill] = useState(true);
  const [showPoints, setShowPoints] = useState(false);
  const [smooth, setSmooth] = useState(true);
  const [dash, setDash] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  // Null until the first sampling tick — showing 0.000 ms before anything has
  // been measured reads as "free" rather than "unknown".
  const [stats, setStats] = useState<LiveStats | null>(null);

  useEffect(() => {
    ballsRef.current = createBalls(ballCount);
  }, [ballCount]);

  const displaySize = Math.max(measures?.width ?? VIEW, 1);

  useAnimationFrame((time, delta) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const targetWidth = Math.round(displaySize * dpr);
    if (canvas.width !== targetWidth) {
      canvas.width = targetWidth;
      canvas.height = targetWidth;
    }
    const context = canvas.getContext('2d');
    if (!context) return;

    if (autoplay && activeBallRef.current === null) orbitBalls(ballsRef.current, time);

    const start = performance.now();
    const result = tracer.trace(ballsRef.current, {
      field,
      traversal,
      cell,
      radius: RADIUS,
      sigma: SIGMA,
      blend: BLEND,
      collectCells: showOverlay,
    });
    const elapsed = performance.now() - start;

    const samples = samplesRef.current;
    samples.push(elapsed);
    if (samples.length > STAT_WINDOW) samples.shift();
    lastStatsRef.current = {
      ms: 0,
      fieldEvals: result.fieldEvals,
      loopCount: result.loopCount,
      pointCount: result.pointCount,
      cellsTested: result.cellsTested,
      cellsCulled: result.cellsCulled,
    };

    dashRef.current += delta * 0.05;

    renderScene(context, {
      tracer,
      balls: ballsRef.current,
      radius: RADIUS,
      scale: displaySize / VIEW,
      dpr,
      showOverlay,
      showPoints,
      showFill,
      smooth,
      dashOffset: dash ? dashRef.current : null,
      activeBall: activeBallRef.current,
    });
  });

  useIntervalEffect(() => {
    setStats({ ...lastStatsRef.current, ms: median(samplesRef.current) });
  }, 150);

  const getBalls = useCallback(() => ballsRef.current.map((ball) => ({ ...ball })), []);

  const actual = effectiveTraversal(field, traversal);
  const degraded = actual !== traversal;
  const cullRate = stats !== null && stats.cellsTested > 0 ? stats.cellsCulled / stats.cellsTested : 0;

  return (
    <div className={cn(`mx-auto flex w-full max-w-6xl touch-manipulation flex-col gap-6 px-4 py-6`, className)}>
      <header className="flex flex-col gap-1">
        <h1
          className={`
            text-base font-medium text-neutral-900
            dark:text-neutral-100
          `}
        >
          SDF edge trace
        </h1>
        <p className="max-w-prose text-sm/relaxed text-neutral-500">
          Extracting a real contour from the metaball shape in <span className="font-mono text-xs">sdf-effect</span>.
          The two fields describe slightly different shapes — they blend on different terms. Within one field, all three
          traversals return the <em>identical</em> contour; only the cost of finding it differs. Turn on{' '}
          <span className="font-mono text-xs">quadtree</span> to see which regions a distance field lets you skip
          outright. The grid is sampled {OVERSCAN}px past every side of the frame: a centre is trapped in the box, the
          shape around it is not, and a contour that runs off the sampled area comes back open.
        </p>
      </header>

      <div
        className={`
          flex flex-col gap-6
          lg:flex-row lg:items-start
        `}
      >
        <div ref={containerRef} className="w-full max-w-[520px] shrink-0">
          <canvas
            ref={canvasRef}
            style={{ width: displaySize, height: displaySize }}
            {...handlers}
            className={`
              touch-none rounded-2xl bg-neutral-900/5
              dark:bg-neutral-800/50
            `}
          />
          <div
            className={`
              flex flex-row flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2 text-xs text-neutral-400
            `}
          >
            <span>Drag the balls</span>
            {showOverlay && (
              <>
                <span className="flex flex-row items-center gap-1.5">
                  <span className="size-2.5 border border-[rgb(244_63_94/0.7)]" />
                  {actual === 'sparse' ? 'subdivided' : 'scanned'}
                </span>
                {actual === 'sparse' && (
                  <span className="flex flex-row items-center gap-1.5">
                    <span className="size-2.5 border border-[rgb(148_163_184/0.5)]" />
                    culled
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="flex flex-row flex-wrap gap-x-8 gap-y-4">
            <Field
              label="Field"
              hint={field === 'sdf' ? FIELD_HINTS.sdf : FIELD_HINTS.density}
              allPossibleHints={ALL_FIELD_HINTS}
            >
              <Segmented
                value={field}
                onChange={setField}
                options={[
                  {
                    value: 'density',
                    label: 'density',
                    title: 'What sdf-effect renders today: blurred discs + threshold',
                  },
                  { value: 'sdf', label: 'sdf', title: 'Smooth-min of circle distance fields' },
                ]}
              />
            </Field>

            <Field label="Traversal" hint={degraded ? `→ ${actual}` : undefined} allPossibleHints={ALL_TRAVERSAL_HINTS}>
              <Segmented
                value={traversal}
                onChange={setTraversal}
                options={[
                  {
                    value: 'dense',
                    label: 'dense',
                    title: `Sample every cell of the ${TRACED}px domain, overscan margin included`,
                  },
                  { value: 'bounded', label: 'bounded', title: 'Sample every cell inside the bounding box' },
                  {
                    value: 'sparse',
                    label: 'quadtree',
                    title: 'Cull any node farther from the surface than its half-diagonal',
                  },
                ]}
              />
            </Field>

            <Field label="Cell" hint={`${TRACED}px domain`}>
              <Segmented
                value={cell}
                onChange={setCell}
                options={CELL_SIZES.map((size) => ({ value: size, label: `${size}` }))}
              />
            </Field>

            <Field label="Balls">
              <Segmented
                value={ballCount}
                onChange={setBallCount}
                options={[2, 4, 8, MAX_BALLS].map((count) => ({ value: count, label: `${count}` }))}
              />
            </Field>
          </div>

          {degraded && (
            <p
              className={`
                max-w-prose text-xs/relaxed text-amber-800
                dark:text-amber-400
              `}
            >
              A density field has no distance metric — <span className="font-mono">f = 0</span> means “nothing here”,
              not “the nearest edge is N px away”, so there is nothing to cull with. Fell back to{' '}
              <span className="font-mono">bounded</span>.
            </p>
          )}

          <div className="flex flex-row flex-wrap gap-x-4 gap-y-2">
            <Toggle label="quadtree overlay" checked={showOverlay} onChange={setShowOverlay} />
            <Toggle label="fill" checked={showFill} onChange={setShowFill} />
            <Toggle label="vertices" checked={showPoints} onChange={setShowPoints} />
            <Toggle label="smooth" checked={smooth} onChange={setSmooth} />
            <Toggle label="march" checked={dash} onChange={setDash} />
            <Toggle label="autoplay" checked={autoplay} onChange={setAutoplay} />
          </div>

          <div
            className={`
              grid grid-cols-3 gap-x-4 gap-y-3 rounded-xl border border-neutral-200 p-3
              dark:border-neutral-800
            `}
          >
            <Stat label="trace" value={stats ? `${stats.ms.toFixed(3)} ms` : '—'} accent />
            <Stat label="field evals" value={stats ? numberFormatter.format(stats.fieldEvals) : '—'} accent />
            <Stat label="budget @60fps" value={stats ? `${((stats.ms / 16.67) * 100).toFixed(1)}%` : '—'} />
            <Stat label="loops" value={stats ? `${stats.loopCount}` : '—'} />
            <Stat label="vertices" value={stats ? numberFormatter.format(stats.pointCount) : '—'} />
            <Stat label="culled" value={stats && actual === 'sparse' ? `${(cullRate * 100).toFixed(0)}%` : '—'} />
          </div>

          {dash && stats !== null && stats.loopCount > 1 && (
            <p className="text-xs/relaxed text-neutral-500">
              Drag two balls together and watch the dashes jump at the moment the loops merge — loop identity is not
              continuous across a topology change, which is the real problem with stroke-dash animation here.
            </p>
          )}
        </div>
      </div>

      <div
        className={`
          border-t border-neutral-200 pt-5
          dark:border-neutral-800
        `}
      >
        <BenchmarkPanel
          tracer={tracer}
          getBalls={getBalls}
          radius={RADIUS}
          sigma={SIGMA}
          blend={BLEND}
          cells={CELL_SIZES}
        />
      </div>
    </div>
  );
};
