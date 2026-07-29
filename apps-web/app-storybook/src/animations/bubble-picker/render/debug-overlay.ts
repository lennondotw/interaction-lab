import { MIN_GAP } from '../constants.js';
import type { BubbleState } from '../physics/bubble-state.js';
import type { SettlePhase } from '../physics/layout-settle.js';

const TWO_PI = Math.PI * 2;

const SETTLE_FILL_IDLE = 'rgba(148, 163, 184, 0.18)';
const SETTLE_FILL_SELECTED = 'rgba(99, 102, 241, 0.35)';
const SETTLE_STROKE_IDLE = 'rgba(148, 163, 184, 0.7)';
const SETTLE_STROKE_SELECTED = 'rgba(99, 102, 241, 0.9)';
const SETTLE_LABEL_IDLE = 'rgba(15, 23, 42, 0.7)';
const SETTLE_LABEL_SELECTED = '#ffffff';
const SETTLE_LABEL_FONT = '500 5px system-ui, sans-serif';

const RIM_PHYS_IDLE = 'rgba(168, 85, 247, 0.55)';
const RIM_PHYS_SELECTED = 'rgba(168, 85, 247, 0.95)';
const RIM_CLAIM_IDLE = 'rgba(217, 70, 239, 0.45)';
const RIM_CLAIM_SELECTED = 'rgba(217, 70, 239, 0.85)';

const ANCHOR_CROSS_STROKE = 'rgba(15, 23, 42, 0.6)';
const ANCHOR_DISPLACEMENT_STROKE = 'rgba(234, 179, 8, 0.9)';
const ANCHOR_ENVELOPE_STROKE = 'rgba(15, 118, 110, 0.5)';

const ANCHOR_CROSS_HALF = 5;
const ANCHOR_DISPLACEMENT_MIN_SQ = 0.5;

// Render-mode replacement for the production cluster draw. Skips harmonic
// deformation, drift, glass shell, and the labels' production fonts. Plain
// circles at b.pos with the eased selection scale, so toggling a bubble
// still pops visually but the underlying layout math is exposed.
export function drawSettleSnapshot(
  ctx: CanvasRenderingContext2D,
  bubbles: readonly BubbleState[],
  selectedIds: ReadonlySet<string>
): void {
  ctx.save();
  ctx.font = SETTLE_LABEL_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const b of bubbles) {
    const r = b.radius * b.scale;
    const selected = selectedIds.has(b.id);

    ctx.beginPath();
    ctx.arc(b.pos.x, b.pos.y, r, 0, TWO_PI);
    ctx.fillStyle = selected ? SETTLE_FILL_SELECTED : SETTLE_FILL_IDLE;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = selected ? SETTLE_STROKE_SELECTED : SETTLE_STROKE_IDLE;
    ctx.stroke();

    ctx.fillStyle = selected ? SETTLE_LABEL_SELECTED : SETTLE_LABEL_IDLE;
    ctx.fillText(b.label, b.pos.x, b.pos.y);
  }

  ctx.restore();
}

// Two circles per bubble: the bubble's hard physics rim (`radius * scale`)
// as a solid stroke, and the bubble's half-share of pairwise minDist
// (`radius * scale + MIN_GAP/2 + slack`) as a dashed stroke. When two
// dashed circles meet tangent, the pair sits at exactly minDist; when
// they overlap, PBD relaxation is firing.
export function drawCollisionRims(
  ctx: CanvasRenderingContext2D,
  bubbles: readonly BubbleState[],
  selectedIds: ReadonlySet<string>
): void {
  ctx.save();
  ctx.lineWidth = 1;

  for (const b of bubbles) {
    const physR = b.radius * b.scale;
    const claimR = physR + MIN_GAP / 2 + b.slack;
    const selected = selectedIds.has(b.id);

    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(b.pos.x, b.pos.y, physR, 0, TWO_PI);
    ctx.strokeStyle = selected ? RIM_PHYS_SELECTED : RIM_PHYS_IDLE;
    ctx.stroke();

    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(b.pos.x, b.pos.y, claimR, 0, TWO_PI);
    ctx.strokeStyle = selected ? RIM_CLAIM_SELECTED : RIM_CLAIM_IDLE;
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.restore();
}

// Three marks per bubble:
//   * dark crosshair at restPos (anchor; never moves)
//   * yellow line from restPos to current pos (physics displacement)
//   * teal dashed circle at pos with radius `max(driftAmp.x, driftAmp.y)`
//     (where draw-time drift can push the visual centre)
//
// Because drift adds at draw time and physics never sees it, the envelope
// must orbit `pos`, not `restPos` — that's the actual visible range of
// the bubble's centre.
export function drawAnchors(ctx: CanvasRenderingContext2D, bubbles: readonly BubbleState[]): void {
  ctx.save();

  for (const b of bubbles) {
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ANCHOR_CROSS_STROKE;
    ctx.beginPath();
    ctx.moveTo(b.restPos.x - ANCHOR_CROSS_HALF, b.restPos.y);
    ctx.lineTo(b.restPos.x + ANCHOR_CROSS_HALF, b.restPos.y);
    ctx.moveTo(b.restPos.x, b.restPos.y - ANCHOR_CROSS_HALF);
    ctx.lineTo(b.restPos.x, b.restPos.y + ANCHOR_CROSS_HALF);
    ctx.stroke();

    const dx = b.pos.x - b.restPos.x;
    const dy = b.pos.y - b.restPos.y;
    if (dx * dx + dy * dy > ANCHOR_DISPLACEMENT_MIN_SQ) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = ANCHOR_DISPLACEMENT_STROKE;
      ctx.beginPath();
      ctx.moveTo(b.restPos.x, b.restPos.y);
      ctx.lineTo(b.pos.x, b.pos.y);
      ctx.stroke();
    }

    const envR = Math.max(b.driftAmp.x, b.driftAmp.y);
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = ANCHOR_ENVELOPE_STROKE;
    ctx.beginPath();
    ctx.arc(b.pos.x, b.pos.y, envR, 0, TWO_PI);
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.restore();
}

// ─── Settle replay ────────────────────────────────────────────────────

const REPLAY_PHASE_COLORS: Record<SettlePhase['kind'], { fill: string; stroke: string }> = {
  init: { fill: 'rgba(248, 113, 113, 0.18)', stroke: 'rgba(220, 38, 38, 0.7)' },
  main: { fill: 'rgba(96, 165, 250, 0.18)', stroke: 'rgba(37, 99, 235, 0.7)' },
  pbd: { fill: 'rgba(168, 85, 247, 0.18)', stroke: 'rgba(126, 34, 206, 0.85)' },
};

export interface SettleReplayFrameInput {
  positions: readonly { x: number; y: number }[];
  radii: readonly number[];
  labels: readonly string[];
  phase: SettlePhase;
  /** Affine transform from settle-coordinate space to canvas-coordinate space. */
  transform: { scale: number; offsetX: number; offsetY: number };
}

// Render one settle iteration to the canvas. Caller is responsible for
// clearing first. The transform lets the story fit the entire scatter
// trajectory inside its viewport even though early iterations span 2000+
// px while the final cluster sits in ~1000 px.
export function drawSettleReplayFrame(ctx: CanvasRenderingContext2D, input: SettleReplayFrameInput): void {
  const { positions, radii, labels, phase, transform } = input;
  const { scale, offsetX, offsetY } = transform;
  const colors = REPLAY_PHASE_COLORS[phase.kind];

  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = '500 5px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const [i, p] of positions.entries()) {
    const r = (radii[i] ?? 0) * scale;
    const cx = p.x * scale + offsetX;
    const cy = p.y * scale + offsetY;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TWO_PI);
    ctx.fillStyle = colors.fill;
    ctx.fill();
    ctx.strokeStyle = colors.stroke;
    ctx.stroke();

    if (r > 9) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
      ctx.fillText(labels[i] ?? '', cx, cy);
    }
  }

  ctx.restore();
}
