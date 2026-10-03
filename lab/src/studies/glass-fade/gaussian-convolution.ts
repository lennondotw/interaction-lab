/** Three standard deviations retain about 99.7% of the Gaussian's mass. */
const SUPPORT_SIGMAS = 3;

// Skia rejects more than 256 coefficients; a centred, odd-length kernel fits 255.
// https://github.com/google/skia/blob/main/src/effects/imagefilters/SkMatrixConvolutionImageFilter.h
const MAX_HALF_SUPPORT = 127;
const MAX_SIGMA_PER_PASS = MAX_HALF_SUPPORT / SUPPORT_SIGMAS;

/**
 * A separable Gaussian: the same normalised 1D kernel runs once horizontally and once
 * vertically. Support comes from the full-strength target, not the live radius, so scrubbing
 * never changes the matrix order or selects another convolution shader. Large targets use a
 * fixed number of pass pairs: Gaussian variances add, so each pair uses sigma/sqrt(passes).
 *
 * Chromium's feConvolveMatrix samples filter bitmap pixels rather than CSS pixels. Scale
 * sigma and support by DPR; kernelUnitLength is not used by its implementation. This is a
 * Chromium experiment at untransformed, 100% browser zoom, not a cross-browser blur polyfill.
 * https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/platform/graphics/filters/fe_convolve_matrix.cc
 */
export function gaussianConvolution(radius: number, targetRadius: number, dpr: number) {
  const passes = Math.max(1, Math.ceil(((targetRadius * dpr) / MAX_SIGMA_PER_PASS) ** 2));
  const half = Math.ceil((SUPPORT_SIGMAS * targetRadius * dpr) / Math.sqrt(passes));
  const sigma = (radius * dpr) / Math.sqrt(passes);
  const weights = Array.from({ length: 2 * half + 1 }, (_, index) => {
    // Zero is an exact identity kernel, including during a gesture passing through zero.
    if (sigma === 0) {
      return Number(index === half);
    }

    return Math.exp(-0.5 * ((index - half) / sigma) ** 2);
  });
  const sum = weights.reduce((total, weight) => total + weight, 0);

  return { half, matrix: weights.map((weight) => weight / sum).join(' '), order: weights.length, passes };
}
