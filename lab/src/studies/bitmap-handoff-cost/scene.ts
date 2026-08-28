/**
 * Something complex and arbitrary to fill the buffer with, so the handoff is being measured
 * against a realistic amount of upstream work rather than against a solid colour.
 *
 * Deliberately per-pixel and deliberately not a displacement map: the question is what it
 * costs to get *any* JS-generated bitmap in front of the compositor, and a scene with a
 * recognisable structure invites reading meaning into the timings that is not there. What it
 * does share with a real map is the shape of the workload — a few dozen flops per pixel,
 * one pass, no reuse between frames.
 *
 * `octaves` is the knob that separates "the handoff is the bottleneck" from "the generation
 * is": at one octave the buffer is nearly free and the encoder is all that is left, at eight
 * the generation dominates and the encoder choice stops mattering. Both regimes are real,
 * which is why it is a control rather than a constant.
 *
 * Compression-hostile on purpose. Smooth gradients deflate well, and a PNG encoder measured
 * against them would look far better than it will on anything textured — so the last octave
 * is a high-frequency term that leaves the byte stream close to incompressible, which is the
 * pessimistic and therefore useful case.
 */

export const paintScene = (
  out: Uint8ClampedArray,
  width: number,
  height: number,
  frame: number,
  octaves: number
): void => {
  const t = frame * 0.017;
  const cx = width / 2;
  const cy = height / 2;
  const invW = 1 / width;
  const invH = 1 / height;

  for (let y = 0; y < height; y++) {
    const ny = y * invH;
    const dy = y - cy;
    let at = y * width * 4;

    for (let x = 0; x < width; x++) {
      const nx = x * invW;
      const dx = x - cx;

      // A swirl, so the field is not separable in x and y and the compiler cannot hoist
      // either axis out of the inner loop.
      const angle = Math.atan2(dy, dx) + t;
      const radius = Math.sqrt(dx * dx + dy * dy) * 0.03;

      let r = 0;
      let g = 0;
      let b = 0;
      let amplitude = 1;
      let frequency = 3;

      for (let o = 0; o < octaves; o++) {
        r += Math.sin(nx * frequency + angle * 2 + t) * amplitude;
        g += Math.sin(ny * frequency - radius * 3 + t * 1.3) * amplitude;
        b += Math.sin((nx + ny) * frequency + angle - t * 0.7) * amplitude;
        amplitude *= 0.55;
        frequency *= 2.1;
      }

      // A high-frequency dither on top, which is what keeps the bytes from compressing.
      const grain = ((x * 1103515245 + y * 12345 + frame) >>> 16) & 0x1f;

      out[at] = (r * 90 + 128 + grain) | 0;
      out[at + 1] = (g * 90 + 128 + grain) | 0;
      out[at + 2] = (b * 90 + 128 + grain) | 0;
      out[at + 3] = 255;
      at += 4;
    }
  }
};
