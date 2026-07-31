/**
 * The last panel of the arc: the field's primitives *are* laid-out DOM rects, with the
 * tracer's own instrumentation left on.
 *
 * `OnCanvas`, `SvgPath` and `DomSurface` all vary where the contour *goes* and hold the
 * sources fixed as draggable balls, because a controlled input is what makes those
 * comparisons mean anything. This varies the other end. The divs below are ordinary flex
 * children — they lay themselves out, and the surface only reads the boxes that produced.
 *
 * It exists rather than deferring to `Components/MetaSurface` because that component
 * deliberately hides the tracer, and three things are only legible with the tracer
 * exposed:
 *
 * - **The quadtree over real rects.** Turn the overlay on and watch it subdivide along the
 *   row while culling everything else at one probe per quadrant. That picture is the
 *   argument for both the box primitive and the domain padding.
 * - **A box is cheaper than a disc.** Same count, fewer cells: a rounded rectangle has
 *   less perimeter than the circle that would enclose it, and `sparse` costs perimeter.
 * - **The domain must be padded, not fitted.** `fit domain` reproduces the cliff live —
 *   `traverseSparse` roots at `nx & -nx`, so a domain derived from a measured width can
 *   root at 1, making every root a leaf and the walk worse than `dense`. Watch `evals`
 *   and `root` when it is on. See archive/2026-07-metasurface-dom-field.
 */

import { Button } from '#src/components/button/button.js';
import { cn } from '@monorepo/utils';
import { useIntervalEffect, useMeasure } from '@react-hookz/web';
import { useCallback, useEffect, useMemo, useRef, useState, type FC, type ReactNode } from 'react';
import { timeBatched } from '../bench-timing.js';
import { Field, Segmented, Stat, Toggle } from '../controls.js';
import { ContourTracer, quadtreeSafeView, type FieldShape, type TraceConfig, type Traversal } from '../field.js';
import { ShapeRegistry, useRegisteredRect } from '../rect-registry.js';
import { CELL_SIZES, RollingMedian } from '../shape.js';
import { renderRectScene } from './rect-renderer.js';

const OVERSCAN = 128;
const STAT_WINDOW = 45;
const BLENDS = [0, 20, 40, 64] as const;
const INSETS = [0, 8, 16] as const;
/**
 * Region widths the `fit domain` demo can be pinned to.
 *
 * The cliff is *width-dependent*, which is exactly what makes it a trap: at most widths a
 * fitted domain roots acceptably and nothing looks wrong. 990 is one that does not —
 * `990 + 2*128 = 1246`, `nx = 623` at cell 2, which is odd, so the forest roots at 1 and
 * every root is a leaf. 640 and 734 are the neighbours that bracket it: one roots fine,
 * one collapses. Leaving this on `auto` would make the toggle demonstrate the cliff only
 * by luck.
 */
const WIDTHS = ['auto', 990, 734, 640] as const;
type WidthMode = (typeof WIDTHS)[number];

const numberFormatter = new Intl.NumberFormat('en-US');

/** A participant: an ordinary div that registers the box the layout gave it. */
const Rect: FC<{
  registry: ShapeRegistry;
  containerRef: React.RefObject<HTMLElement | null>;
  className?: string;
  children?: ReactNode;
}> = ({ registry, containerRef, className, children }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useRegisteredRect(ref, registry, containerRef);
  return (
    <div ref={ref} data-slot="rect-field-item" className={cn('shrink-0', className)}>
      {children}
    </div>
  );
};

interface LiveStats {
  traceMs: number;
  fieldEvals: number;
  loops: number;
  insetLoops: number;
  vertices: number;
  cellsTested: number;
  cellsCulled: number;
  leafCells: number;
  probes: number;
  shapes: number;
  view: number;
  tile: number;
}

export const SdfRectField: FC<{ className?: string }> = ({ className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [measures, containerRef] = useMeasure<HTMLDivElement>(true);

  const registry = useMemo(() => new ShapeRegistry(), []);
  const samples = useMemo(() => new RollingMedian(STAT_WINDOW), []);
  const lastRef = useRef<LiveStats | null>(null);
  /** Last traced geometry + config, so `Measure` can re-time exactly what is on screen. */
  const configRef = useRef<{ shapes: readonly FieldShape[]; config: TraceConfig } | null>(null);

  const [traversal, setTraversal] = useState<Traversal>('sparse');
  const [cell, setCell] = useState<number>(2);
  const [blend, setBlend] = useState<number>(40);
  const [inset, setInset] = useState<number>(0);
  const [count, setCount] = useState(3);
  const [pill, setPill] = useState(false);
  const [gap, setGap] = useState(24);
  const [fitDomain, setFitDomain] = useState(false);
  const [widthMode, setWidthMode] = useState<WidthMode>('auto');
  /**
   * Held with a signature of the configuration it was taken under, and shown only while
   * that still matches. Deriving staleness beats clearing it in an effect: no extra
   * render, no `setState` in an effect for the compiler to refuse, and the number cannot
   * outlive the thing it describes.
   */
  const [measured, setMeasured] = useState<{ ms: number; signature: string } | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [showRects, setShowRects] = useState(true);
  const [showFill, setShowFill] = useState(true);
  const [showDomain, setShowDomain] = useState(false);
  const [stats, setStats] = useState<LiveStats | null>(null);

  const width = Math.max(measures?.width ?? 1, 1);
  const height = Math.max(measures?.height ?? 1, 1);

  /**
   * The padded domain, or the fitted one when demonstrating the cliff.
   *
   * A tracer per view, memoised: buffers are sized from the domain at construction, and
   * `quadtreeSafeView` quantises to 256 so ordinary resizing reallocates nothing.
   */
  const view = fitDomain ? Math.max(Math.round(Math.max(width, height)), 1) : quadtreeSafeView(Math.max(width, height));
  const tracer = useMemo(() => new ContourTracer(view, OVERSCAN, 1, 2), [view]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rects = registry.list();
    const shapes = registry.shapes();

    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.round(width * dpr);
    const targetH = Math.round(height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const config = {
      field: 'sdf' as const,
      traversal,
      cell,
      radius: 0,
      sigma: 0,
      blend,
      collectCells: showOverlay,
      inset,
    };

    const start = performance.now();
    tracer.trace(shapes, config);
    samples.push(performance.now() - start);
    const result = tracer.trace(shapes, config);
    configRef.current = { shapes, config };

    lastRef.current = {
      traceMs: 0,
      fieldEvals: result.fieldEvals,
      loops: tracer.loops.filter((loop) => loop.level === 0).length,
      insetLoops: tracer.loops.filter((loop) => loop.level === 1).length,
      vertices: result.pointCount,
      cellsTested: result.cellsTested,
      cellsCulled: result.cellsCulled,
      leafCells: result.leafCells,
      shapes: shapes.length,
      view: tracer.view,
      tile: tracer.quadtreeTileFor(cell),
      probes: result.cellsTested,
    };

    renderRectScene(ctx, {
      tracer,
      rects,
      width,
      height,
      dpr,
      showOverlay,
      showRects,
      showFill,
      showInset: inset > 0,
      showDomain,
    });
  }, [
    blend,
    cell,
    height,
    inset,
    registry,
    samples,
    showDomain,
    showFill,
    showOverlay,
    showRects,
    tracer,
    traversal,
    width,
  ]);

  // Event-driven, same as `MetaSurface`: one redraw per frame in which a rect actually
  // moved, plus one whenever a control changes. `draw` is in the dep list, so every knob
  // above schedules its own.
  const frameRef = useRef<number | null>(null);
  const schedule = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      draw();
    });
  }, [draw]);

  useEffect(() => {
    const unsubscribe = registry.subscribe(schedule);
    schedule();
    return () => {
      unsubscribe();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [registry, schedule]);

  useIntervalEffect(() => {
    const last = lastRef.current;
    if (last === null) return;
    setStats({ ...last, traceMs: samples.value });
  }, 200);

  const signature = `${traversal}|${cell}|${blend}|${inset}|${count}|${String(pill)}|${gap}|${String(fitDomain)}|${String(widthMode)}`;
  const runMeasure = useCallback(() => {
    const pending = configRef.current;
    if (pending === null) return;
    // Re-times the exact geometry and configuration on screen, so the number answers for
    // what is being looked at rather than for whatever the last redraw happened to be.
    setMeasured({ ms: timeBatched(() => tracer.trace(pending.shapes, pending.config)).ms, signature });
  }, [signature, tracer]);
  const measuredMs = measured?.signature === signature ? measured.ms : null;

  const cullRate = stats !== null && stats.cellsTested > 0 ? stats.cellsCulled / stats.cellsTested : 0;
  const degenerate = stats !== null && stats.tile <= 2;

  return (
    <div className={cn('mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6', className)}>
      <header className="flex flex-col gap-1">
        <h1
          className={`
            text-base font-medium text-neutral-900
            dark:text-neutral-100
          `}
        >
          Rect field
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-neutral-500">
          The other three stories vary where the contour goes and keep the sources fixed as draggable balls. This varies
          the sources: the boxes below are ordinary flex children, and the field&apos;s primitives are the rects the
          layout gave them. Turn on the overlay to watch the quadtree subdivide along the row and cull everything else —
          then turn on <span className="font-mono text-xs">fit domain</span> to see the cliff that sizing the sampled
          domain from a measured width falls off.
        </p>
      </header>

      <div
        className={`
          flex flex-col gap-6
          xl:flex-row xl:items-start
        `}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/*
            The canvas is a sibling overlay, absolutely positioned over the same box the
            rects lay out in — so the rects own the layout and the canvas only observes it,
            exactly as in `MetaSurface`.
          */}
          <div
            ref={containerRef}
            className="relative w-full"
            style={{ maxWidth: widthMode === 'auto' ? undefined : widthMode }}
          >
            <canvas ref={canvasRef} style={{ width, height }} className="pointer-events-none absolute inset-0" />
            <div
              data-testid="rect-region"
              className={cn('flex w-full flex-row items-center justify-center py-10')}
              style={{ gap }}
            >
              {Array.from({ length: count }, (_, index) => (
                <Rect
                  key={index}
                  registry={registry}
                  containerRef={containerRef}
                  className={cn(
                    pill ? 'h-16 w-28 rounded-full' : 'size-24 rounded-3xl',
                    index === 1 && !pill && 'h-32 w-24'
                  )}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-row flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-400">
            {showOverlay && (
              <>
                <span className="flex flex-row items-center gap-1.5">
                  <span className="size-2.5 border border-[rgb(244_63_94/0.7)]" />
                  {traversal === 'sparse' ? 'subdivided' : 'scanned'}
                </span>
                {traversal === 'sparse' && (
                  <span className="flex flex-row items-center gap-1.5">
                    <span className="size-2.5 border border-[rgb(148_163_184/0.5)]" />
                    culled
                  </span>
                )}
              </>
            )}
            {showRects && <span>dashed = the rects as laid out</span>}
          </div>
        </div>

        <div
          className={`
            flex w-full flex-col gap-5
            xl:w-[26rem]
          `}
        >
          <div className="flex flex-row flex-wrap gap-x-8 gap-y-4">
            <Field label="Traversal">
              <Segmented
                value={traversal}
                onChange={setTraversal}
                options={[
                  { value: 'dense', label: 'dense' },
                  { value: 'bounded', label: 'bounded' },
                  { value: 'sparse', label: 'quadtree' },
                ]}
              />
            </Field>
            <Field label="Cell">
              <Segmented
                value={cell}
                onChange={setCell}
                options={CELL_SIZES.map((size) => ({ value: size, label: `${size}` }))}
              />
            </Field>
            <Field label="Blend" hint="merge distance">
              <Segmented
                value={blend}
                onChange={setBlend}
                options={BLENDS.map((value) => ({ value, label: `${value}` }))}
              />
            </Field>
            <Field label="Inset" hint="second iso">
              <Segmented
                value={inset}
                onChange={setInset}
                options={INSETS.map((value) => ({ value, label: `${value}` }))}
              />
            </Field>
            <Field label="Rects">
              <Segmented
                value={count}
                onChange={setCount}
                options={[2, 3, 5, 8].map((value) => ({ value, label: `${value}` }))}
              />
            </Field>
            <Field label="Width" hint="region">
              <Segmented
                value={widthMode}
                onChange={setWidthMode}
                options={WIDTHS.map((value) => ({
                  value,
                  label: `${value}`,
                  title: value === 990 ? 'Roots at 1 when the domain is fitted' : undefined,
                }))}
              />
            </Field>
            <Field label="Gap" hint={`${gap}px`}>
              <Segmented
                value={gap}
                onChange={setGap}
                options={[0, 12, 24, 56].map((value) => ({ value, label: `${value}` }))}
              />
            </Field>
          </div>

          <div className="flex flex-row flex-wrap gap-x-4 gap-y-2">
            <Toggle label="quadtree overlay" checked={showOverlay} onChange={setShowOverlay} />
            <Toggle label="source rects" checked={showRects} onChange={setShowRects} />
            <Toggle label="fill" checked={showFill} onChange={setShowFill} />
            <Toggle label="pills" checked={pill} onChange={setPill} />
            <Toggle label="domain edge" checked={showDomain} onChange={setShowDomain} />
            <Toggle label="fit domain" checked={fitDomain} onChange={setFitDomain} />
            <Button size="sm" onClick={runMeasure} data-testid="measure" allPossibleContents={['Measure']}>
              Measure
            </Button>
          </div>

          <div
            className={`
              grid grid-cols-3 gap-x-4 gap-y-3 rounded-xl border border-neutral-200 p-3
              dark:border-neutral-800
            `}
            data-testid="rect-field-stats"
          >
            {/*
              Two readouts, because event-driven tracing makes a per-frame median useless:
              only a handful of traces ever happen, so the rolling window is mostly empty
              and reads as noise. `Measure` re-times the geometry currently on screen with
              the batched methodology the benchmark panels use, which is trustworthy and
              costs ~1s on a degenerate configuration — far too slow to run inline.
            */}
            <Stat label="last trace" value={stats ? `${stats.traceMs.toFixed(3)} ms` : '—'} />
            <Stat label="measured" value={measuredMs === null ? '—' : `${measuredMs.toFixed(3)} ms`} accent />
            <Stat label="field evals" value={stats ? numberFormatter.format(stats.fieldEvals) : '—'} accent />
            <Stat label="rects" value={stats ? `${stats.shapes}` : '—'} />
            <Stat
              label="loops"
              value={stats ? (inset > 0 ? `${stats.loops} + ${stats.insetLoops}` : `${stats.loops}`) : '—'}
            />
            <Stat label="vertices" value={stats ? numberFormatter.format(stats.vertices) : '—'} />
            <Stat label="culled" value={stats && traversal === 'sparse' ? `${(cullRate * 100).toFixed(0)}%` : '—'} />
            <Stat label="domain" value={stats ? `${stats.view}px` : '—'} />
            <Stat label="root" value={stats ? `${stats.tile}` : '—'} accent={degenerate} />
            <Stat label="leaves" value={stats ? numberFormatter.format(stats.leafCells) : '—'} />
            {/*
              `probes` against `leaves` is the degeneration's signature: a collapsed forest
              probes every cell of the domain and culls almost all of them, so `culled`
              reads a triumphant 100% next to a probe count in the hundreds of thousands.
            */}
            <Stat label="probes" value={stats ? numberFormatter.format(stats.probes) : '—'} accent={degenerate} />
          </div>

          {degenerate && traversal === 'sparse' && (
            <p
              className={`
                max-w-prose text-xs leading-relaxed text-amber-800
                dark:text-amber-400
              `}
            >
              <span className="font-mono">root {stats.tile}</span> — the quadtree has collapsed.{' '}
              <span className="font-mono">traverseSparse</span> roots its forest at{' '}
              <span className="font-mono">nx &amp; -nx</span>, so a domain of {stats.view}px at cell {cell} gives an odd
              cell count and every root is a leaf: a flat scan of the whole domain <em>plus</em> a wasted centre probe
              per cell, which is strictly worse than <span className="font-mono">dense</span>. Compare{' '}
              <span className="font-mono">evals</span> with <span className="font-mono">fit domain</span> off — this is
              why the domain is padded to a multiple of 256 rather than fitted to the element.
            </p>
          )}

          {blend === 0 && (
            <p className="max-w-prose text-xs leading-relaxed text-neutral-500">
              At blend 0 nothing merges, so the contour is each rect&apos;s own rounded outline and sits exactly on the
              dashed sources. That is the check that the box primitive is the shape it claims to be — the field adds
              nothing here, so any gap would be the primitive being wrong.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
