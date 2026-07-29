import type { BubbleState } from './physics/bubble-state.js';

// Logical-circle hit test. Drift is render-only and intentionally NOT
// included so taps land on the bubble's anchored center, not the visually
// drifted center — this is what keeps the gesture feeling precise.
//
// Walks back-to-front so the topmost bubble in paint order wins an
// overlapping tap.
export function hitTest(bubbles: readonly BubbleState[], px: number, py: number): BubbleState | null {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    if (!b) continue;
    const dx = px - b.pos.x;
    const dy = py - b.pos.y;
    const r = b.radius * b.scale;
    if (dx * dx + dy * dy <= r * r) return b;
  }
  return null;
}
