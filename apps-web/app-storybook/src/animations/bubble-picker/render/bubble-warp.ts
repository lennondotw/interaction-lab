import type { BubbleState } from '../physics/bubble-state.js';

// Polar harmonic boundary. The per-harmonic phase modulation
// (`phase`, `phase * 1.3`, `phase * 0.7`) keeps 20 bubbles wobbling
// uncorrelated even though they share one global clock — without it,
// shared `phase` per bubble + identical multipliers per harmonic would
// produce visible synchronization.
//
// `time` is in seconds; `harmSpeed` is in radians/second.
export function bubbleWarpRadius(bubble: BubbleState, angle: number, time: number, effectiveRadius: number): number {
  const { phase, harmAmp, harmSpeed } = bubble;
  const h =
    harmAmp[0] * Math.sin(2 * angle + time * harmSpeed[0] + phase) +
    harmAmp[1] * Math.sin(3 * angle + time * harmSpeed[1] + phase * 1.3) +
    harmAmp[2] * Math.sin(4 * angle + time * harmSpeed[2] + phase * 0.7);
  return effectiveRadius * (1 + h);
}
