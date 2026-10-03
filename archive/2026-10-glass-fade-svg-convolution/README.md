# SVG convolution instead of the browser Gaussian blur

Measured 2026-10-02 in Chrome 154.0.8037.95 on macOS, ANGLE/Metal on Apple M5 Ultra.
Viewport 1159 × 781, DPR 1 and 2, browser zoom 100%, React Scan disabled.

The shipped experiment is `Studies/Glass fade → SVG convolution → material strength · all progress bound, SVG convolution experiment`.
Controls switch `blurImplementation` between `css` and `svg-convolution` on the same panel.
The caption stays fixed during that switch so panel position cannot contaminate the comparison.

## Result

Custom `feConvolveMatrix` removes the two large jumps caused by the Gaussian blur's downsampling
pass changes. It does not produce infinitely continuous pixels: kernel coefficients and output
pixels still have finite precision. Plain SVG `feGaussianBlur` was separately tested before this
experiment and reproduced the CSS Gaussian thresholds.

Tint and content were held fixed while measuring the shipped component. Differences use the
maximum RGB channel delta per pixel, clear of the panel edge, on a 0–255 scale:

| DPR | progress    | CSS mean / max | convolution mean / max |
| --- | ----------- | -------------- | ---------------------- |
| 1   | 0.66 → 0.67 | 3.160 / 10     | 0.520 / 2              |
| 1   | 0.94 → 0.95 | 4.433 / 11     | 0.559 / 1              |
| 2   | 0.66 → 0.67 | 2.806 / 9      | 0.509 / 2              |
| 2   | 0.94 → 0.95 | 4.403 / 11     | 0.423 / 1              |

At a 20px full-strength target, a 120-frame local input scrub had median frame intervals of
16.7ms for both implementations. Convolution p95 was 16.7ms at both DPRs, with no intervals over
25ms after the first ten warmup frames. These are browser rAF intervals on this machine and
small panel, not GPU timings or a general production performance guarantee.

## Construction

A normalised, symmetric Gaussian kernel runs horizontally and vertically. Its support covers
three standard deviations of the full-strength target. Support is fixed throughout the ramp;
only weights change. Zero radius uses an exact identity kernel. Kernels sample bitmap pixels in
Chromium, so sigma and support account for DPR; Chromium does not apply `kernelUnitLength` here.

Skia limits each matrix to 256 coefficients. A 48px target initially exceeded this and produced
an effectively unfiltered image, while CSS at the same radius still blurred correctly. The
implementation now divides larger targets into a fixed number of pass pairs, distributing
variance as `sigma / sqrt(passes)`. Each centred matrix has at most 255 coefficients. The pass
count depends on the target and DPR, never on progress. At 20px / 2× there is one pair of
241-tap kernels; at 48px / 2× there are six pairs of 237-tap kernels.

Endpoint checks confirm that 0px remains clear and 20px / 48px actively blur at both DPRs.
This is an approximation with duplicate edge sampling, not a pixel-equivalent CSS replacement.
Larger targets require more passes; the frame interval measurement above covers the 20px target.
Other browser engines and transformed panels have not been verified.

Sources:

- [Chromium matrix convolution builder](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/platform/graphics/filters/fe_convolve_matrix.cc)
- [Skia kernel size limits](https://github.com/google/skia/blob/main/src/effects/imagefilters/SkMatrixConvolutionImageFilter.h)
- [Skia matrix convolution and A8 coefficient encoding](https://github.com/google/skia/blob/main/src/effects/imagefilters/SkMatrixConvolutionImageFilter.cpp)

## Reproduce

Start Storybook on 6010, then run:

```sh
STORYBOOK_URL=http://localhost:6010 node archive/2026-10-glass-fade-svg-convolution/probe.mjs
```

The probe uses installed Chrome. It saves the current measurements to `results.json` and
screenshots to `__screenshots__`. It drives the actual story, not a copy of the component.

Validation: four Gaussian kernel tests, lab TypeScript build, targeted lint and formatting,
and all 14 glass-fade stories mounted successfully in Chrome. The standard smoke launcher
could not find the matching bundled Playwright executable; HEAD's launcher failed identically.
The same smoke script was run using installed Chrome instead, without changing the repo launcher.
