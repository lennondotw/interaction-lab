/**
 * Canvas renderer for the rect field: the quadtree overlay, the contour, and outlines of
 * the rects that seeded it.
 *
 * Separate from `on-canvas/renderer.ts` rather than parameterised, because that one draws
 * ball handles and a marching-ants dash and this one draws source rects — the shared part
 * is `buildPath2D` and the overlay convention, which is what both import.
 *
 * The overlay is the reason this story is on a canvas at all. Every other DOM route paints
 * the contour and nothing else; only the quadtree overlay shows *why* the cost is what it
 * is, and seeing it subdivide along a flex row while culling the padded remainder is the
 * one picture that explains both the box primitive and the domain padding at once.
 */

import { buildPath2D } from '../contour-path.js';
import { CELL_LEAF, type ContourTracer } from '../field.js';
import type { ShapeRect } from '../rect-registry.js';

const COLORS = {
  fill: 'rgba(99, 102, 241, 0.22)',
  stroke: '#6366f1',
  inset: 'rgba(244, 63, 94, 0.85)',
  culled: 'rgba(148, 163, 184, 0.3)',
  leaf: 'rgba(244, 63, 94, 0.45)',
  rect: 'rgba(226, 232, 240, 0.5)',
  domain: 'rgba(56, 189, 248, 0.5)',
};

export interface RectSceneOptions {
  tracer: ContourTracer;
  rects: readonly ShapeRect[];
  /** Region size in CSS px; the canvas shows exactly this and clips the rest. */
  width: number;
  height: number;
  dpr: number;
  showOverlay: boolean;
  showRects: boolean;
  showFill: boolean;
  showInset: boolean;
  /** Draw the padded sampling domain's edge, to show how much of it is empty. */
  showDomain: boolean;
}

export function renderRectScene(ctx: CanvasRenderingContext2D, options: RectSceneOptions): void {
  const { tracer, width, height, dpr } = options;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width * dpr, height * dpr);
  // 1 domain unit is 1 CSS px here — the field is seeded from CSS px rects — so the only
  // transform needed is the device-pixel ratio.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (options.showDomain) {
    ctx.strokeStyle = COLORS.domain;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, tracer.view - 1, tracer.view - 1);
    ctx.setLineDash([]);
  }

  if (options.showOverlay) {
    const rects = tracer.cellRects;
    ctx.lineWidth = 1;
    for (let n = 0; n < tracer.cellRectCount; n++) {
      const o = n * 5;
      const w = rects[o + 2] ?? 0;
      const h = rects[o + 3] ?? 0;
      const kind = rects[o + 4] ?? 0;
      // Sub-pixel leaves collapse into a solid smear; a filled dot reads better.
      if (kind === CELL_LEAF && w < 3) {
        ctx.fillStyle = COLORS.leaf;
        ctx.fillRect(rects[o] ?? 0, rects[o + 1] ?? 0, w, h);
        continue;
      }
      ctx.strokeStyle = kind === CELL_LEAF ? COLORS.leaf : COLORS.culled;
      ctx.strokeRect(rects[o] ?? 0, rects[o + 1] ?? 0, w, h);
    }
  }

  const surface = buildPath2D(tracer, { smooth: true, level: 0 });
  if (options.showFill) {
    ctx.fillStyle = COLORS.fill;
    ctx.fill(surface, 'nonzero');
  }
  ctx.strokeStyle = COLORS.stroke;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke(surface);

  if (options.showInset) {
    ctx.strokeStyle = COLORS.inset;
    ctx.lineWidth = 1.5;
    ctx.stroke(buildPath2D(tracer, { smooth: true, level: 1 }));
  }

  if (options.showRects) {
    // The sources, drawn as the browser laid them out. Where the contour hugs a rect the
    // two overlap; where the blend bridges two of them the contour departs from both,
    // which is the only way to see what the field added.
    ctx.strokeStyle = COLORS.rect;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    for (const rect of options.rects) {
      const r = Math.min(rect.radius, rect.width / 2, rect.height / 2);
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y, rect.width, rect.height, r);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
}
