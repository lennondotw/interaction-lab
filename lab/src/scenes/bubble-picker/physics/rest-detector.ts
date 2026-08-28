import { REST_POS_EPS, REST_SCALE_EPS, REST_VEL_EPS, SELECTED_SCALE } from '../constants.js';
import type { BubbleState } from './bubble-state.js';

// Cluster is "at rest" only when every bubble's scale matches its current
// selection target, every velocity is below half a px/s combined, and
// every bubble sits within half a px of its rest anchor. The instant the
// user toggles a selection, the relevant bubble's scale target shifts and
// `Math.abs(scale - target)` exceeds the threshold — the next frame's
// physics step kicks back in.
export function isClusterAtRest(bubbles: readonly BubbleState[], selectedIds: ReadonlySet<string>): boolean {
  for (const b of bubbles) {
    const target = selectedIds.has(b.id) ? SELECTED_SCALE : 1;
    if (Math.abs(b.scale - target) > REST_SCALE_EPS) return false;
    if (Math.abs(b.vel.x) + Math.abs(b.vel.y) > REST_VEL_EPS) return false;
    if (Math.abs(b.pos.x - b.restPos.x) + Math.abs(b.pos.y - b.restPos.y) > REST_POS_EPS) return false;
  }
  return true;
}
