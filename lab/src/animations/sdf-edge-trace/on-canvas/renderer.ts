import { buildPath2D } from '../contour-path.js';
import { Ball, CELL_LEAF, ContourTracer } from '../field.js';

/**
 * Fixed palette rather than themed colours: the canvas draws over a
 * translucent surface in both light and dark mode, and these read on either.
 */
const COLORS = {
  fill: 'rgba(99, 102, 241, 0.26)',
  stroke: '#6366f1',
  culled: 'rgba(148, 163, 184, 0.35)',
  leaf: 'rgba(244, 63, 94, 0.5)',
  point: 'rgba(244, 63, 94, 0.9)',
  handle: 'rgba(100, 116, 139, 0.75)',
  handleActive: '#f43f5e',
};

export interface RenderOptions {
  tracer: ContourTracer;
  balls: readonly Ball[];
  radius: number;
  /** Canvas CSS px per domain unit. */
  scale: number;
  dpr: number;
  showOverlay: boolean;
  showPoints: boolean;
  showFill: boolean;
  smooth: boolean;
  /** Non-null enables the marching-ants stroke, in domain units. */
  dashOffset: number | null;
  activeBall: number | null;
}

export function renderScene(ctx: CanvasRenderingContext2D, options: RenderOptions): void {
  const { tracer, balls, radius, scale, dpr, activeBall } = options;
  // The canvas shows the view, not the whole sampled domain: everything the
  // overscan margin contributes is geometry that closes off-frame, and the
  // canvas clips it for free.
  const view = tracer.view;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, view * scale * dpr, view * scale * dpr);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  // Keep strokes at a constant on-screen width regardless of zoom.
  const px = 1 / scale;

  if (options.showOverlay) {
    const rects = tracer.cellRects;
    ctx.lineWidth = px;
    for (let n = 0; n < tracer.cellRectCount; n++) {
      const o = n * 5;
      const width = rects[o + 2] ?? 0;
      const height = rects[o + 3] ?? 0;
      const kind = rects[o + 4] ?? 0;
      // Sub-pixel leaf cells collapse into a solid smear; a filled dot reads better.
      if (kind === CELL_LEAF && width * scale < 3) {
        ctx.fillStyle = COLORS.leaf;
        ctx.fillRect(rects[o] ?? 0, rects[o + 1] ?? 0, width, height);
        continue;
      }
      ctx.strokeStyle = kind === CELL_LEAF ? COLORS.leaf : COLORS.culled;
      ctx.strokeRect(rects[o] ?? 0, rects[o + 1] ?? 0, width, height);
    }
  }

  const path = buildPath2D(tracer, { smooth: options.smooth });

  if (options.showFill) {
    ctx.fillStyle = COLORS.fill;
    ctx.fill(path, 'nonzero');
  }

  ctx.strokeStyle = COLORS.stroke;
  // Thin the stroke when vertices are shown so the dots stay the subject. At
  // small cell sizes they legitimately overlap into a solid line — that is the
  // honest picture of how dense the sampling is, not an artefact.
  ctx.lineWidth = (options.showPoints ? 1 : 2) * px;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (options.dashOffset !== null) {
    ctx.setLineDash([14 * px * 1.5, 10 * px * 1.5]);
    ctx.lineDashOffset = -options.dashOffset;
  } else {
    ctx.setLineDash([]);
  }
  ctx.stroke(path);
  ctx.setLineDash([]);

  if (options.showPoints) {
    ctx.fillStyle = COLORS.point;
    const r = 1.4 * px;
    for (const loop of tracer.loops) {
      for (let k = 0; k < loop.count; k++) {
        const idx = tracer.ordered[loop.start + k] ?? 0;
        ctx.beginPath();
        ctx.arc(tracer.pointXY[idx * 2] ?? 0, tracer.pointXY[idx * 2 + 1] ?? 0, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.lineWidth = 1.5 * px;
  let index = 0;
  for (const ball of balls) {
    ctx.strokeStyle = index === activeBall ? COLORS.handleActive : COLORS.handle;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, radius * 0.12, 0, Math.PI * 2);
    ctx.stroke();
    index++;
  }
}
