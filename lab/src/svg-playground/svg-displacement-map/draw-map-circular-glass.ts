interface CircularGlassOptions {
  size?: number; // Displacement map pixel size, e.g., 256
  innerRatio?: number; // Radius ratio kept unchanged in the center; e.g., 0.8 means 80%
  gamma?: number; // > 1; larger values increase more sharply near the outer edge
  intensity?: number; // 0–1; used together with feDisplacementMap.scale
  clockwise?: boolean; // true: clockwise tangential direction; false: counterclockwise
}

interface CircularGlassResult {
  width: number;
  height: number;
  dataUrl: string;
}

export const drawCircularGlassDisplacementMap = (options: CircularGlassOptions = {}): CircularGlassResult | null => {
  const { size = 1024, innerRatio = 0.6, gamma = 3, intensity = 1.0 } = options;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  const imageData = ctx.createImageData(size, size);
  const { data } = imageData;

  // Center and maximum radius (fills the map)
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2; // Corresponds to normalized nd = 1

  const r0 = Math.max(0, Math.min(innerRatio, 1)); // Clamp safely to 0–1

  const toChannel = (v: number) => {
    // v ∈ [-1, 1] → [0, 255]; 0 means -1, 255 means +1, 0.5 corresponds to 128
    const clamped = Math.max(-1, Math.min(1, v));
    return Math.round(255 * (0.5 + clamped * 0.5));
  };

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const idx = (py * size + px) * 4;

      const dx = px - cx;
      const dy = py - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Normalized radius: 0 at center, 1 at circle edge
      const nd = maxR === 0 ? 0 : dist / maxR;

      if (nd <= r0 || nd >= 1 || dist === 0) {
        // Inner 80% or outside the circle (outer theoretically unused): no displacement
        data[idx + 0] = 128; // R
        data[idx + 1] = 128; // G
        data[idx + 2] = 128; // B (unused)
        data[idx + 3] = 255; // A
        continue;
      }

      // Map [r0, 1] to [0, 1] to control the strength curve
      const t = (nd - r0) / (1 - r0); // 0 at refraction start, 1 at the edge

      // Use convex function t^gamma to ensure:
      // - t=0 → 0 (continuous at r0)
      // - closer to 1, faster growth (“stronger near the rim”)
      const edgeFactor = Math.pow(t, gamma); // 0–1

      // Final strength: global intensity multiplied by edgeFactor
      const strength = intensity * edgeFactor; // 0–intensity

      // Unit radial vector
      const ux = dx / dist;
      const uy = dy / dist;

      // Tangential direction: rotation of the radial vector
      // (ux, uy) → (-uy, ux) CCW / (uy, -ux) CW
      const rx = -ux;
      const ry = -uy;

      // Tangential inward: choose a direction (e.g., CCW); adjust via clockwise or multiply by -1
      const nx = rx * strength;
      const ny = ry * strength;

      data[idx + 0] = toChannel(nx); // X displacement → R
      data[idx + 1] = toChannel(ny); // Y displacement → G
      data[idx + 2] = 128;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  const dataUrl = canvas.toDataURL('image/png');

  return {
    width: size,
    height: size,
    dataUrl,
  };
};
