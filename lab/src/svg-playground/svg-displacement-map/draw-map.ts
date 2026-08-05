const WIDTH = 256;
const HEIGHT = 256;

interface DisplacementMap {
  width: number;
  height: number;
  dataUrl: string;
}

export const drawDisplacementMap = (): DisplacementMap | null => {
  const canvas = document.createElement('canvas');

  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('Failed to get canvas context');
    return null;
  }

  const imageData = ctx.createImageData(WIDTH, HEIGHT);
  const { data } = imageData;

  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  const maxRadius = Math.min(cx, cy);

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const idx = (y * WIDTH + x) * 4;

      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);

      // 0 - 1, center 0, edge 1
      const t = Math.min(r / maxRadius, 1);

      // Outward displacement vector: unit vector * strength
      const strength = 1 - t; // Larger radius -> smaller displacement
      const nx = r === 0 ? 0 : (dx / r) * strength;
      const ny = r === 0 ? 0 : (dy / r) * strength;

      // feDisplacementMap treats 0.5 as zero; [-1, 1] maps to [0, 1]
      const toChannel = (v: number) => Math.round(255 * (0.5 + v * 0.5)); // Simple linear mapping and rounding

      const rChannel = toChannel(nx);
      const gChannel = toChannel(ny);

      data[idx + 0] = rChannel; // R → X
      data[idx + 1] = gChannel; // G → Y
      data[idx + 2] = 128; // B channel unused; use neutral gray
      data[idx + 3] = 255; // Alpha fully opaque
    }
  }

  ctx.putImageData(imageData, 0, 0);
  const dataUrl = canvas.toDataURL('image/png');

  return { width: WIDTH, height: HEIGHT, dataUrl };
};
