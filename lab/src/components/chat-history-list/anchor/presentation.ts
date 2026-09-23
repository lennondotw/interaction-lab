/**
 * Presenting a fractional reading offset without letting the browser snap it.
 *
 * Browsers keep `scrollTop` on a grid of their own: the screen's device pixels in Chromium,
 * whole CSS pixels (truncated) in Safari on macOS and iOS. Writing a fractional offset makes
 * content hop between device pixels from one change to the next. Instead, `scrollTop` is set to
 * the reading offset rounded up to a step that is both on the browser's grid and a whole number
 * of device pixels, and a spacer above the content takes the remainder. Content then lands on
 * the same device pixel whatever the split. Measured in
 * `archive/2026-09-scroll-offset-quantization`.
 */

/** How closely a multiple of the step must hit a whole device pixel to count as one. */
const devicePixelTolerance = 1e-3;
/** No scroll step seen in practice needs more than a few multiples to reach a device pixel. */
const maxMultiples = 64;

/**
 * The smallest multiple of the browser's scroll step that is a whole number of device pixels,
 * returned exactly as that number of device pixels over the ratio, so it carries no error from
 * how the step was measured.
 */
export function alignedScrollStep(scrollStep: number, devicePixelRatio: number): number {
  if (!(scrollStep > 0) || !(devicePixelRatio > 0)) {
    throw new RangeError(
      `Scroll step and device pixel ratio must be positive, received ${scrollStep} and ${devicePixelRatio}.`
    );
  }
  for (let multiple = 1; multiple <= maxMultiples; multiple++) {
    const devicePixels = multiple * scrollStep * devicePixelRatio;
    if (Math.abs(devicePixels - Math.round(devicePixels)) < devicePixelTolerance) {
      return Math.round(devicePixels) / devicePixelRatio;
    }
  }
  throw new RangeError(
    `No multiple of the scroll step ${scrollStep} up to ${maxMultiples} is a whole number of device pixels at ${devicePixelRatio}x.`
  );
}

export interface ScrollPresentation {
  /** On the aligned step, at or above the reading offset. */
  scrollTop: number;
  /** Height of the spacer above the content: `scrollTop` minus the reading offset, below one step. */
  spacer: number;
}

/**
 * Split a reading offset into a `scrollTop` the browser keeps as written and a spacer. Content
 * at reading offset `r` then sits `r` above the viewport's top, exactly: `scrollTop - spacer`.
 * Rounding up keeps the spacer non-negative.
 */
export function presentReadingOffset(readingOffset: number, step: number): ScrollPresentation {
  const steps = Math.ceil(readingOffset / step);
  const scrollTop = steps * step;
  // A reading offset a rounding error above a step boundary would otherwise round up a whole
  // step and take a step of spacer; snap it to the boundary instead.
  if (Math.abs(scrollTop - step - readingOffset) < 1e-9) return { scrollTop: scrollTop - step, spacer: 0 };
  return { scrollTop, spacer: scrollTop - readingOffset };
}

/**
 * The browser's scroll step, measured on a scroller of its own: write fractional offsets and
 * see what the browser keeps. The step depends on the engine and the screen, not on the
 * scroller, so a hidden one answers for all of them.
 */
export function measureScrollStep(document: Document): number {
  const scroller = document.createElement('div');
  scroller.style.cssText =
    'position: fixed; left: -1000px; top: 0; width: 10px; height: 10px; overflow: scroll; visibility: hidden;';
  const content = document.createElement('div');
  content.style.height = '1000px';
  scroller.append(content);
  document.body.append(scroller);
  try {
    const kept = new Set<number>();
    for (let sixtyFourth = 0; sixtyFourth < 64; sixtyFourth++) {
      scroller.scrollTop = 100 + sixtyFourth / 64;
      kept.add(scroller.scrollTop);
    }
    const sorted = [...kept].sort((a, b) => a - b);
    let step = 1;
    for (let index = 1; index < sorted.length; index++) step = Math.min(step, sorted[index]! - sorted[index - 1]!);
    return step;
  } finally {
    scroller.remove();
  }
}
