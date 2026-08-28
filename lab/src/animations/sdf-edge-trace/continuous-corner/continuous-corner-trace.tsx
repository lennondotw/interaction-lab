/**
 * Can the field trace the corner shapes a real component uses, and how close does it get?
 *
 * Every earlier story traced circular corners, because that is all the primitive had. The
 * corner term is now a p-norm, which buys the whole `corner-shape: superellipse(k)` family
 * *exactly* — that curve is confined to the `r × r` corner box, and the p-norm level set in
 * that box is it. So `round` and `superellipse` are not approximations here.
 *
 * Apple's continuous corner is a different matter and is the reason this story measures
 * rather than demonstrates. It is three cubic Béziers reaching `1.528665r` along each edge,
 * so it leaves the corner box entirely and no exponent reproduces it. The field can only
 * approximate it, and the honest thing is to say by how much: `apple (fitted)` uses the
 * `k = 1.3844`, radius × 1.2409 fit from archive/2026-08-corner-shape-vs-apple, and the
 * `deviation` readout is our traced vertices measured against `ContinuousCorner`'s own
 * geometry.
 *
 * Which is what the scenes are for. One rect exercises exactly one corner shape, so it can
 * serve as the ruler but shows nothing about tracing; `n` is per shape, so the scenes that
 * matter put several genuinely different rects in one field and bridge them.
 *
 * Two things worth driving to their limits with the controls:
 *
 * - **The clamp.** Apple's curve degrades per axis once `r / half > 0.654166`, flattening
 *   toward the arc so a pill stays a pill. A superellipse cannot degrade at all. Measured on
 *   the 300 × 180 box, though, the fit survives well past that line — 0.004r at `ρ = 0.8` —
 *   and only then falls off a cliff, so the crossover is a warning rather than a verdict.
 * - **Bridging shapes that do not share a corner shape.** Two rects at different exponents
 *   folding into one contour is the one thing here that neither CSS nor the component can do.
 *   It is also where the comparison stops being meaningful, since a merged blob has no Apple
 *   outline to be measured against.
 */

import { cn } from '@monorepo/utils';
import { useIntervalEffect } from '@react-hookz/web';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FC } from 'react';

import { squirclePath } from '#src/components/continuous-corner/squircle-path.js';
import { Field, Segmented, Stat, Toggle } from '#src/instruments/controls/controls.js';

import { buildPath2D } from '../contour-path.js';
import { ContourTracer, type FieldShape } from '../field.js';
import { CELL_SIZES, RollingMedian } from '../shape.js';
import { drawCentreHandles, useShapeDrag } from '../use-shape-drag.js';
import { FAMILIES, appleOutline, deviationFromApple, familyById, type FamilyId } from './corner-families.js';
import { MEASURED_BOX, SCENES, VIEW, sceneById, type SceneId, type SceneShape } from './corner-scenes.js';

const OVERSCAN = 128;
const K_VALUES = [0, 0.5, 1, 1.3844, 1.6, 2, 3] as const;
/**
 * How hard to fold neighbouring shapes together, and irrelevant to a lone shape — its own
 * distance is never within `blend` of anything to fold with.
 *
 * Graded rather than on/off because the threshold is the interesting part, and it is not
 * "within `blend`" as one might guess. The fold is `min(d, di) - h²k/4`, so at the midpoint of
 * a gap `g` both distances are `g / 2`, `h` is 1, and the field is lowered by exactly `k / 4`.
 * The surface closes when `g / 2 ≤ k / 4`, so **`blend` bridges a gap of half its size** —
 * these three settings reach 12, 24 and 36px. Verified: the assorted scene's widest gaps sit
 * just under 24px and fall to one loop at 48 but not at 30.
 */
const BRIDGE_BLENDS = [0, 24, 48, 72] as const;
/**
 * CSS size of the stage. The domain stays at `VIEW` and the canvas scales down to this, so
 * the sampling grid does not change with the layout. Fixed rather than flex-sized because
 * the scenes have notes of different length, and letting the column negotiate its width made
 * the stage — and every shape on it — resize when the scene changed.
 */
const DISPLAY = 520;
/** Grab radius around a shape's centre, in domain units. */
const GRAB = 46;

const COLORS = {
  fill: 'rgba(99, 102, 241, 0.16)',
  trace: '#818cf8',
  apple: 'rgba(244, 63, 94, 0.95)',
  box: 'rgba(148, 163, 184, 0.28)',
  handle: 'rgba(129, 140, 248, 0.9)',
  label: 'rgba(148, 163, 184, 0.85)',
};

interface Stats {
  traceMs: number;
  vertices: number;
  loops: number;
  fieldEvals: number;
  shapes: number;
  maxPx: number;
  meanPx: number;
  /** Read off the shapes rather than the controls, so both stay true when a scene ignores a control. */
  exponentLabel: string;
  radiusLabel: string;
  clamped: boolean;
}

/** The one value every shape shares, or `null` when they differ. */
const shared = (values: readonly number[]): number | null => {
  const first = values[0];
  if (first === undefined) return null;
  return values.every((value) => Math.abs(value - first) < 1e-9) ? first : null;
};

export const SdfContinuousCorner: FC<{ className?: string }> = ({ className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const applePathRef = useRef<SVGPathElement>(null);
  const appleGroupRef = useRef<SVGGElement>(null);

  const tracer = useMemo(() => new ContourTracer(VIEW, OVERSCAN, 1, 1), []);
  const samples = useMemo(() => new RollingMedian(30), []);
  const lastRef = useRef<Stats | null>(null);

  const [sceneId, setSceneId] = useState<SceneId>('exponents');
  const [familyId, setFamilyId] = useState<FamilyId>('apple-fit');
  const [k, setK] = useState(1.3844);
  const [radius, setRadius] = useState(36);
  const [cell, setCell] = useState<number>(1);
  const [blend, setBlend] = useState<number>(0);
  const [showApple, setShowApple] = useState(true);
  const [showFill, setShowFill] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);

  const family = familyById(familyId);
  const scene = sceneById(sceneId);

  const members: SceneShape[] = useMemo(() => scene.shapes({ family, k, radius }), [scene, family, k, radius]);

  /** Apple's outline for the measured box, in domain coordinates. */
  const outline = useMemo(() => {
    if (!scene.measured) return [];
    const local = appleOutline(MEASURED_BOX.width, MEASURED_BOX.height, radius);
    const offsetX = (VIEW - MEASURED_BOX.width) / 2;
    const offsetY = (VIEW - MEASURED_BOX.height) / 2;
    const shifted = [...local];
    for (let i = 0; i < shifted.length; i += 2) {
      shifted[i] = (shifted[i] ?? 0) + offsetX;
      shifted[i + 1] = (shifted[i + 1] ?? 0) + offsetY;
    }
    return shifted;
  }, [scene.measured, radius]);

  const layout: FieldShape[] = useMemo(() => members.map((member) => member.shape), [members]);
  // Owned here rather than by the hook, so pointing it at the newest `draw` is a plain ref
  // write instead of an assignment through a returned object.
  const drawRef = useRef<() => void>(() => undefined);
  const drag = useShapeDrag({ layout, view: VIEW, grab: GRAB, resetKey: sceneId, drawRef });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const shapes: FieldShape[] = drag.placed();

    const dpr = window.devicePixelRatio || 1;
    const target = Math.round(VIEW * dpr);
    if (canvas.width !== target) {
      canvas.width = target;
      canvas.height = target;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const start = performance.now();
    const result = tracer.trace(shapes, {
      field: 'sdf',
      traversal: 'sparse',
      cell,
      radius: 0,
      sigma: 0,
      blend: blend > 0 && shapes.length > 1 ? blend : 1e-6,
      collectCells: false,
    });
    samples.push(performance.now() - start);

    // Vertices in domain coordinates, for the deviation measurement.
    const vertices: number[] = [];
    for (const loop of tracer.loops) {
      for (let step = 0; step < loop.count; step++) {
        const index = tracer.ordered[loop.start + step] ?? 0;
        vertices.push(tracer.pointXY[index * 2] ?? 0, tracer.pointXY[index * 2 + 1] ?? 0);
      }
    }
    // The reference outline is built around the domain's centre, so a dragged shape is
    // compared by moving the *vertices* back by its delta rather than by rebuilding the
    // outline — one subtraction per vertex instead of a fresh de Casteljau pass.
    const [dragX, dragY] = drag.deltaOf(0);
    if (scene.measured && (dragX !== 0 || dragY !== 0)) {
      for (let i = 0; i < vertices.length; i += 2) {
        vertices[i] = (vertices[i] ?? 0) - dragX;
        vertices[i + 1] = (vertices[i + 1] ?? 0) - dragY;
      }
    }
    const deviation = scene.measured ? deviationFromApple(vertices, outline) : { maxPx: NaN, meanPx: NaN, samples: 0 };

    // Both read off the shapes, not the controls: a scene may ignore the family, and `r` is
    // clamped to half the short side, so the number on screen is the one traced rather than
    // the one asked for.
    const sharedN = shared(shapes.map((shape) => shape.n ?? 2));
    const sharedR = shared(shapes.map((shape) => shape.r ?? 0));

    lastRef.current = {
      traceMs: 0,
      vertices: result.pointCount,
      loops: result.loopCount,
      fieldEvals: result.fieldEvals,
      shapes: shapes.length,
      maxPx: deviation.maxPx,
      meanPx: deviation.meanPx,
      exponentLabel: sharedN === null ? 'per shape' : sharedN.toFixed(3),
      radiusLabel: sharedR === null ? 'per shape' : `${sharedR.toFixed(1)} px`,
      clamped: radius / (Math.min(MEASURED_BOX.width, MEASURED_BOX.height) / 2) > 0.654166,
    };

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, target, target);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // The nominal boxes, so the corner curve can be seen against the layout it belongs to.
    ctx.strokeStyle = COLORS.box;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    for (const shape of shapes) {
      const { x, y, hw = 0, hh = 0 } = shape;
      ctx.strokeRect(x - hw + 0.5, y - hh + 0.5, hw * 2 - 1, hh * 2 - 1);
    }
    ctx.setLineDash([]);

    const path = buildPath2D(tracer, { smooth: true });
    if (showFill) {
      ctx.fillStyle = COLORS.fill;
      ctx.fill(path, 'nonzero');
    }
    ctx.strokeStyle = COLORS.trace;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke(path);

    drawCentreHandles(ctx, shapes, drag.activeRef.current, COLORS.handle);

    ctx.fillStyle = COLORS.label;
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    for (let index = 0; index < members.length; index++) {
      const label = members[index]?.label;
      const shape = shapes[index];
      if (label === undefined || shape === undefined) continue;
      ctx.fillText(label, shape.x, shape.y + (shape.hh ?? 0) + 22);
    }

    // The reference outline lives in the SVG overlay, so a dragged shape has to take it
    // along — set imperatively because a drag deliberately does not re-render.
    appleGroupRef.current?.setAttribute(
      'transform',
      `translate(${(VIEW - MEASURED_BOX.width) / 2 + dragX} ${(VIEW - MEASURED_BOX.height) / 2 + dragY})`
    );
    // `family` and `k` are absent on purpose: they reach the field only through `members`,
    // and the readouts are derived from the shapes rather than from the controls.
  }, [blend, cell, drag, members, outline, radius, samples, scene.measured, showFill, tracer]);

  useEffect(() => {
    drawRef.current = draw;
    draw();
    if (!scene.measured) return;
    // Apple's exact path is handed to SVG rather than drawn on the canvas, so it is
    // resolution-independent and cannot be blamed for a canvas rasterisation difference
    // when the two are compared by eye.
    applePathRef.current?.setAttribute(
      'd',
      squirclePath({
        width: MEASURED_BOX.width,
        height: MEASURED_BOX.height,
        radii: { topLeft: radius, topRight: radius, bottomRight: radius, bottomLeft: radius },
      })
    );
  }, [draw, radius, scene.measured]);

  useIntervalEffect(() => {
    const last = lastRef.current;
    if (last === null) return;
    setStats({ ...last, traceMs: samples.value });
  }, 200);

  const fits = stats !== null && Number.isFinite(stats.maxPx);
  const fitQuality = fits ? stats.maxPx / Math.max(radius, 1) : NaN;
  const appleVisible = scene.measured && showApple;

  return (
    <div className={cn('mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6', className)}>
      <header className="flex flex-col gap-1">
        <h1
          className={`
            text-base font-medium text-neutral-900
            dark:text-neutral-100
          `}
        >
          Continuous corners
        </h1>
        <p className="max-w-prose text-sm/relaxed text-neutral-500">
          The corner term is a p-norm now, which buys CSS&apos;s{' '}
          <span className="font-mono text-xs">corner-shape: superellipse(k)</span> family exactly — that curve is
          confined to the <span className="font-mono text-xs">r × r</span> corner box, and the p-norm level set in that
          box <em>is</em> it. Apple&apos;s continuous corner is not in the family at all: three cubic Béziers reaching{' '}
          <span className="font-mono text-xs">1.528665r</span> along each edge, so it leaves the corner box and no
          exponent reproduces it. <span className="font-mono text-xs">one, measured</span> is the ruler — the red
          outline is <span className="font-mono text-xs">ContinuousCorner</span>&apos;s own geometry and{' '}
          <span className="font-mono text-xs">deviation</span> is our traced vertices measured against it. The other two
          scenes are the point: <span className="font-mono text-xs">n</span> is per shape, so a field can hold rects of
          different corner shape at once and bridge them.
        </p>
      </header>

      <div
        className={`
          flex flex-col gap-6
          xl:flex-row xl:items-start
        `}
      >
        <div
          className={`
            flex w-full shrink-0 flex-col gap-2
            xl:w-(--stage)
          `}
          style={{ '--stage': `${DISPLAY}px` } as CSSProperties}
        >
          <div
            className={`
              relative aspect-square w-full overflow-hidden rounded-2xl bg-neutral-900/5
              dark:bg-neutral-800/40
            `}
          >
            {/*
              The canvas owns the gesture. The SVG overlay above it is
              `pointer-events-none`, so a press lands here rather than being swallowed.
            */}
            <canvas
              ref={canvasRef}
              {...drag.handlers}
              className={`
                absolute inset-0 size-full cursor-grab touch-none
                active:cursor-grabbing
              `}
            />
            <svg
              viewBox={`0 0 ${VIEW} ${VIEW}`}
              className="pointer-events-none absolute inset-0 size-full"
              aria-hidden="true"
              style={{ visibility: appleVisible ? 'visible' : 'hidden' }}
            >
              <g ref={appleGroupRef}>
                <path ref={applePathRef} fill="none" stroke={COLORS.apple} strokeWidth={1.25} strokeDasharray="6 4" />
              </g>
            </svg>
          </div>
          <div className="flex flex-row flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-400">
            <span className="flex flex-row items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-[#818cf8]" />
              sdf trace
            </span>
            {appleVisible && (
              <span className="flex flex-row items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full bg-[rgb(244_63_94)]" />
                apple, exact
              </span>
            )}
            <span>dashed grey = the nominal boxes</span>
            <span>drag a centre dot to move a shape</span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <Field label="Scene">
            <Segmented
              testId="scene"
              value={sceneId}
              onChange={setSceneId}
              options={SCENES.map((option) => ({ value: option.id, label: option.label, title: option.note }))}
            />
          </Field>

          <div className="flex flex-row flex-wrap gap-x-8 gap-y-4">
            <Field
              label="Family"
              hint={scene.usesFamily ? undefined : 'the scene sets it'}
              allPossibleHints={['the scene sets it']}
            >
              <Segmented
                testId="family"
                value={familyId}
                onChange={setFamilyId}
                options={FAMILIES.map((option) => ({
                  value: option.id,
                  label: option.label,
                  title: option.note,
                  disabled: !scene.usesFamily,
                }))}
              />
            </Field>
            <Field
              label="k"
              hint={familyId === 'superellipse' && scene.usesFamily ? 'CSS corner-shape' : 'family sets it'}
              allPossibleHints={['CSS corner-shape', 'family sets it']}
            >
              <Segmented
                testId="k"
                value={k}
                onChange={setK}
                options={K_VALUES.map((value) => ({
                  value,
                  label: `${value}`,
                  disabled: familyId !== 'superellipse' || !scene.usesFamily,
                }))}
              />
            </Field>
            <Field label="Cell">
              <Segmented
                testId="cell"
                value={cell}
                onChange={setCell}
                options={CELL_SIZES.map((size) => ({ value: size, label: `${size}` }))}
              />
            </Field>
            <Field
              label="Bridge"
              hint={blend > 0 ? `folds gaps ≤ ${blend / 2}px` : undefined}
              allPossibleHints={BRIDGE_BLENDS.filter((value) => value > 0).map(
                (value) => `folds gaps ≤ ${value / 2}px`
              )}
            >
              <Segmented
                testId="bridge"
                value={blend}
                onChange={setBlend}
                options={BRIDGE_BLENDS.map((value) => ({
                  value,
                  label: value === 0 ? 'off' : `${value}`,
                  disabled: value > 0 && members.length < 2,
                }))}
              />
            </Field>
          </div>

          <label className="flex flex-row items-center gap-3 font-mono text-xs text-neutral-500">
            radius {String(radius).padStart(3)}
            <input
              type="range"
              min={0}
              max={90}
              value={radius}
              onChange={(event) => setRadius(Number(event.target.value))}
              data-testid="radius"
              className="w-48"
            />
          </label>

          <div className="flex flex-row flex-wrap gap-x-4 gap-y-2">
            <Toggle label="apple outline" checked={showApple} onChange={setShowApple} disabled={!scene.measured} />
            <Toggle label="fill" checked={showFill} onChange={setShowFill} />
          </div>

          <div
            className={`
              grid grid-cols-3 gap-x-4 gap-y-3 rounded-xl border border-neutral-200 p-3
              dark:border-neutral-800
            `}
            data-testid="corner-stats"
          >
            <Stat label="shapes" value={stats ? `${stats.shapes}` : '—'} />
            <Stat label="exponent n" value={stats ? stats.exponentLabel : '—'} />
            <Stat label="traced radius" value={stats ? stats.radiusLabel : '—'} />
            <Stat label="trace" value={stats ? `${stats.traceMs.toFixed(3)} ms` : '—'} />
            <Stat
              label="deviation max"
              value={fits ? `${stats.maxPx.toFixed(3)} px` : '—'}
              accent={fits && fitQuality > 0.01}
            />
            <Stat label="deviation mean" value={fits ? `${stats.meanPx.toFixed(3)} px` : '—'} />
            <Stat
              label="as a fraction of r"
              value={fits ? `${fitQuality.toFixed(4)} r` : '—'}
              accent={fits && fitQuality > 0.01}
            />
            <Stat label="vertices" value={stats ? `${stats.vertices}` : '—'} />
            <Stat label="loops" value={stats ? `${stats.loops}` : '—'} />
            <Stat label="field evals" value={stats ? `${stats.fieldEvals}` : '—'} />
          </div>

          <p className="max-w-prose text-xs/relaxed text-neutral-500">{scene.note}</p>
          {scene.usesFamily && <p className="max-w-prose text-xs/relaxed text-neutral-500">{family.note}</p>}

          {stats?.clamped === true && scene.measured && (
            <p
              className={`
                max-w-prose text-xs/relaxed text-amber-800
                dark:text-amber-400
              `}
            >
              Past the clamp. Apple&apos;s curve degrades per axis once{' '}
              <span className="font-mono">r / half &gt; 0.654166</span>, flattening toward a circular arc so a pill
              comes out a pill. A superellipse has no such rule — it keeps the same exponent at every radius — so the
              deviation above is the approximation running out, not the tracer losing accuracy.
              <br />
              The fit does not fail at this line, though: measured on this box it holds to{' '}
              <span className="font-mono">ρ = 0.8</span> (0.004r against 0.003r below the clamp) and then goes over a
              cliff — 0.017r at 0.83, 0.032r at 0.87, 0.083r at a fully saturated 1.0. The knee is between 0.80 and
              0.83, so the flattening is mild for the first fifth of its range and then sharp, which makes the crossover
              a warning rather than a verdict.
            </p>
          )}

          {blend > 0 && members.length > 1 && (
            <p className="max-w-prose text-xs/relaxed text-neutral-500">
              Bridged at <span className="font-mono">blend = {blend}</span>, which closes any gap up to{' '}
              <span className="font-mono">{blend / 2}px</span> — the fold lowers the field by at most{' '}
              <span className="font-mono">blend / 4</span>, and a gap&apos;s midpoint starts at half the gap. Corners of
              different sharpness folding into one contour is the one thing on this page that neither{' '}
              <span className="font-mono">corner-shape</span> nor <span className="font-mono">ContinuousCorner</span>{' '}
              can do — and also where measuring against Apple stops meaning anything, since a merged blob has no
              counterpart to be measured against.
              <br />
              Do not read <span className="font-mono">loops</span> as a count of pieces: a hole is a loop too, which is
              why the assorted scene reports 1 at <span className="font-mono">blend&nbsp;=&nbsp;48</span> and 2 at{' '}
              <span className="font-mono">72</span> — the heavier fold does not split anything, it encloses a gap.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
