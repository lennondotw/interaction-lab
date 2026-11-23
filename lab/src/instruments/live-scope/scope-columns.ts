import type { LiveScopeSample } from './live-scope.js';

/** Reuse a device-pixel buffer. Empty columns stay distinct from a zero-valued sample. */
export function collectScopeColumns(
  columns: Float64Array,
  samples: readonly LiveScopeSample[],
  now: number,
  pixelsPerMs: number,
  barWidth: number
): number {
  columns.fill(-Infinity);
  const spanMs = columns.length / pixelsPerMs;
  // Quantize samples in fixed time coordinates, then translate the entire strip by one
  // rounded offset. Rounding each sample's screen position would change its neighbours' gaps.
  const origin = Math.round(now * pixelsPerMs) - columns.length;
  let visibleMax = 0;
  for (const sample of samples) {
    const age = now - sample.at;
    if (age < 0 || age > spanMs) continue;
    const left = Math.round(sample.at * pixelsPerMs - barWidth / 2) - origin;
    const start = Math.max(0, left);
    const end = Math.min(columns.length, left + barWidth);
    if (start < end) visibleMax = Math.max(visibleMax, sample.value);
    for (let column = start; column < end; column++) {
      columns[column] = Math.max(columns[column]!, sample.value);
    }
  }
  return visibleMax;
}

/**
 * Device pixels one bar covers: one nominal sampling period, rounded up and at least one pixel, so
 * samples arriving at their nominal rate leave no empty column between them. Rounded to the nearest
 * pixel, a period of 1.28 device pixels (93.75 samples a second at 120 device pixels a second) drew
 * 1-pixel bars with every third or fourth column empty: a thin dark line through a steady scope.
 * Overlapping bars keep each column's peak, so a wider bar never adds.
 */
export function scopeBarWidth(pixelsPerSecond: number, devicePixelRatio: number, sampleRate: number): number {
  return Math.max(1, Math.ceil((pixelsPerSecond * devicePixelRatio) / sampleRate - 1e-9));
}
