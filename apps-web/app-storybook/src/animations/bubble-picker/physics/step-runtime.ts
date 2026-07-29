import {
  MIN_GAP,
  RUNTIME_DAMPING,
  RUNTIME_PBD_ITERS,
  RUNTIME_PUSH_K,
  RUNTIME_REST_K,
  RUNTIME_WALL_K,
  SCALE_EASE_RATE,
  SELECTED_SCALE,
} from '../constants.js';
import type { BubbleState } from './bubble-state.js';

interface RuntimeBounds {
  width: number;
  height: number;
}

// Pairwise minimum centre distance. Uses the CURRENT scaled radii, so a
// selected bubble's grown radius starts shoving neighbours automatically,
// and includes the rest pose's gap + slack so the empty space between
// bubbles is preserved rather than squeezed out.
function pairMinDistance(a: BubbleState, b: BubbleState): number {
  return a.radius * a.scale + b.radius * b.scale + MIN_GAP + a.slack + b.slack;
}

// One physics step. Order matters; each phase only writes the things
// previous phases haven't claimed.
//
//   1. Scale ease — exponential decay toward target. dt-independent;
//      `1 - exp(-rate * dt)` is the canonical "ease at constant rate"
//      formula.
//   2. Spring back to restPos — PD's P term. Soft (RUNTIME_REST_K = 6/s)
//      so neighbours visibly let a popping bubble shove them out, instead
//      of fighting the push and ending up in a stalemate.
//   3. Pairwise repulsion — soft push producing the "neighbours move"
//      feel for free.
//   4. Wall spring — soft repel from canvas edges using
//      `radius * SELECTED_SCALE` so a mid-pop bubble can't poke past
//      the viewport.
//   5. Damping + integrate (semi-implicit Euler) — velocity dampens
//      first, then position uses the damped velocity.
//   6. PBD non-overlap — hard correction with the SELECTED-IS-IMMOVABLE
//      mass weight rule. Soft springs above can't fully resolve overlap
//      during a transient (~83% at equilibrium, worse during the pop), so
//      this is what guarantees zero visible overlap and pins the bubble
//      under the user's finger in place.
export function stepRuntime(
  bubbles: readonly BubbleState[],
  selectedIds: ReadonlySet<string>,
  bounds: RuntimeBounds,
  dt: number
): void {
  if (dt <= 0) return;

  const { width: w, height: h } = bounds;

  // 1. Scale ease.
  stepScaleOnly(bubbles, selectedIds, dt);

  // 2. Spring back to rest.
  for (const b of bubbles) {
    b.vel.x += (b.restPos.x - b.pos.x) * RUNTIME_REST_K * dt;
    b.vel.y += (b.restPos.y - b.pos.y) * RUNTIME_REST_K * dt;
  }

  // 3. Pairwise repulsion.
  for (let i = 0; i < bubbles.length; i++) {
    const a = bubbles[i];
    if (!a) continue;
    for (let j = i + 1; j < bubbles.length; j++) {
      const c = bubbles[j];
      if (!c) continue;
      const ddx = a.pos.x - c.pos.x;
      const ddy = a.pos.y - c.pos.y;
      const d = Math.hypot(ddx, ddy);
      const minDist = pairMinDistance(a, c);
      if (d > 0.001 && d < minDist) {
        const push = (minDist - d) * RUNTIME_PUSH_K;
        const nx = ddx / d;
        const ny = ddy / d;
        a.vel.x += nx * push * dt;
        a.vel.y += ny * push * dt;
        c.vel.x -= nx * push * dt;
        c.vel.y -= ny * push * dt;
      }
    }
  }

  // 4. Wall springs — only fire if a chain of selected-pop pushes shoves
  // a bubble against the canvas edge. effR uses SELECTED_SCALE so a
  // mid-pop bubble still has a margin.
  for (const b of bubbles) {
    const effR = b.radius * SELECTED_SCALE;
    const left = effR;
    const right = w - effR;
    const top = effR;
    const bottom = h - effR;
    if (b.pos.x < left) b.vel.x += (left - b.pos.x) * RUNTIME_WALL_K * dt;
    if (b.pos.x > right) b.vel.x -= (b.pos.x - right) * RUNTIME_WALL_K * dt;
    if (b.pos.y < top) b.vel.y += (top - b.pos.y) * RUNTIME_WALL_K * dt;
    if (b.pos.y > bottom) b.vel.y -= (b.pos.y - bottom) * RUNTIME_WALL_K * dt;
  }

  // 5. Damping + integrate (semi-implicit Euler).
  const velDecay = Math.max(0, 1 - RUNTIME_DAMPING * dt);
  for (const b of bubbles) {
    b.vel.x *= velDecay;
    b.vel.y *= velDecay;
    b.pos.x += b.vel.x * dt;
    b.pos.y += b.vel.y * dt;
  }

  // 6. PBD non-overlap. The SELECTED-IS-IMMOVABLE mass weights are
  // load-bearing: they keep the bubble under the user's finger fixed
  // while the unselected neighbour absorbs the entire correction.
  // Without this rule, taps feel slippery.
  for (let iter = 0; iter < RUNTIME_PBD_ITERS; iter++) {
    for (let i = 0; i < bubbles.length; i++) {
      const a = bubbles[i];
      if (!a) continue;
      for (let j = i + 1; j < bubbles.length; j++) {
        const c = bubbles[j];
        if (!c) continue;
        const ddx = a.pos.x - c.pos.x;
        const ddy = a.pos.y - c.pos.y;
        const d = Math.hypot(ddx, ddy);
        const minDist = pairMinDistance(a, c);
        if (d > 0.001 && d < minDist) {
          const overlap = minDist - d;
          const nx = ddx / d;
          const ny = ddy / d;
          const aSelected = selectedIds.has(a.id);
          const cSelected = selectedIds.has(c.id);
          let wA = 0.5;
          let wC = 0.5;
          if (aSelected && !cSelected) {
            wA = 0;
            wC = 1;
          } else if (!aSelected && cSelected) {
            wA = 1;
            wC = 0;
          }
          if (wA > 0) {
            a.pos.x += nx * overlap * wA;
            a.pos.y += ny * overlap * wA;
          }
          if (wC > 0) {
            c.pos.x -= nx * overlap * wC;
            c.pos.y -= ny * overlap * wC;
          }
        }
      }
    }
  }
}

// Subset step for the `paused` / reduced-motion path: keep the scale
// spring alive so toggling selection still animates, but skip the rest of
// the integrator so procedural drift / breathing freezes. `stepRuntime`
// reuses it as its own phase 1 so the two paths can never disagree about
// how fast a selection pops.
export function stepScaleOnly(bubbles: readonly BubbleState[], selectedIds: ReadonlySet<string>, dt: number): void {
  if (dt <= 0) return;
  const scaleAlpha = 1 - Math.exp(-SCALE_EASE_RATE * dt);
  for (const b of bubbles) {
    const target = selectedIds.has(b.id) ? SELECTED_SCALE : 1;
    b.scale += (target - b.scale) * scaleAlpha;
  }
}
