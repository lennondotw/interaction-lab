import { DRIFT_AMP_MAX, MAX_GAP, MAX_R, MIN_GAP, MIN_R } from '../constants.js';

const TWO_PI = Math.PI * 2;

export interface RandomBubbleParams {
  radius: number;
  phase: number;
  harmAmp: readonly [number, number, number];
  harmSpeed: readonly [number, number, number];
  textureRotationDeg: number;
  driftAmp: { x: number; y: number };
  driftFreq: { x: number; y: number };
  driftPhase: { x: number; y: number };
  slack: number;
}

// Per-bubble random distributions. Amplitude follows a 1/f-style decay
// (n=2 > n=3 > n=4) and signed speeds prevent the harmonic phases from
// locking into a global drift, so 20 bubbles read as independently alive.
export function createRandomBubbleParams(rng: () => number = Math.random): RandomBubbleParams {
  const sign = (): number => (rng() > 0.5 ? 1 : -1);
  const between = (lo: number, hi: number): number => lo + rng() * (hi - lo);
  const maxSlack = Math.max(0, (MAX_GAP - MIN_GAP) / 2);

  return {
    radius: between(MIN_R, MAX_R),
    phase: rng() * TWO_PI,
    harmAmp: [between(0.02, 0.034), between(0.012, 0.024), between(0.005, 0.013)] as const,
    harmSpeed: [sign() * between(0.45, 0.95), sign() * between(0.55, 1.1), sign() * between(0.7, 1.4)] as const,
    textureRotationDeg: rng() * 360,
    // Drift amplitude lives in [0.5, 1.0] * DRIFT_AMP_MAX so every bubble
    // visibly moves but no two march in lockstep. Frequencies are sub-1 Hz
    // so the motion reads as floating, not vibrating.
    driftAmp: {
      x: between(0.5, 1) * DRIFT_AMP_MAX,
      y: between(0.5, 1) * DRIFT_AMP_MAX,
    },
    driftFreq: {
      x: between(0.5, 1),
      y: between(0.5, 1),
    },
    driftPhase: {
      x: rng() * TWO_PI,
      y: rng() * TWO_PI,
    },
    slack: rng() * maxSlack,
  };
}
