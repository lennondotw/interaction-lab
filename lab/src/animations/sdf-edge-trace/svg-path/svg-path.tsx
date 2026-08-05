import { cn } from '@monorepo/utils';
import { useIntervalEffect, useMeasure } from '@react-hookz/web';
import { useAnimationFrame } from 'motion/react';
import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { buildPath2D, buildPathData } from '../contour-path.js';
import { Field, Segmented, Stat, Toggle } from '../controls.js';
import { Ball, ContourTracer } from '../field.js';
import {
  BLEND,
  CELL_SIZES,
  MAX_BALLS,
  MIN_CELL,
  OVERSCAN,
  RADIUS,
  RollingMedian,
  SIGMA,
  VIEW,
  createBalls,
  orbitBalls,
} from '../shape.js';
import { useBallDrag } from '../use-ball-drag.js';
import { PathBenchmarkPanel } from './path-benchmark-panel.js';

/**
 * The same contour, drawn twice: once to a canvas and once as an SVG `<path>`.
 *
 * The question is what the move out of canvas actually costs, and the answer is
 * not the trace — that is unchanged, and `contour-path.ts` guarantees both
 * renderers walk the geometry identically. It is the `d` string: building it, and
 * handing the browser a fresh one to reparse every frame. That is the only new
 * line item, and it is the one this story puts a number on.
 *
 * Two things it also settles, both cheaply:
 *
 * - The overscan margin needs no handling. Geometry runs from -128 to 640 and the
 *   SVG root clips at its own viewBox by default, which is the same crop the
 *   canvas got from its transform. Nothing extra to write.
 * - Turning the zoom up separates the two renderers in a way no timing does. The
 *   SVG path is resolution-independent, so it stays exact; the canvas has a fixed
 *   backing store and goes soft. On a surface that resizes, that is the argument.
 */

const STAT_WINDOW = 90;
const ZOOMS = [1, 2, 4, 8] as const;
const PRECISIONS = [0, 1, 2, 3] as const;

type Renderer = 'canvas' | 'svg' | 'both';

const COLORS = {
  canvasStroke: 'rgba(99, 102, 241, 0.9)',
  canvasFill: 'rgba(99, 102, 241, 0.22)',
  handle: 'rgba(100, 116, 139, 0.75)',
  handleActive: '#f43f5e',
};

const numberFormatter = new Intl.NumberFormat('en-US');

interface LiveStats {
  traceMs: number;
  buildMs: number;
  chars: number;
  vertices: number;
  loops: number;
  /** Largest coordinate rounding error, converted to the device pixels it lands on. */
  errorPx: number;
}

export const SdfSvgPath: FC<{ className?: string }> = ({ className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
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
  // Copies, not the live array: the sweep runs across many frames and the shape
  // must hold still for it even while autoplay keeps moving the real one.
  const getBalls = useCallback(() => ballsRef.current.map((ball) => ({ ...ball })), []);

  const traceSamples = useMemo(() => new RollingMedian(STAT_WINDOW), []);
  const buildSamples = useMemo(() => new RollingMedian(STAT_WINDOW), []);
  const lastRef = useRef<LiveStats | null>(null);

  const [renderer, setRenderer] = useState<Renderer>('both');
  const [precision, setPrecision] = useState<number>(1);
  const [cell, setCell] = useState<number>(2);
  const [ballCount, setBallCount] = useState(4);
  const [zoom, setZoom] = useState<number>(1);
  const [smooth, setSmooth] = useState(true);
  const [fill, setFill] = useState(true);
  const [autoplay, setAutoplay] = useState(true);
  const [stats, setStats] = useState<LiveStats | null>(null);

  useEffect(() => {
    ballsRef.current = createBalls(ballCount);
  }, [ballCount]);

  const displaySize = Math.max(measures?.width ?? VIEW, 1);
  const drawCanvas = renderer !== 'svg';
  const drawSvg = renderer !== 'canvas';

  useAnimationFrame((time) => {
    if (autoplay && activeBallRef.current === null) orbitBalls(ballsRef.current, time);

    const traceStart = performance.now();
    const result = tracer.trace(ballsRef.current, {
      field: 'sdf',
      traversal: 'sparse',
      cell,
      radius: RADIUS,
      sigma: SIGMA,
      blend: BLEND,
      collectCells: false,
    });
    traceSamples.push(performance.now() - traceStart);

    // Only the active renderer's path is built, so the readout reflects what is
    // actually being paid rather than the union of both routes.
    let chars = 0;
    let errorPx = 0;
    if (drawSvg) {
      const buildStart = performance.now();
      const data = buildPathData(tracer, { smooth, precision });
      buildSamples.push(performance.now() - buildStart);
      pathRef.current?.setAttribute('d', data.d);
      chars = data.d.length;
      // In domain units the error is meaningless; what matters is whether it
      // lands inside the device pixel it was rounded for.
      errorPx = data.maxError * (displaySize / VIEW) * (window.devicePixelRatio || 1) * zoom;
    }

    lastRef.current = {
      traceMs: 0,
      buildMs: 0,
      chars,
      errorPx,
      vertices: result.pointCount,
      loops: result.loopCount,
    };

    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const target = Math.round(displaySize * dpr);
    if (canvas.width !== target) {
      canvas.width = target;
      canvas.height = target;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scale = displaySize / VIEW;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, target, target);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    const px = 1 / scale;

    if (drawCanvas) {
      const path = buildPath2D(tracer, { smooth });
      if (fill) {
        ctx.fillStyle = COLORS.canvasFill;
        ctx.fill(path, 'nonzero');
      }
      ctx.strokeStyle = COLORS.canvasStroke;
      // Thick and translucent under the SVG's thin line when both are on: the
      // SVG curve leaving this band is what a divergence would look like.
      ctx.lineWidth = (renderer === 'both' ? 5 : 2) * px;
      ctx.globalAlpha = renderer === 'both' ? 0.45 : 1;
      ctx.lineJoin = 'round';
      ctx.stroke(path);
      ctx.globalAlpha = 1;
    }

    ctx.lineWidth = 1.5 * px;
    let index = 0;
    for (const ball of ballsRef.current) {
      ctx.strokeStyle = index === activeBallRef.current ? COLORS.handleActive : COLORS.handle;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, RADIUS * 0.12, 0, Math.PI * 2);
      ctx.stroke();
      index++;
    }
  });

  useIntervalEffect(() => {
    const last = lastRef.current;
    if (last === null) return;
    setStats({ ...last, traceMs: traceSamples.value, buildMs: buildSamples.value });
  }, 150);

  const totalMs = stats === null ? 0 : stats.traceMs + (drawSvg ? stats.buildMs : 0);

  return (
    <div className={cn(`mx-auto flex w-full max-w-6xl touch-manipulation flex-col gap-6 px-4 py-6`, className)}>
      <header className="flex flex-col gap-1">
        <h1
          className={`
            text-base font-medium text-neutral-900
            dark:text-neutral-100
          `}
        >
          SVG path
        </h1>
        <p className="max-w-prose text-sm/relaxed text-neutral-500">
          The same trace, drawn to a canvas and to an SVG <span className="font-mono text-xs">&lt;path&gt;</span>. Both
          walk the geometry through one shared emitter, so they cannot disagree on the curve — on{' '}
          <span className="font-mono text-xs">both</span> the thin line rides inside the thick band, and leaving it
          would be the bug. What the SVG route adds is the <span className="font-mono text-xs">d</span> string: building
          it, and handing the browser a new one every frame. Drop the precision and watch{' '}
          <span className="font-mono text-xs">d size</span> fall against the error it costs. Then turn the zoom up — the
          vector stays exact where the canvas cannot.
        </p>
      </header>

      <div
        className={`
          flex flex-col gap-6
          lg:flex-row lg:items-start
        `}
      >
        <div ref={containerRef} className="w-full max-w-[520px] shrink-0">
          <div
            className={`
              relative overflow-hidden rounded-2xl bg-neutral-900/5
              dark:bg-neutral-800/50
            `}
            style={{ width: displaySize, height: displaySize }}
          >
            {/*
              Both surfaces are stacked in one square and scaled together, so the
              zoom is showing the same region of the same shape twice — which is
              the only way the crispness comparison means anything.
            */}
            <div
              className="absolute inset-0"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center', willChange: 'transform' }}
            >
              {/*
                The canvas takes the gesture even in `svg` mode, where it is
                otherwise only carrying the ball handles. `toDomain` measures the
                element's own rect, which already accounts for the zoom transform
                above, so dragging stays correct at every zoom level.
              */}
              <canvas
                ref={canvasRef}
                style={{ width: displaySize, height: displaySize }}
                {...handlers}
                className="absolute inset-0 touch-none"
              />
              {/*
                No handling needed for the overscan: geometry runs from -128 to
                640 and the root clips at the viewBox, which is the same crop the
                canvas gets from its transform.

                `pointer-events: none` because this sits on top of the canvas that
                owns the drag — without it the overlay would swallow every press.
              */}
              <svg
                viewBox={`0 0 ${VIEW} ${VIEW}`}
                className="pointer-events-none absolute inset-0 size-full"
                style={{ visibility: drawSvg ? 'visible' : 'hidden' }}
                aria-hidden="true"
              >
                <path
                  ref={pathRef}
                  fill={fill && renderer === 'svg' ? 'rgba(217, 119, 6, 0.22)' : 'none'}
                  stroke="#d97706"
                  // In viewBox user units: one unit renders as `displaySize / VIEW`
                  // px before the CSS zoom multiplies it, so undo both to hold the
                  // line at a constant on-screen width at every zoom level.
                  strokeWidth={((renderer === 'both' ? 1.25 : 2) * (VIEW / displaySize)) / zoom}
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
          <div
            className={`
              flex flex-row flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2 text-xs text-neutral-400
            `}
          >
            <span>Drag the balls</span>
            {drawCanvas && (
              <span className="flex flex-row items-center gap-1.5">
                <span className="h-1 w-3 rounded-full bg-[rgb(99_102_241/0.5)]" />
                canvas
              </span>
            )}
            {drawSvg && (
              <span className="flex flex-row items-center gap-1.5">
                <span className="h-0.5 w-3 rounded-full bg-[#d97706]" />
                svg path
              </span>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="flex flex-row flex-wrap gap-x-8 gap-y-4">
            <Field label="Renderer">
              <Segmented
                value={renderer}
                onChange={setRenderer}
                options={[
                  { value: 'canvas', label: 'canvas', title: 'Path2D straight to a 2D context' },
                  { value: 'svg', label: 'svg', title: 'One <path> with its d attribute rewritten per frame' },
                  { value: 'both', label: 'both', title: 'Overlaid — the parity check' },
                ]}
              />
            </Field>

            <Field label="Precision" hint="decimals per coordinate">
              <Segmented
                value={precision}
                onChange={setPrecision}
                options={PRECISIONS.map((value) => ({ value, label: `${value}` }))}
              />
            </Field>

            <Field label="Cell">
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

            <Field label="Zoom" hint="css transform">
              <Segmented
                value={zoom}
                onChange={setZoom}
                options={ZOOMS.map((value) => ({ value, label: `${value}x` }))}
              />
            </Field>
          </div>

          <div className="flex flex-row flex-wrap gap-x-4 gap-y-2">
            <Toggle label="fill" checked={fill} onChange={setFill} />
            <Toggle label="smooth" checked={smooth} onChange={setSmooth} />
            <Toggle label="autoplay" checked={autoplay} onChange={setAutoplay} />
          </div>

          <div
            className={`
              grid grid-cols-3 gap-x-4 gap-y-3 rounded-xl border border-neutral-200 p-3
              dark:border-neutral-800
            `}
          >
            <Stat label="trace" value={stats ? `${stats.traceMs.toFixed(3)} ms` : '—'} />
            <Stat label="build d" value={stats && drawSvg ? `${stats.buildMs.toFixed(3)} ms` : '—'} accent />
            <Stat label="d size" value={stats && drawSvg ? `${(stats.chars / 1024).toFixed(1)} KB` : '—'} accent />
            <Stat label="vertices" value={stats ? numberFormatter.format(stats.vertices) : '—'} />
            <Stat label="loops" value={stats ? `${stats.loops}` : '—'} />
            <Stat
              label="round-off"
              value={stats && drawSvg ? `${stats.errorPx.toFixed(2)} dev px` : '—'}
              accent={stats !== null && stats.errorPx > 0.5}
            />
          </div>

          <p className="max-w-prose text-xs/relaxed text-neutral-500">
            <span className="font-mono">build d</span> is the string alone. The browser reparsing it lands in the paint
            cost of the frame instead, which is why these two together are the honest comparison against{' '}
            <span className="font-mono">trace</span> at {totalMs.toFixed(3)} ms.{' '}
            <span className="font-mono">round-off</span> is the largest distance a coordinate moved when it was rounded,
            in device pixels at the current zoom, so it says whether the precision you picked is actually enough here
            rather than in the abstract.
          </p>

          {precision === 0 && (
            <p
              className={`
                max-w-prose text-xs/relaxed text-amber-800
                dark:text-amber-400
              `}
            >
              At 0 decimals every vertex snaps to a whole domain unit, which is coarser than the cell grid at{' '}
              <span className="font-mono">cell</span> 1 or 2 — the curve visibly facets and the marching-squares
              sub-pixel placement is thrown away. It is the cheapest string and the wrong trade.
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
        <PathBenchmarkPanel
          tracer={tracer}
          getBalls={getBalls}
          radius={RADIUS}
          sigma={SIGMA}
          blend={BLEND}
          cells={CELL_SIZES}
          precisions={PRECISIONS}
        />
      </div>
    </div>
  );
};
