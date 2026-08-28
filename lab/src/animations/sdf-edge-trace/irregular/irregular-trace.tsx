/**
 * Shapes the box family cannot reach: triangles, stars, irregular polygons, curved blobs.
 *
 * Everything traced in this folder until now was a rounded box — first a circular corner,
 * then the whole `corner-shape: superellipse(k)` family once the corner term became a p-norm.
 * None of that gets to a concave vertex: a star's notch is not a corner of any box at any
 * exponent, so it needed a second primitive rather than another parameter.
 *
 * `FieldShape.points` is that primitive, and the point of this story is that it is *one*
 * primitive covering all four things the shapes here look like:
 *
 * - a **triangle** is the smallest polygon,
 * - a **star** is a polygon whose vertices alternate radius,
 * - an **irregular polygon** is one with arbitrary radii,
 * - a **blob** is one flattened finely enough that the flattening does not show.
 *
 * The `round` control is what makes the last of those work, and it means something different
 * from a box's corner radius: on a box, `r` is inscribed *into* the corner and the outline
 * stays put; on a polygon it is a true outward **offset**, so the shape grows and every
 * corner — convex and reflex alike — is filleted. Push it far enough and a star's notches
 * close over entirely — at the largest offset here the 7-pointed star has become a cog, and
 * it reaches a disc if pushed past what the control offers.
 *
 * That does *not* change `loops`, and it is worth being clear about why, because it is easy to
 * assume otherwise: a filled-in notch is still one closed curve. Measured — the spread scene
 * reports 7 loops at every offset from 0 to 32. A loop count moves only when shapes merge into
 * each other or when a gap between them closes into a hole, which is what `bridge` does.
 *
 * `verify` is the honest part. It re-implements the field — polygon distance plus the same
 * smooth-min fold — in plain JS and reports the largest `|d|` over every traced vertex. On a
 * correct trace that is a fraction of a cell, and it is what says the concave sign test and
 * the quadtree cull agree with an outside reading rather than merely with themselves.
 */

import { cn } from '@monorepo/utils';
import { useIntervalEffect } from '@react-hookz/web';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FC } from 'react';

import { Field, Segmented, Stat, Toggle } from '#src/instruments/controls/controls.js';

import { buildPath2D } from '../contour-path.js';
import { ContourTracer, quadtreeSafeView, type FieldShape } from '../field.js';
import { CELL_SIZES, RollingMedian } from '../shape.js';
import { drawCentreHandles, useShapeDrag } from '../use-shape-drag.js';
import { SHAPE_KINDS, vertexCount } from './irregular-shapes.js';

const OVERSCAN = 128;
/**
 * Grab radius around a shape's centre. Generous, because the centre of a star or a cross is
 * not where the ink is — the handle has to be catchable without aiming at a hairline.
 */
const GRAB = 46;
/** Square sampling domain, padded so the quadtree keeps a large root. */
const VIEW = quadtreeSafeView(620);
/** CSS size of the stage; the domain stays at `VIEW` and the canvas scales down to it. */
const DISPLAY = 520;

const BRIDGE_BLENDS = [0, 24, 48, 72] as const;
const ROUNDS = [0, 6, 16, 32] as const;
const SEEDS = [1, 2, 3, 4] as const;

const COLORS = {
  fill: 'rgba(16, 185, 129, 0.15)',
  trace: '#34d399',
  hull: 'rgba(148, 163, 184, 0.35)',
  handle: 'rgba(52, 211, 153, 0.9)',
  label: 'rgba(148, 163, 184, 0.85)',
};

/** Where each kind sits, as a 3 × 3-ish arrangement that leaves the diagonals free to bridge. */
const SPREAD_LAYOUT = [
  { x: 0.24, y: 0.2, size: 74 },
  { x: 0.5, y: 0.19, size: 78 },
  { x: 0.77, y: 0.22, size: 80 },
  { x: 0.2, y: 0.52, size: 70 },
  { x: 0.5, y: 0.51, size: 76 },
  { x: 0.8, y: 0.53, size: 72 },
  { x: 0.5, y: 0.81, size: 84 },
] as const;

/** The same seven, pulled toward the centre until their outlines nearly touch. */
const CLUSTER_LAYOUT = [
  { x: 0.35, y: 0.32, size: 74 },
  { x: 0.55, y: 0.28, size: 70 },
  { x: 0.72, y: 0.42, size: 72 },
  { x: 0.3, y: 0.52, size: 66 },
  { x: 0.52, y: 0.5, size: 68 },
  { x: 0.71, y: 0.64, size: 64 },
  { x: 0.44, y: 0.7, size: 74 },
] as const;

type SceneId = 'spread' | 'cluster';

interface Stats {
  traceMs: number;
  vertices: number;
  loops: number;
  fieldEvals: number;
  shapes: number;
  polyVertices: number;
  worstResidual: number;
}

/** Polygon distance with an outward offset, reimplemented for `verify`. */
const sdPoly = (px: number, py: number, points: readonly number[], cx: number, cy: number, r: number): number => {
  const count = points.length / 2;
  let best = Infinity;
  let inside = false;
  for (let v = 0, j = count - 1; v < count; j = v++) {
    const ax = cx + (points[v * 2] ?? 0);
    const ay = cy + (points[v * 2 + 1] ?? 0);
    const bx = cx + (points[j * 2] ?? 0);
    const by = cy + (points[j * 2 + 1] ?? 0);
    const ex = bx - ax;
    const ey = by - ay;
    const wx = px - ax;
    const wy = py - ay;
    const len2 = ex * ex + ey * ey;
    const t = len2 > 0 ? Math.min(Math.max((wx * ex + wy * ey) / len2, 0), 1) : 0;
    const d2 = (wx - ex * t) ** 2 + (wy - ey * t) ** 2;
    if (d2 < best) best = d2;
    if (ay > py !== by > py && px < ax + ((py - ay) / (by - ay)) * (bx - ax)) inside = !inside;
  }
  return (inside ? -Math.sqrt(best) : Math.sqrt(best)) - r;
};

export const SdfIrregularShapes: FC<{ className?: string }> = ({ className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tracer = useMemo(() => new ContourTracer(VIEW, OVERSCAN, 1, 1), []);
  const samples = useMemo(() => new RollingMedian(30), []);
  const lastRef = useRef<Stats | null>(null);

  const [sceneId, setSceneId] = useState<SceneId>('spread');
  const [round, setRound] = useState<number>(6);
  const [blend, setBlend] = useState<number>(0);
  const [seed, setSeed] = useState<number>(1);
  const [cell, setCell] = useState<number>(1);
  const [showHull, setShowHull] = useState(true);
  const [showFill, setShowFill] = useState(true);
  const [verify, setVerify] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);

  const layout: FieldShape[] = useMemo(() => {
    const slots = sceneId === 'cluster' ? CLUSTER_LAYOUT : SPREAD_LAYOUT;
    return SHAPE_KINDS.map((kind, index) => {
      const slot = slots[index] ?? slots[0];
      return {
        x: slot.x * VIEW,
        y: slot.y * VIEW,
        // The offset grows the shape, so the nominal size shrinks to keep the slot's footprint
        // roughly fixed — otherwise raising `round` makes everything collide as well as round.
        points: kind.points(Math.max(slot.size - round * 0.6, 12), seed),
        r: round,
      };
    });
  }, [sceneId, round, seed]);

  // Owned here rather than by the hook, so pointing it at the newest `draw` is a plain ref
  // write instead of an assignment through a returned object.
  const drawRef = useRef<() => void>(() => undefined);
  const drag = useShapeDrag({ layout, view: VIEW, grab: GRAB, resetKey: sceneId, drawRef });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Positions come from the layout plus whatever each shape has been dragged by, so the
    // trace, the polygon outlines, the labels and `verify` all read one set of coordinates.
    const shapes = drag.placed();

    const dpr = window.devicePixelRatio || 1;
    const target = Math.round(VIEW * dpr);
    if (canvas.width !== target) {
      canvas.width = target;
      canvas.height = target;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const effectiveBlend = blend > 0 ? blend : 1e-6;
    const start = performance.now();
    const result = tracer.trace(shapes, {
      field: 'sdf',
      traversal: 'sparse',
      cell,
      radius: 0,
      sigma: 0,
      blend: effectiveBlend,
      collectCells: false,
    });
    samples.push(performance.now() - start);

    // Largest |field| over the traced vertices, against an independent reading of the same
    // field. Measured after the timer, so it never inflates the trace cost it is checking.
    let worst = 0;
    if (verify) {
      for (const loop of tracer.loops) {
        for (let step = 0; step < loop.count; step++) {
          const index = tracer.ordered[loop.start + step] ?? 0;
          const px = tracer.pointXY[index * 2] ?? 0;
          const py = tracer.pointXY[index * 2 + 1] ?? 0;
          let d = 1e9;
          for (const shape of shapes) {
            const di = sdPoly(px, py, shape.points ?? [], shape.x, shape.y, shape.r ?? 0);
            const h = Math.max(effectiveBlend - Math.abs(d - di), 0) / effectiveBlend;
            d = Math.min(d, di) - h * h * effectiveBlend * 0.25;
          }
          worst = Math.max(worst, Math.abs(d));
        }
      }
    }

    lastRef.current = {
      traceMs: 0,
      vertices: result.pointCount,
      loops: result.loopCount,
      fieldEvals: result.fieldEvals,
      shapes: shapes.length,
      polyVertices: vertexCount(shapes),
      worstResidual: verify ? worst : NaN,
    };

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, target, target);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // The polygons themselves, so the offset can be seen against what it was applied to.
    if (showHull) {
      ctx.strokeStyle = COLORS.hull;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      for (const shape of shapes) {
        const points = shape.points ?? [];
        ctx.beginPath();
        for (let v = 0; v < points.length / 2; v++) {
          const px = shape.x + (points[v * 2] ?? 0);
          const py = shape.y + (points[v * 2 + 1] ?? 0);
          if (v === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

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

    // Named only where the names can be read: in `cluster` the shapes sit on top of each
    // other and the labels land inside the merged mass, where they are noise rather than help.
    if (sceneId !== 'spread') return;
    ctx.fillStyle = COLORS.label;
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    for (let index = 0; index < shapes.length; index++) {
      const shape = shapes[index];
      const kind = SHAPE_KINDS[index];
      if (shape === undefined || kind === undefined) continue;
      let lowest = 0;
      const points = shape.points ?? [];
      for (let v = 0; v < points.length / 2; v++) lowest = Math.max(lowest, points[v * 2 + 1] ?? 0);
      ctx.fillText(kind.label, shape.x, shape.y + lowest + round + 16);
    }
  }, [blend, cell, drag, round, samples, sceneId, showFill, showHull, tracer, verify]);

  useEffect(() => {
    // The gesture redraws through this ref, so it stays stable while `draw` is rebuilt on
    // every control change.
    drawRef.current = draw;
    draw();
  }, [draw]);

  useIntervalEffect(() => {
    const last = lastRef.current;
    if (last === null) return;
    setStats({ ...last, traceMs: samples.value });
  }, 200);

  const residualOk = stats !== null && Number.isFinite(stats.worstResidual) && stats.worstResidual < cell;

  return (
    <div className={cn('mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6', className)}>
      <header className="flex flex-col gap-1">
        <h1
          className={`
            text-base font-medium text-neutral-900
            dark:text-neutral-100
          `}
        >
          Irregular shapes
        </h1>
        <p className="max-w-prose text-sm/relaxed text-neutral-500">
          Every earlier story here traced a rounded box — a circular corner, then the whole{' '}
          <span className="font-mono text-xs">superellipse(k)</span> family once the corner became a p-norm. None of
          that reaches a <em>concave</em> vertex, so a star needed a second primitive rather than another parameter.
          These seven are all the same one: <span className="font-mono text-xs">points</span>, a polygon with an outward
          offset. A star is a polygon with alternating radii, a blob is a smooth curve flattened until the flattening
          stops showing — under 0.05px off it, turning at most 5° per segment — and a triangle is the smallest there is.
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
              The canvas owns the gesture; nothing sits on top of it here, so no
              `pointer-events` juggling is needed. `touch-none` stops a touch drag from
              scrolling the page out from under the shape being moved.
            */}
            <canvas
              ref={canvasRef}
              {...drag.handlers}
              className={`
                absolute inset-0 size-full cursor-grab touch-none
                active:cursor-grabbing
              `}
            />
          </div>
          <div className="flex flex-row flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-400">
            <span className="flex flex-row items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-[#34d399]" />
              sdf trace
            </span>
            {showHull && <span>dashed grey = the polygon the offset was applied to</span>}
            <span>drag a centre dot to move a shape</span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="flex flex-row flex-wrap gap-x-8 gap-y-4">
            <Field label="Scene">
              <Segmented
                testId="scene"
                value={sceneId}
                onChange={setSceneId}
                options={[
                  { value: 'spread', label: 'spread' },
                  { value: 'cluster', label: 'cluster' },
                ]}
              />
            </Field>
            <Field label="Round" hint={round === 0 ? 'sharp' : `offset ${round}px`} allPossibleHints={['offset 32px']}>
              <Segmented
                testId="round"
                value={round}
                onChange={setRound}
                options={ROUNDS.map((value) => ({ value, label: value === 0 ? 'off' : `${value}` }))}
              />
            </Field>
            <Field label="Seed" hint="the irregular ones" allPossibleHints={['the irregular ones']}>
              <Segmented
                testId="seed"
                value={seed}
                onChange={setSeed}
                options={SEEDS.map((value) => ({ value, label: `${value}` }))}
              />
            </Field>
          </div>

          <div className="flex flex-row flex-wrap gap-x-8 gap-y-4">
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
                options={BRIDGE_BLENDS.map((value) => ({ value, label: value === 0 ? 'off' : `${value}` }))}
              />
            </Field>
          </div>

          <div className="flex flex-row flex-wrap gap-x-4 gap-y-2">
            <Toggle label="polygons" checked={showHull} onChange={setShowHull} />
            <Toggle label="fill" checked={showFill} onChange={setShowFill} />
            <Toggle label="verify" checked={verify} onChange={setVerify} />
          </div>

          <div
            className={`
              grid grid-cols-3 gap-x-4 gap-y-3 rounded-xl border border-neutral-200 p-3
              dark:border-neutral-800
            `}
            data-testid="irregular-stats"
          >
            <Stat label="shapes" value={stats ? `${stats.shapes}` : '—'} />
            <Stat label="polygon verts" value={stats ? `${stats.polyVertices}` : '—'} />
            <Stat label="trace" value={stats ? `${stats.traceMs.toFixed(3)} ms` : '—'} />
            <Stat label="contour verts" value={stats ? `${stats.vertices}` : '—'} />
            <Stat label="loops" value={stats ? `${stats.loops}` : '—'} />
            <Stat label="field evals" value={stats ? `${stats.fieldEvals}` : '—'} />
            <Stat
              label="max |field| on contour"
              value={
                stats && Number.isFinite(stats.worstResidual) ? `${stats.worstResidual.toFixed(3)} px` : 'not checked'
              }
              accent={stats !== null && Number.isFinite(stats.worstResidual) && !residualOk}
            />
          </div>

          {verify && (
            <p className="max-w-prose text-xs/relaxed text-neutral-500">
              <span className="font-mono">max |field|</span> is every traced vertex measured against a second,
              independent reading of the same field — polygon distance plus the same fold, in plain JS. Under one cell
              means the contour really is on the iso, which is what says the concave sign test and the quadtree&apos;s
              cull agree with an outside opinion rather than only with themselves.
            </p>
          )}

          <details className="max-w-prose text-xs/relaxed text-neutral-500">
            <summary className="cursor-pointer text-neutral-400">what each one is for</summary>
            <dl className="mt-2 flex flex-col gap-1.5">
              {SHAPE_KINDS.map((kind) => (
                <div key={kind.id} className="flex flex-col">
                  <dt className="font-mono text-[11px] text-neutral-400">{kind.label}</dt>
                  <dd>{kind.note}</dd>
                </div>
              ))}
            </dl>
          </details>

          <p className="max-w-prose text-xs/relaxed text-neutral-500">
            <span className="font-mono">round</span> is an outward <em>offset</em>, not a box&apos;s inscribed corner
            radius: the shape grows and every corner is filleted, reflex ones included. Take it to 32 and watch the
            star&apos;s notches and the cross&apos;s waist fill in — the 7-pointed star becomes a cog, and a disc if
            pushed further. Note that <span className="font-mono">loops</span> stays at 7 throughout: a filled-in notch
            is still one closed curve, and only merging shapes or a gap closing into a hole changes that count.
          </p>
        </div>
      </div>
    </div>
  );
};
