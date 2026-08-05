/**
 * The two ways to parameterise a 1D affine map, and the conversions between them.
 *
 * ```
 * ScaleThenTranslate   y = s * x + t         t is in unscaled units
 * TranslateThenScale   y = s * (x + T)       T is in pre-scale units, so it gets magnified
 * ```
 *
 * ## Do not reach for these when emitting a CSS transform
 *
 * A CSS transform list composes as a matrix product and applies **right-to-left to a
 * point**. So `translateX(T) scaleX(s)` is `T · S`, which maps `x` to `s * x + T` — the
 * translate sits *outside* the scale and is **not** multiplied by it. Despite reading
 * "translate, then scale" in source order, that form is {@link ScaleThenTranslate}.
 *
 * Motion always serialises translate before scale (`transformPropOrder` in
 * `motion-dom/src/render/utils/keys-transform.ts` lists `translateX` ahead of `scaleX`),
 * so **anything handed to Motion as `style.translateX` is already `t`, and converting it
 * is a bug** — see the docblock on {@link ../use-liquid-stretch.js}, which used to divide
 * by the scale here and lost up to `(1 - 1/s)` of its intended displacement.
 *
 * Measured on a 200px box, `transform-origin` at its default centre:
 *
 * ```
 * translateX(10%) scaleX(2)    centre moves +20px    <- unscaled: this is t
 * scaleX(2) translateX(10%)    centre moves +40px    <- scaled by s: this is T
 * ```
 *
 * ## When they are genuinely needed
 *
 * Only when you own the ordering yourself — a `transformTemplate`, a hand-written
 * `matrix()`, or a nested element whose parent carries the scale. In those cases you may
 * legitimately want the translate *inside* the scale, and then `T = t / s` is the
 * conversion. Every identity below is exact for any `s`, including `s < 1` and `s < 0`.
 *
 * @module transform-utils
 */

export interface ScaleThenTranslate {
  /** Scale factor s: y = s * x + t */
  scale: number;
  /** Translation amount t: y = s * x + t */
  translate: number;
}

export interface TranslateThenScale {
  /** Scale factor s: y = s * (x + preTranslate) */
  scale: number;
  /** Pre-translation amount T: y = s * (x + T) */
  preTranslate: number;
}

/**
 * Convert "scale then translate" (y = s * x + t)
 * to equivalent "translate then scale" (y = s * (x + T)).
 */
export function toTranslateThenScale(params: ScaleThenTranslate): TranslateThenScale {
  const { scale, translate } = params;

  if (scale === 0) {
    throw new Error('scale must be non-zero to convert parameterization.');
  }

  return {
    scale,
    preTranslate: translate / scale, // T = t / s
  };
}

/**
 * Convert "translate then scale" (y = s * (x + T))
 * to equivalent "scale then translate" (y = s * x + t).
 *
 * Deliberately has no `scale === 0` guard, unlike {@link toTranslateThenScale}. The
 * asymmetry is real, not an oversight: at `s = 0` this direction always has a solution
 * (`s * (x + T)` collapses to 0, so `t = 0`), whereas the reverse has none unless `t` is
 * already 0.
 */
export function toScaleThenTranslate(params: TranslateThenScale): ScaleThenTranslate {
  const { scale, preTranslate } = params;

  return {
    scale,
    translate: scale * preTranslate, // t = s * T
  };
}

/**
 * Given s, t (scale then translate), return T (translate then scale).
 */
export function translateFromScaleThenTranslate(scale: number, translate: number): number {
  if (scale === 0) {
    throw new Error('scale must be non-zero to convert parameterization.');
  }
  return translate / scale;
}

/**
 * Given s, T (translate then scale), return t (scale then translate).
 */
export function translateFromTranslateThenScale(scale: number, preTranslate: number): number {
  return scale * preTranslate;
}
