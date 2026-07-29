import {
  MAX_R,
  MIN_GAP,
  SETTLE_DAMPING,
  SETTLE_DT,
  SETTLE_EDGE_PAD_FRACTION,
  SETTLE_GRAVITY_K,
  SETTLE_ITERS,
  SETTLE_PBD_ITERS,
  SETTLE_REPULSE_K,
  SETTLE_WALL_K,
  VERTICAL_PAD,
} from '../constants.js';
import { createRandomBubbleParams, type RandomBubbleParams } from './bubble-harmonics.js';
import type { BubbleState, Vec2 } from './bubble-state.js';

export interface SettleInput {
  ids: readonly string[];
  labels: readonly string[];
  viewportHeight: number;
  rng?: () => number;
}

export interface SettleResult {
  bubbles: BubbleState[];
  stageWidth: number;
}

/**
 * Optional recorder for visualizing the settle algorithm step-by-step.
 * Regular callers leave this undefined; the algorithm runs synchronously
 * in <5ms either way. When provided, `init` fires once with the per-bubble
 * immutable params, then `snapshot` fires after each iteration of each
 * phase.
 *
 * Phase semantics:
 *   * `'init'` — initial random scatter, before any iteration ran.
 *     `iter = 0`.
 *   * `'main'` — gravity + repulsion + wall + damping. `iter` is 0..499.
 *   * `'pbd'` — hard non-overlap relaxation + vertical clamp. `iter` is
 *     0..19.
 *
 * The horizontal recentering shift after PBD is a pure coordinate
 * translation, not a physics step, so it's not recorded — the last `pbd`
 * frame is the last meaningful state of the algorithm.
 *
 * `positions` holds live references into the running simulation; the
 * recorder MUST clone them if the snapshot is kept.
 */
export type SettlePhaseKind = 'init' | 'main' | 'pbd';

export interface SettlePhase {
  kind: SettlePhaseKind;
  iter: number;
}

export interface SettleRecorder {
  init(params: { radii: readonly number[]; labels: readonly string[] }): void;
  snapshot(phase: SettlePhase, positions: readonly Vec2[]): void;
}

/**
 * One simulated bubble during settle. `radius` / `slack` are hoisted out
 * of `random` because the O(n²) inner loops read them once per pair per
 * iteration; `random` is kept whole so step 6 can materialize the
 * `BubbleState` without a second lookup into a parallel array.
 */
interface SettleParticle {
  id: string;
  label: string;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  slack: number;
  random: RandomBubbleParams;
}

// Offline gravity-and-repulsion settle. Three forces fight in 500
// iterations:
//
//   1. Centroid attraction pulls every bubble toward the cluster's
//      current centroid (so the cloud collapses inward).
//   2. Pairwise hard repulsion fires whenever a pair's rim-to-rim distance
//      drops below `r[i] + r[j] + MIN_GAP + slack[i] + slack[j]`. The
//      per-bubble slack jitter is what gives the cluster its varied,
//      organic spacing instead of every pair sitting at exactly MIN_GAP.
//   3. Soft vertical wall springs keep the cluster inside `[VERTICAL_PAD,
//      h - VERTICAL_PAD]`.
//
// After settle, a 20-iteration PBD pass enforces the no-overlap +
// vertical-clamp constraints exactly. Then we shift the cluster so its
// leftmost rim sits at the small horizontal pad, and report the stage's
// total width to the caller.
//
// `n = ids.length` — the algorithm itself is count-agnostic; the visual
// budget is tuned for ~20 but works for 5–30 with the same parameters.
export function layoutSettle(input: SettleInput, recorder?: SettleRecorder): SettleResult {
  const n = input.ids.length;
  if (n === 0) throw new Error('layoutSettle needs at least one bubble');
  const rng = input.rng ?? Math.random;

  // Step 1 — generate per-bubble random parameters once. Drawn up front,
  // before any scatter draw, so a seeded `rng` produces the same cluster
  // on every run.
  const params = Array.from({ length: n }, () => createRandomBubbleParams(rng));

  // Step 2 — initial scatter. Wide enough that centroid gravity has real
  // displacement to pull from; settle compresses it back down.
  const yLo = VERTICAL_PAD + MAX_R;
  const yHi = input.viewportHeight - VERTICAL_PAD - MAX_R;
  const yRange = Math.max(1, yHi - yLo);
  const scatterW = n * 2.5 * MAX_R;

  const particles: SettleParticle[] = [];
  for (const [idx, id] of input.ids.entries()) {
    const random = params[idx];
    const label = input.labels[idx];
    if (!random || label === undefined) {
      throw new Error(`layoutSettle ids/labels length mismatch: ${n} vs ${input.labels.length}`);
    }
    particles.push({
      id,
      label,
      pos: { x: rng() * scatterW, y: yLo + rng() * yRange },
      vel: { x: 0, y: 0 },
      radius: random.radius,
      slack: random.slack,
      random,
    });
  }

  recorder?.init({ radii: particles.map((p) => p.radius), labels: input.labels });
  recorder?.snapshot(
    { kind: 'init', iter: 0 },
    particles.map((p) => p.pos)
  );

  // Step 3 — main settle loop.
  for (let iter = 0; iter < SETTLE_ITERS; iter++) {
    // 3a. Centroid.
    let cx = 0;
    let cy = 0;
    for (const p of particles) {
      cx += p.pos.x;
      cy += p.pos.y;
    }
    cx /= n;
    cy /= n;

    // 3b. Centroid gravity.
    for (const p of particles) {
      p.vel.x += (cx - p.pos.x) * SETTLE_GRAVITY_K * SETTLE_DT;
      p.vel.y += (cy - p.pos.y) * SETTLE_GRAVITY_K * SETTLE_DT;
    }

    // 3c. Pairwise repulsion. Personal-space slack means each pair has its
    // own minDist, so the cluster ends up with varied rim spacing.
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      if (!a) continue;
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        if (!b) continue;
        const dx = a.pos.x - b.pos.x;
        const dy = a.pos.y - b.pos.y;
        const d = Math.hypot(dx, dy);
        const minDist = a.radius + b.radius + MIN_GAP + a.slack + b.slack;
        if (d > 0.001 && d < minDist) {
          const push = (minDist - d) * SETTLE_REPULSE_K;
          const nx = dx / d;
          const ny = dy / d;
          a.vel.x += nx * push * SETTLE_DT;
          a.vel.y += ny * push * SETTLE_DT;
          b.vel.x -= nx * push * SETTLE_DT;
          b.vel.y -= ny * push * SETTLE_DT;
        }
      }
    }

    // 3d. Per-bubble vertical wall. Smaller bubbles can sit closer to the
    // band edges than the largest one, which reads more natural.
    for (const p of particles) {
      const rimYLo = VERTICAL_PAD + p.radius;
      const rimYHi = input.viewportHeight - VERTICAL_PAD - p.radius;
      if (p.pos.y < rimYLo) p.vel.y += (rimYLo - p.pos.y) * SETTLE_WALL_K * SETTLE_DT;
      if (p.pos.y > rimYHi) p.vel.y -= (p.pos.y - rimYHi) * SETTLE_WALL_K * SETTLE_DT;
    }

    // 3e. Damping + integrate (semi-implicit Euler).
    const decay = Math.max(0, 1 - SETTLE_DAMPING * SETTLE_DT);
    for (const p of particles) {
      p.vel.x *= decay;
      p.vel.y *= decay;
      p.pos.x += p.vel.x * SETTLE_DT;
      p.pos.y += p.vel.y * SETTLE_DT;
    }

    recorder?.snapshot(
      { kind: 'main', iter },
      particles.map((p) => p.pos)
    );
  }

  // Step 4 — hard PBD relaxation. Wall springs are too soft to guarantee
  // the cluster stays inside the vertical band; clamp by force, then
  // re-resolve the resulting overlaps along x only (preserve the clamped
  // y). 20 iterations covers the case where one resolution creates a new
  // overlap with a third bubble. All weights are 0.5 / 0.5 here because
  // nothing is "selected" during settle.
  const clampVertically = (p: SettleParticle): void => {
    const rimYLo = VERTICAL_PAD + p.radius;
    const rimYHi = input.viewportHeight - VERTICAL_PAD - p.radius;
    p.pos.y = Math.min(Math.max(p.pos.y, rimYLo), rimYHi);
  };

  for (let iter = 0; iter < SETTLE_PBD_ITERS; iter++) {
    for (const p of particles) clampVertically(p);

    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      if (!a) continue;
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        if (!b) continue;
        const dx = a.pos.x - b.pos.x;
        const dy = a.pos.y - b.pos.y;
        const d = Math.hypot(dx, dy);
        const minDist = a.radius + b.radius + MIN_GAP + a.slack + b.slack;
        if (d > 0.001 && d < minDist) {
          const overlap = minDist - d;
          const halfX = ((dx / d) * overlap) / 2;
          const halfY = ((dy / d) * overlap) / 2;
          a.pos.x += halfX;
          a.pos.y += halfY;
          b.pos.x -= halfX;
          b.pos.y -= halfY;
        }
      }
    }

    recorder?.snapshot(
      { kind: 'pbd', iter },
      particles.map((p) => p.pos)
    );
  }
  // Final vertical clamp in case the relaxation bumped anyone back out.
  for (const p of particles) clampVertically(p);

  // Step 5 — translate so the leftmost RIM sits at edgePad.
  const edgePad = MAX_R * SETTLE_EDGE_PAD_FRACTION;
  let minRim = Infinity;
  for (const p of particles) minRim = Math.min(minRim, p.pos.x - p.radius);
  const shiftX = edgePad - minRim;
  for (const p of particles) p.pos.x += shiftX;

  let maxRim = -Infinity;
  for (const p of particles) maxRim = Math.max(maxRim, p.pos.x + p.radius);
  const stageWidth = maxRim + edgePad;

  // Step 6 — materialize BubbleState records. Render cache fields are
  // zero-init; the caller fills `idleLines` / `selectedLines` / images.
  const bubbles: BubbleState[] = particles.map((p) => ({
    id: p.id,
    label: p.label,
    pos: { x: p.pos.x, y: p.pos.y },
    vel: { x: 0, y: 0 },
    restPos: { x: p.pos.x, y: p.pos.y },
    scale: 1,
    radius: p.radius,
    phase: p.random.phase,
    harmAmp: p.random.harmAmp,
    harmSpeed: p.random.harmSpeed,
    textureRotationDeg: p.random.textureRotationDeg,
    driftAmp: p.random.driftAmp,
    driftFreq: p.random.driftFreq,
    driftPhase: p.random.driftPhase,
    slack: p.slack,
    idleLines: [],
    selectedLines: [],
    idleLineHeight: 0,
    selectedLineHeight: 0,
    idleImage: null,
    selectedImage: null,
  }));

  return { bubbles, stageWidth };
}
