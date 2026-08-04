/**
 * The image the glass sits on. Built to make displacement *measurable by eye* rather
 * than to look nice.
 *
 * A photograph is the worst possible test surface: it has no straight lines, so a warp
 * of a few pixels is invisible and a warp of thirty looks like a warp of three. What a
 * refraction needs to be read against is a periodic signal — a grid tells you where
 * every pixel went, not just that something moved — plus enough tonal range that the
 * rim's compression is visible where the grid lines run out.
 *
 * Shared by every card, so the shapes are compared against one another rather than each
 * against its own backdrop.
 */

const GRID = 14;

export const drawBackdrop = (size: number, dpr: number): string | null => {
  const pixels = Math.max(1, Math.round(size * dpr));
  const canvas = document.createElement('canvas');
  canvas.width = pixels;
  canvas.height = pixels;

  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;
  ctx.scale(dpr, dpr);

  // A diagonal ramp under the grid: the grid shows where pixels moved, the ramp shows
  // how much the rim squeezes when no grid line happens to fall there.
  const ramp = ctx.createLinearGradient(0, 0, size, size);
  ramp.addColorStop(0, '#1a1f3a');
  ramp.addColorStop(0.45, '#2f6f8f');
  ramp.addColorStop(0.7, '#8f4f7f');
  ramp.addColorStop(1, '#f0a35e');
  ctx.fillStyle = ramp;
  ctx.fillRect(0, 0, size, size);

  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath();
  // Half-pixel offsets so a 1px line lands on a pixel instead of straddling two.
  for (let x = GRID; x < size; x += GRID) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, size);
  }
  for (let y = GRID; y < size; y += GRID) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(size, y + 0.5);
  }
  ctx.stroke();

  // Two heavy bars. Where a thin grid line only tells you it moved, a thick edge tells
  // you whether the rim also *bent* it, and near a crease the two differ.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fillRect(0, size * 0.34, size, 3);
  ctx.fillRect(size * 0.62, 0, 3, size);

  return canvas.toDataURL('image/png');
};
