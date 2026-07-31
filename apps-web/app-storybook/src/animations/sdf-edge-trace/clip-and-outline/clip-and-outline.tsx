import { cn } from '@monorepo/utils';
import { useIntervalEffect, useMeasure } from '@react-hookz/web';
import { useAnimationFrame } from 'motion/react';
import { FC, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { buildPathData } from '../contour-path.js';
import { Field, Segmented, Stat, Toggle } from '../controls.js';
import { Ball, ContourTracer } from '../field.js';
import {
  Arrangement,
  BLEND,
  CELL_SIZES,
  MAX_BALLS,
  MIN_CELL,
  OVERSCAN,
  RADIUS,
  RollingMedian,
  SIGMA,
  VIEW,
  createArrangement,
  orbitBalls,
} from '../shape.js';
import { useBallDrag } from '../use-ball-drag.js';
import { ClippedContent } from './clipped-content.js';
import { CONTENT_KINDS, CONTENT_LABELS, ContentKind } from './content-kind.js';
import { InsetBenchmarkPanel } from './inset-benchmark-panel.js';

/**
 * One `d` string, three consumers: a fill, an inner border, and a `clip-path` over
 * live DOM content. They share one `<defs>` and one trace, which is the whole
 * argument for doing this in SVG rather than reaching for `clip-path: path()` —
 * that function takes a bare string, so every consumer needs its own copy, and it
 * only accepts px, so every resize invalidates all of them.
 *
 * Nothing here touches layout. `d`, `clip-path` and `stroke-width` are all
 * paint-time properties; the element keeps its box whatever the contour does, and
 * the frame loop writes attributes without a React render. So the reflex to reach
 * for `contain: layout` is aimed at a stage that was never involved.
 *
 * The suspicion that replaced it was that the cost simply moved one stage later —
 * that a clip changing every frame would force the subtree under it to re-raster,
 * and that the expense would scale with how hard that subtree is to paint. That is
 * what `content` and `fps` are here to test, and the answer measured on this
 * machine is that it does not show up: toggling the clip is indistinguishable from
 * not having it, at 520px, 1040px and 1400px square, with a gradient, a page of
 * text, or a blurred surface behind it. p50 sits on the display's refresh cap
 * either way.
 *
 * Read that as a bound, not a zero. Every configuration is comfortably inside a
 * 144Hz frame, so the instrument cannot resolve what the clip costs *within* that
 * budget — only that it does not exceed it at these sizes. The line item worth
 * budgeting for on the DOM route is still the `d` string, exactly as in `SvgPath`.
 *
 * The two inner-border techniques are the reason this is one story rather than
 * two. They agree on convex runs and disagree everywhere else:
 *
 * - `stroke + clip` centres a stroke of `2w` on the outline and clips it to the
 *   shape, keeping the inner half. One trace, exact uniform width, topology
 *   preserved by construction — it cannot do anything but follow the outline.
 * - `second iso` traces the level set at `-w`, which is what "w px in from the
 *   edge" actually means on a distance field. It costs a second contour, and in a
 *   narrow neck it correctly reports that there is nothing left that far in: the
 *   ring pinches in two. Switch to the `neck` arrangement and raise the width to
 *   watch the two answers separate.
 */

const STAT_WINDOW = 90;
const PRECISION = 1;
const INSETS = [4, 8, 16, 26] as const;
/**
 * Insets walked by the benchmark's topology table. Fine enough near the low end to
 * locate the split, and carried past it to the width where the inner contour stops
 * existing at all.
 */
const PINCH_INSETS = [2, 4, 6, 8, 10, 12, 14, 16, 20, 26, 34, 44] as const;

type BorderMode = 'stroke-clip' | 'second-iso';

const numberFormatter = new Intl.NumberFormat('en-US');

interface LiveStats {
  traceMs: number;
  buildMs: number;
  frameMs: number;
  fieldEvals: number;
  chars: number;
  surfaceLoops: number;
  insetLoops: number;
  levels: number;
}

export const SdfClipAndOutline: FC<{ className?: string }> = ({ className }) => {
  const uid = useId().replace(/:/g, '');
  const cssClipId = `sdf-clip-css-${uid}`;
  const svgClipId = `sdf-clip-svg-${uid}`;

  const [measures, containerRef] = useMeasure<HTMLDivElement>(true);
  const surfacePathRef = useRef<SVGPathElement>(null);
  const clipCssRef = useRef<SVGPathElement>(null);
  const clipSvgRef = useRef<SVGPathElement>(null);
  const borderStrokeRef = useRef<SVGPathElement>(null);
  const borderRingRef = useRef<SVGPathElement>(null);
  const handlesRef = useRef<SVGGElement>(null);

  // Two levels: the surface, plus the inset contour the `second-iso` border needs.
  const tracer = useMemo(() => new ContourTracer(VIEW, OVERSCAN, MIN_CELL, 2), []);

  const [arrangement, setArrangement] = useState<Arrangement>('ring');
  const [ballCount, setBallCount] = useState(4);
  const ballsRef = useRef<Ball[]>(createArrangement('ring', 4));
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
  const frameSamples = useMemo(() => new RollingMedian(STAT_WINDOW), []);
  const lastRef = useRef<LiveStats | null>(null);

  const [borderMode, setBorderMode] = useState<BorderMode>('second-iso');
  const [inset, setInset] = useState<number>(16);
  const [content, setContent] = useState<ContentKind>('gradient');
  const [cell, setCell] = useState<number>(2);
  const [showFill, setShowFill] = useState(false);
  const [showBorder, setShowBorder] = useState(true);
  const [clipContent, setClipContent] = useState(true);
  const [autoplay, setAutoplay] = useState(true);
  const [stats, setStats] = useState<LiveStats | null>(null);

  useEffect(() => {
    ballsRef.current = createArrangement(arrangement, ballCount);
  }, [arrangement, ballCount]);

  const displaySize = Math.max(measures?.width ?? VIEW, 1);
  const visibleBalls = arrangement === 'neck' ? 2 : ballCount;
  // The inset level is only worth tracing when a border is actually asking for it.
  const wantsInset = showBorder && borderMode === 'second-iso';

  useAnimationFrame((time, delta) => {
    frameSamples.push(delta);
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
      inset: wantsInset ? inset : 0,
    });
    traceSamples.push(performance.now() - traceStart);

    const buildStart = performance.now();
    // One string for the surface, shared by every consumer that wants the outline:
    // the fill, the clip, and the stroke half of the `stroke-clip` border.
    const surface = buildPathData(tracer, { smooth: true, precision: PRECISION, level: 0 });
    let chars = surface.d.length;
    let insetLoops = 0;
    if (wantsInset) {
      // The ring is the two levels in one path under `evenodd`, which is what turns
      // "outer curve plus inner curve" into a filled annulus. evenodd rather than
      // nonzero deliberately: the inner loops would have to be wound backwards for
      // nonzero to punch a hole, and marching squares winds every loop the same way.
      const insetData = buildPathData(tracer, { smooth: true, precision: PRECISION, level: 1 });
      insetLoops = insetData.loops;
      chars += insetData.d.length;
      borderRingRef.current?.setAttribute('d', surface.d + insetData.d);
    }
    buildSamples.push(performance.now() - buildStart);

    surfacePathRef.current?.setAttribute('d', surface.d);
    clipCssRef.current?.setAttribute('d', surface.d);
    clipSvgRef.current?.setAttribute('d', surface.d);
    borderStrokeRef.current?.setAttribute('d', surface.d);

    const handles = handlesRef.current;
    if (handles) {
      const balls = ballsRef.current;
      const circles = handles.children;
      for (let index = 0; index < circles.length; index++) {
        const circle = circles[index];
        const ball = balls[index];
        if (!circle || !ball) continue;
        circle.setAttribute('cx', `${ball.x}`);
        circle.setAttribute('cy', `${ball.y}`);
        circle.setAttribute('stroke', index === activeBallRef.current ? '#f43f5e' : 'rgba(100,116,139,0.75)');
      }
    }

    lastRef.current = {
      traceMs: 0,
      buildMs: 0,
      frameMs: 0,
      fieldEvals: result.fieldEvals,
      chars,
      surfaceLoops: surface.loops,
      insetLoops,
      levels: result.levelsTraced,
    };
  });

  useIntervalEffect(() => {
    const last = lastRef.current;
    if (last === null) return;
    setStats({
      ...last,
      traceMs: traceSamples.value,
      buildMs: buildSamples.value,
      frameMs: frameSamples.value,
    });
  }, 150);

  const fps = stats !== null && stats.frameMs > 0 ? 1000 / stats.frameMs : 0;
  const pinched = stats !== null && stats.insetLoops > stats.surfaceLoops;
  // Domain units to the element's CSS px, so one `d` in domain space can drive a
  // `clip-path` on an HTML box without being rebuilt in a second coordinate system.
  const domainToCss = displaySize / VIEW;

  return (
    <div className={cn(`mx-auto flex w-full max-w-6xl touch-manipulation flex-col gap-6 px-4 py-6`, className)}>
      <header className="flex flex-col gap-1">
        <h1
          className={`
            text-base font-medium text-neutral-900
            dark:text-neutral-100
          `}
        >
          Clip and outline
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-neutral-500">
          One <span className="font-mono text-xs">d</span> string, three consumers — a fill, an inner border, and a{' '}
          <span className="font-mono text-xs">clip-path</span> over live DOM content. None of them touch layout, and the
          next suspicion — that a clip moving every frame would make its subtree re-raster — does not survive
          measurement either: switching <span className="font-mono text-xs">content</span> between a gradient, a page of
          text and a blurred surface leaves <span className="font-mono text-xs">fps</span> where it was, and so does
          turning the clip off entirely. What is left to pay for is the <span className="font-mono text-xs">d</span>{' '}
          string. Switch the shape to <span className="font-mono text-xs">neck</span> and raise the border width to
          watch the two inner-border techniques give genuinely different answers.
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
              The clipped subtree. `clip-path` is a paint-time property, so this box
              keeps its full 512-square layout whatever the contour does — and the
              per-frame invalidation lands here, on this content, not on the tracer.
            */}
            <div className="absolute inset-0" style={{ clipPath: clipContent ? `url(#${cssClipId})` : undefined }}>
              {clipContent && <ClippedContent kind={content} />}
            </div>

            <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="absolute inset-0 size-full" {...handlers}>
              <defs>
                {/*
                  Two clipPaths, one string. `userSpaceOnUse` does not name a fixed
                  space — it resolves against whatever user space the *referrer*
                  sits in, and the two referrers here disagree: the HTML box above
                  measures in CSS px from its border box, while the stroke below is
                  in this viewBox's domain units. So the HTML one carries the
                  domain-to-CSS scale and the SVG one carries none. Sharing a single
                  clipPath between them would silently mis-scale one of the two.
                */}
                <clipPath id={cssClipId} clipPathUnits="userSpaceOnUse" transform={`scale(${domainToCss})`}>
                  <path ref={clipCssRef} />
                </clipPath>
                <clipPath id={svgClipId} clipPathUnits="userSpaceOnUse">
                  <path ref={clipSvgRef} />
                </clipPath>
              </defs>

              <path ref={surfacePathRef} fill={showFill ? 'rgba(99, 102, 241, 0.26)' : 'none'} />

              {showBorder && borderMode === 'stroke-clip' && (
                <g clipPath={`url(#${svgClipId})`}>
                  {/*
                    A stroke of 2w centred on the outline, clipped to the shape,
                    keeps exactly w of it on the inside.

                    Round joins are not cosmetic at this width. The path is
                    marching-squares vertices, so it is thousands of very short
                    segments, and the default miter join spikes on every one whose
                    turn is sharp — at `strokeWidth` 52 that reads as a row of
                    notches wherever the outline curves tightly, which is exactly
                    the neck this mode is being compared on. Judging the technique
                    against a mitered stroke would be judging the wrong thing.
                  */}
                  <path
                    ref={borderStrokeRef}
                    fill="none"
                    stroke="#6366f1"
                    strokeWidth={inset * 2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </g>
              )}

              {showBorder && borderMode === 'second-iso' && (
                <path ref={borderRingRef} fill="#6366f1" fillRule="evenodd" fillOpacity={0.9} />
              )}

              <g ref={handlesRef} fill="none" strokeWidth={1.5}>
                {Array.from({ length: visibleBalls }, (_, index) => (
                  <circle key={index} r={RADIUS * 0.12} />
                ))}
              </g>
            </svg>
          </div>
          <div
            className={`
              flex flex-row flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2 text-xs text-neutral-400
            `}
          >
            <span>Drag the balls</span>
            {pinched && <span className="text-amber-500">inner ring pinched in two</span>}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="flex flex-row flex-wrap gap-x-8 gap-y-4">
            <Field label="Inner border" hint={borderMode === 'second-iso' ? 'iso −w' : 'stroke 2w, clipped'}>
              <Segmented
                value={borderMode}
                onChange={setBorderMode}
                options={[
                  {
                    value: 'stroke-clip',
                    label: 'stroke + clip',
                    title: 'One trace. Exact width, topology preserved.',
                  },
                  { value: 'second-iso', label: 'second iso', title: 'A second contour at -w. The true offset.' },
                ]}
              />
            </Field>

            <Field label="Width" hint="domain px">
              <Segmented
                value={inset}
                onChange={setInset}
                options={INSETS.map((value) => ({ value, label: `${value}` }))}
              />
            </Field>

            <Field label="Content" hint="paint cost behind the clip">
              <Segmented
                value={content}
                onChange={setContent}
                options={CONTENT_KINDS.map((kind) => ({
                  value: kind,
                  label: CONTENT_LABELS[kind],
                }))}
              />
            </Field>

            <Field label="Shape">
              <Segmented
                value={arrangement}
                onChange={setArrangement}
                options={[
                  { value: 'ring', label: 'ring' },
                  { value: 'neck', label: 'neck', title: 'Two lobes bridged by a thin waist' },
                ]}
              />
            </Field>

            <Field label="Balls">
              <Segmented
                value={ballCount}
                onChange={setBallCount}
                options={[2, 4, 8, MAX_BALLS].map((count) => ({
                  value: count,
                  label: `${count}`,
                  disabled: arrangement === 'neck',
                }))}
              />
            </Field>

            <Field label="Cell">
              <Segmented
                value={cell}
                onChange={setCell}
                options={CELL_SIZES.map((size) => ({ value: size, label: `${size}` }))}
              />
            </Field>
          </div>

          <div className="flex flex-row flex-wrap gap-x-4 gap-y-2">
            <Toggle label="clip content" checked={clipContent} onChange={setClipContent} />
            <Toggle label="inner border" checked={showBorder} onChange={setShowBorder} />
            <Toggle label="fill" checked={showFill} onChange={setShowFill} />
            <Toggle label="autoplay" checked={autoplay} onChange={setAutoplay} />
          </div>

          <div
            className={`
              grid grid-cols-3 gap-x-4 gap-y-3 rounded-xl border border-neutral-200 p-3
              dark:border-neutral-800
            `}
          >
            <Stat label="fps" value={stats ? fps.toFixed(0) : '—'} accent={fps > 0 && fps < 55} />
            <Stat label="trace" value={stats ? `${stats.traceMs.toFixed(3)} ms` : '—'} />
            <Stat label="build d" value={stats ? `${stats.buildMs.toFixed(3)} ms` : '—'} />
            <Stat label="field evals" value={stats ? numberFormatter.format(stats.fieldEvals) : '—'} />
            <Stat label="d size" value={stats ? `${(stats.chars / 1024).toFixed(1)} KB` : '—'} />
            <Stat
              label="loops"
              value={
                stats
                  ? stats.levels > 1
                    ? `${stats.surfaceLoops} + ${stats.insetLoops}`
                    : `${stats.surfaceLoops}`
                  : '—'
              }
              accent={pinched}
            />
          </div>

          <p className="max-w-prose text-xs leading-relaxed text-neutral-500">
            <span className="font-mono">fps</span> is here to catch the clip, and it comes up empty. Nothing about the
            trace changes when you switch <span className="font-mono">content</span>, so anything{' '}
            <span className="font-mono">fps</span> did would be the browser re-rastering that subtree against a moved
            clip — and it does not move, against any of the three, or against{' '}
            <span className="font-mono">clip content</span> off altogether. Treat that as a ceiling rather than a zero:
            every setting here fits inside a frame, so this says the clip does not blow the budget, not that it is free
            within it.
          </p>

          {pinched && (
            <p
              className={`
                max-w-prose text-xs leading-relaxed text-amber-800
                dark:text-amber-400
              `}
            >
              The surface is {stats.surfaceLoops} loop{stats.surfaceLoops === 1 ? '' : 's'} and the inner contour is{' '}
              {stats.insetLoops} — {inset}px in from the edge, the waist has nothing left in it, so the ring is
              genuinely two pieces. Switch to <span className="font-mono">stroke + clip</span> and it becomes one
              continuous band again, because a clipped stroke is the outline pushed inward and cannot report that.
              Neither is a bug; they answer different questions, and only the iso offset answers &ldquo;{inset}px in
              from the edge&rdquo;.
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
        <InsetBenchmarkPanel
          tracer={tracer}
          getBalls={getBalls}
          radius={RADIUS}
          sigma={SIGMA}
          blend={BLEND}
          cells={CELL_SIZES}
          inset={inset}
          pinchInsets={PINCH_INSETS}
        />
      </div>
    </div>
  );
};
