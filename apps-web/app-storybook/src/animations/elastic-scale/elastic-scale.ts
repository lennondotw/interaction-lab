/**
 * Elastic scale — a macOS-Dock-style fish-eye zoom for a row or column of
 * equally sized items.
 *
 * The core idea is to model the axis as a continuous elastic band that
 * gets stretched around the cursor.
 *
 * ## Mathematical model
 *
 * ### 1. Elastic band abstraction
 *
 * The whole axis is treated as one elastic band; the items are sampling
 * points on it. When the user hovers at `cursor`:
 *
 * - the band stretches locally around `cursor`
 * - `cursor` is pinned (the anchor) and does not move
 * - every other point is pushed away proportionally to the cumulative
 *   stretch between it and the anchor
 *
 * ### 2. Scale function (Gaussian)
 *
 * The local stretch rate at position `p` is
 *
 * ```
 * scale(p) = 1 + (maxScale - 1) × exp(-0.5 × ((p - cursor) / sigma)²)
 * ```
 *
 * - at `p = cursor`: scale = maxScale (maximum stretch)
 * - as `|p - cursor| → ∞`: scale → 1 (no stretch)
 * - `sigma` controls the influence radius
 *
 * ### 3. Position mapping via integration
 *
 * The new position `p'` of an original position `p` is the integral of
 * the scale function from the anchor:
 *
 * ```
 * p' = cursor + ∫[cursor → p] scale(t) dt
 * ```
 *
 * which satisfies the anchor constraint for free — at `p = cursor` the
 * integral is 0, so `p' = cursor`.
 *
 * ### 4. Translation
 *
 * The offset applied to an item laid out at `base` is
 *
 * ```
 * translate = p' - base = cursor + ∫[cursor → base] scale(t) dt - base
 * ```
 *
 * ## Visual behaviour
 *
 * ```
 * At rest:               Hovering item 3:
 *
 *    ████  item 0          ████  item 0 (pushed away)
 *    ████  item 1          ████  item 1 (pushed less)
 *    ████  item 2          ████  item 2 (slightly moved)
 *    ████  item 3 ← cursor ██████████  item 3 (scaled, anchored)
 *    ████  item 4          ████  item 4 (slightly moved)
 *    ████  item 5          ████  item 5 (pushed away)
 * ```
 *
 * ## Why this approach
 *
 * 1. **Continuity** — the anchor never moves, so the item under the
 *    cursor doesn't slide out from under it.
 * 2. **Physical intuition** — it behaves like a real elastic band.
 * 3. **Two knobs** — only `sigma` and `maxScale` to tune.
 * 4. **Numerical stability** — the Gaussian integral is well behaved.
 *
 * @module elastic-scale
 */

/**
 * Default maximum scale factor at the cursor. The item directly under
 * the cursor is scaled by this much.
 */
export const DEFAULT_MAX_SCALE = 2.5;

/**
 * Default sigma (standard deviation) of the Gaussian, in pixels.
 * Controls how far the effect spreads — smaller means tighter.
 */
export const DEFAULT_SIGMA = 35;

/** Steps used for the numerical integration. Higher = more accurate, slower. */
export const INTEGRATION_STEPS = 20;

/** Parameters for an elastic scale calculation. */
export interface ElasticScaleParams {
  /** Cursor coordinate along the axis (the anchor), in pixels. */
  cursor: number;
  /** Maximum scale factor at the cursor. */
  maxScale?: number;
  /** Spread of the Gaussian, in pixels. */
  sigma?: number;
}

/** Scale + translation for a single point. */
export interface ElasticScaleResult {
  /** Scale factor (1 = unscaled, 2 = double size). */
  scale: number;
  /** Translation along the axis, in pixels. */
  translate: number;
}

/** An item's resting position along the axis. */
export interface ItemPosition {
  /** Stable identifier. */
  id: string;
  /** Centre coordinate in the original (unscaled) layout. */
  base: number;
}

/** Result for a single item in a batch calculation. */
export interface ItemElasticResult extends ElasticScaleResult {
  /** Item identifier (same as input). */
  id: string;
  /** Original coordinate (same as input). */
  base: number;
  /** Coordinate after the transformation. */
  next: number;
}

/**
 * Scale factor at a given position — a Gaussian centred on the cursor.
 *
 * ```
 * scale(p) = 1 + (maxScale - 1) × exp(-0.5 × ((p - cursor) / sigma)²)
 * ```
 *
 * @example
 * ```ts
 * calculateScale(100, 100, 2.5, 50) // → 2.5   (at the cursor)
 * calculateScale(300, 100, 2.5, 50) // → ≈ 1.0 (far away)
 * ```
 */
export function calculateScale(
  position: number,
  cursor: number,
  maxScale: number = DEFAULT_MAX_SCALE,
  sigma: number = DEFAULT_SIGMA
): number {
  const distance = position - cursor;
  const exponent = -0.5 * (distance / sigma) ** 2;
  return 1 + (maxScale - 1) * Math.exp(exponent);
}

/**
 * Integrates the scale function from `a` to `b` with the midpoint rule,
 * i.e. `∫[a → b] scale(t) dt`.
 *
 * The integral is the stretched length of the band segment `[a, b]`. For
 * an unstretched band it equals `b - a`; the difference is the extra
 * space the stretch created. Sign is preserved, so `b < a` integrates
 * backwards.
 *
 * @example
 * ```ts
 * integrateScale(0, 100, 500, 1.0, 50) // → ≈ 100 (scale is 1 everywhere)
 * integrateScale(0, 100, 50, 2.0, 50)  // → > 100 (stretched near the cursor)
 * ```
 */
export function integrateScale(
  a: number,
  b: number,
  cursor: number,
  maxScale: number = DEFAULT_MAX_SCALE,
  sigma: number = DEFAULT_SIGMA,
  steps: number = INTEGRATION_STEPS
): number {
  if (a === b) return 0;

  const forward = b > a;
  const start = forward ? a : b;
  const end = forward ? b : a;
  const delta = (end - start) / steps;

  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const midpoint = start + (i + 0.5) * delta;
    sum += calculateScale(midpoint, cursor, maxScale, sigma) * delta;
  }

  return forward ? sum : -sum;
}

/**
 * Elastic scale transformation for a single point: the scale at `base`,
 * and the offset that moves it to its stretched position.
 *
 * @example
 * ```ts
 * calculateElasticScale(100, { cursor: 100, maxScale: 2.5 })
 * // → { scale: 2.5, translate: 0 }   — the anchor never moves
 *
 * calculateElasticScale(50, { cursor: 100, maxScale: 2.5 })
 * // → { scale: ~1.8, translate: -15 } — pushed away, approximate
 * ```
 */
export function calculateElasticScale(base: number, params: ElasticScaleParams): ElasticScaleResult {
  const { cursor, maxScale = DEFAULT_MAX_SCALE, sigma = DEFAULT_SIGMA } = params;

  const scale = calculateScale(base, cursor, maxScale, sigma);
  const next = cursor + integrateScale(cursor, base, cursor, maxScale, sigma);

  return { scale, translate: next - base };
}

/**
 * Batch version of {@link calculateElasticScale}, returning the extra
 * metadata that debug overlays and tests want.
 *
 * @example
 * ```ts
 * const items = [
 *   { id: 'item-0', base: 0 },
 *   { id: 'item-1', base: 16 },
 *   { id: 'item-2', base: 32 },
 * ]
 * const results = calculateItemsElasticScale(items, { cursor: 16 })
 * // results[1].translate === 0  (at the anchor)
 * // results[0].translate < 0    (pushed away)
 * // results[2].translate > 0    (pushed away)
 * ```
 */
export function calculateItemsElasticScale(
  items: readonly ItemPosition[],
  params: ElasticScaleParams
): ItemElasticResult[] {
  const { cursor, maxScale = DEFAULT_MAX_SCALE, sigma = DEFAULT_SIGMA } = params;

  return items.map((item) => {
    const scale = calculateScale(item.base, cursor, maxScale, sigma);
    const next = cursor + integrateScale(cursor, item.base, cursor, maxScale, sigma);
    return { id: item.id, base: item.base, next, scale, translate: next - item.base };
  });
}

/**
 * Centre coordinate of the item at `index`, assuming equally sized items
 * laid out along one axis.
 *
 * @example
 * ```ts
 * getItemCenter(0, 16) // → 8
 * getItemCenter(1, 16) // → 24
 * ```
 */
export function getItemCenter(index: number, itemSize: number): number {
  return index * itemSize + itemSize / 2;
}

/** Builds the input array for {@link calculateItemsElasticScale}. */
export function generateItemPositions(count: number, itemSize: number): ItemPosition[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    base: getItemCenter(i, itemSize),
  }));
}

/**
 * Whether a cursor coordinate falls inside the interactive range,
 * `[-padding, totalSize + padding]`.
 */
export function isWithinInteractiveRange(cursor: number, totalSize: number, padding = 0): boolean {
  if (totalSize <= 0) return false;
  return cursor >= -padding && cursor <= totalSize + padding;
}
