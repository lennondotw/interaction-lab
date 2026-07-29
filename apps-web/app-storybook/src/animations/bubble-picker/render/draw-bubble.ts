import { SELECTED_SCALE } from '../constants.js';
import type { BubbleState } from '../physics/bubble-state.js';
import { traceDeformedPath } from './deformed-path.js';
import { IDLE_LABEL_FONT, SELECTED_LABEL_FONT } from './label-fonts.js';

interface DrawContext {
  ctx: CanvasRenderingContext2D;
  procClockMs: number;
}

interface DrawClusterContentsOptions {
  procClockMs: number;
}

const IDLE_LABEL_FILL = 'rgba(1, 55, 136, 0.7)';
const SELECTED_LABEL_FILL = '#ffffff';

// Per-bubble draw. Layers stack bottom-up:
//
//   1. Bubble texture PNG (idle or selected variant), clipped to the
//      deformed silhouette and per-bubble texture-rotated.
//   2. Glass shell — two stacked radial gradients approximate a top-heavy
//      Fresnel halo plus a small angular specular cap. A real per-pixel
//      Fresnel ring with directional thickening would need a fragment
//      shader; in Canvas 2D the gradient stack is visually close and ~2
//      orders of magnitude cheaper.
//   3. 1 px / 50% white inner stroke. Stroke at double width then clip to
//      the path so only the inner half shows.
//   4. Label — pre-measured layouts; cross-fade color + shadow at the
//      selection scale midpoint, hard-swap glyph metrics at midpoint to
//      avoid per-frame `measureText`.
//
// Selection is read entirely off `b.scale`: the physics step eases it
// toward SELECTED_SCALE, so the draw path never needs the selection set.
export function drawBubble(b: BubbleState, dc: DrawContext): void {
  const { ctx, procClockMs } = dc;

  const timeSec = procClockMs / 1000;

  // Render-only drift. Physics never sees this — it's a draw-time offset
  // around the bubble's anchored b.pos so taps land precisely.
  const driftX = Math.sin(timeSec * b.driftFreq.x + b.driftPhase.x) * b.driftAmp.x;
  const driftY = Math.cos(timeSec * b.driftFreq.y + b.driftPhase.y) * b.driftAmp.y;
  const cx = b.pos.x + driftX;
  const cy = b.pos.y + driftY;

  // Effective radius combines base radius and the eased selection scale.
  const r = b.radius * b.scale;

  // Selection 0 -> 1 progress for color/shadow tween.
  const selectionT = Math.min(1, Math.max(0, (b.scale - 1) / (SELECTED_SCALE - 1)));

  // Texture swap fires at the midpoint of the scale ease so the visible
  // marble change reads simultaneously with the pop.
  const showSelectedTex = b.scale > 1 + (SELECTED_SCALE - 1) * 0.5;
  const activeImage = showSelectedTex ? b.selectedImage : b.idleImage;

  // ── Layer 1: bubble texture, clipped to deformed silhouette ──
  if (activeImage && activeImage.complete && activeImage.naturalWidth > 0) {
    ctx.save();
    traceDeformedPath(ctx, b, cx, cy, r, timeSec);
    ctx.clip();
    // Unselected bubbles render their texture at 50% alpha so the
    // selected ones read as more vivid by contrast.
    ctx.globalAlpha = 0.5 + selectionT * 0.5;

    const drawSize = r * 2.4;
    ctx.translate(cx, cy);
    ctx.rotate((b.textureRotationDeg * Math.PI) / 180);
    ctx.translate(-cx, -cy);
    ctx.drawImage(activeImage, cx - drawSize / 2, cy - drawSize / 2, drawSize, drawSize);
    ctx.restore();
  }

  // ── Layer 2: glass shell approximation ──
  // Two radial gradients stacked in clip-space: a top-heavy white halo
  // (Fresnel-style edge brightening, biased upward) plus a small specular
  // spot near the upper-left. Light position is fixed in viewport
  // coordinates for now; a per-bubble 3D-positioned point light is the
  // upgrade path when we want the highlight to track scroll.
  ctx.save();
  traceDeformedPath(ctx, b, cx, cy, r, timeSec);
  ctx.clip();

  // 2a. Top-heavy white inner halo (Fresnel + topWeight approximation).
  // Two stacked radial gradients: outer ring with broad reach, inner ring
  // limited to the upper hemisphere via positive y offset on the gradient
  // origin.
  const haloGrad = ctx.createRadialGradient(cx, cy - r * 0.35, r * 0.55, cx, cy, r);
  haloGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  haloGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0.04)');
  haloGrad.addColorStop(0.92, 'rgba(255, 255, 255, 0.18)');
  haloGrad.addColorStop(1, 'rgba(255, 255, 255, 0.32)');
  ctx.fillStyle = haloGrad;
  ctx.fillRect(cx - r * 1.2, cy - r * 1.2, r * 2.4, r * 2.4);

  // 2b. Small specular cap, biased toward the upper-left of each bubble.
  // The cap sits at a fixed offset relative to the bubble's center for
  // now — enough to read as "lit from above" without per-bubble 3D.
  const specCx = cx - r * 0.32;
  const specCy = cy - r * 0.42;
  const specGrad = ctx.createRadialGradient(specCx, specCy, 0, specCx, specCy, r * 0.45);
  specGrad.addColorStop(0, 'rgba(255, 246, 224, 0.55)');
  specGrad.addColorStop(0.4, 'rgba(255, 246, 224, 0.18)');
  specGrad.addColorStop(1, 'rgba(255, 246, 224, 0)');
  ctx.fillStyle = specGrad;
  ctx.fillRect(cx - r * 1.2, cy - r * 1.2, r * 2.4, r * 2.4);

  ctx.restore();

  // ── Layer 2.5: 1 px / 50% white inner stroke ──
  // Stroke at double width and clip to the path so only the inner half is
  // visible. This way the rim sits inside the silhouette and never bleeds
  // outward into anti-aliasing artefacts at the bubble edge.
  ctx.save();
  traceDeformedPath(ctx, b, cx, cy, r, timeSec);
  ctx.clip();
  // Re-trace because clip() consumes the current path.
  traceDeformedPath(ctx, b, cx, cy, r, timeSec);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.stroke();
  ctx.restore();

  // ── Layer 3: label ──
  drawLabel(ctx, b, cx, cy, selectionT);
}

function drawLabel(ctx: CanvasRenderingContext2D, b: BubbleState, cx: number, cy: number, selectionT: number): void {
  const showSelected = selectionT >= 0.5;
  const lines = showSelected ? b.selectedLines : b.idleLines;
  const lineHeight = showSelected ? b.selectedLineHeight : b.idleLineHeight;
  if (lines.length === 0 || lineHeight === 0) return;

  ctx.save();
  ctx.font = showSelected ? SELECTED_LABEL_FONT : IDLE_LABEL_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Cross-fade idle (#013788 @ 70%) -> selected (#fff) by selectionT.
  ctx.fillStyle = lerpColor(IDLE_LABEL_FILL, SELECTED_LABEL_FILL, selectionT);

  const shadowAlpha = 0.02 + selectionT * 0.02;
  ctx.shadowColor = `rgba(0, 0, 0, ${shadowAlpha})`;
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;

  const totalH = lines.length * lineHeight;
  const startY = cy - totalH / 2 + lineHeight / 2;
  for (const [i, line] of lines.entries()) {
    ctx.fillText(line, cx, startY + i * lineHeight);
  }
  ctx.restore();
}

// Tiny helper — parses rgb()/rgba()/#hex on the two endpoints, lerps in
// premultiplied-alpha space (close enough for our crossfade range).
function lerpColor(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  const r = Math.round(ca.r + (cb.r - ca.r) * t);
  const g = Math.round(ca.g + (cb.g - ca.g) * t);
  const bb = Math.round(ca.b + (cb.b - ca.b) * t);
  const aa = ca.a + (cb.a - ca.a) * t;
  return `rgba(${r}, ${g}, ${bb}, ${aa})`;
}

function parseColor(input: string): { r: number; g: number; b: number; a: number } {
  if (input.startsWith('#')) {
    const hex = input.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return { r, g, b, a: 1 };
  }
  const body = /rgba?\(([^)]+)\)/.exec(input)?.[1];
  if (body === undefined) return { r: 0, g: 0, b: 0, a: 1 };
  const parts = body.split(',').map((p) => parseFloat(p.trim()));
  return {
    r: parts[0] ?? 0,
    g: parts[1] ?? 0,
    b: parts[2] ?? 0,
    a: parts[3] ?? 1,
  };
}

// Walk the cluster and paint every bubble. The caller is responsible for
// clearing the canvas before this runs and for any overlay passes after.
// Splitting clear-and-draw responsibilities lets the picker layer debug
// overlays (collision rims, anchors) on top of the production cluster
// without re-entering this function.
export function drawClusterContents(
  ctx: CanvasRenderingContext2D,
  bubbles: readonly BubbleState[],
  options: DrawClusterContentsOptions
): void {
  for (const b of bubbles) {
    drawBubble(b, { ctx, procClockMs: options.procClockMs });
  }
}
