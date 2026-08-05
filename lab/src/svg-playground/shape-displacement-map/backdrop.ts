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

/**
 * Which grid lines are drawn heavy, as a fraction of the box.
 *
 * Two on each axis, so the pattern is symmetric and no shape can be favoured by where the heavy
 * lines happen to fall. Snapped to the grid rather than placed freely: a heavy line sitting *on*
 * a grid line can be read against its thin neighbours — same phase, so the eye compares like with
 * like — where an off-grid bar can only be compared with itself.
 *
 * At 0.28 and 0.72 each one crosses both the flat interior and the rim band, which is where the
 * two readings a heavy line gives differ from a thin one's.
 */
const HEAVY_AT = [0.28, 0.72];

/** Heavy line positions, snapped to the nearest grid line. */
const heavyLines = (size: number): number[] => HEAVY_AT.map((fraction) => Math.round((size * fraction) / GRID) * GRID);

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

  // Four heavy lines, two per axis, each promoted from a grid line rather than added beside one.
  // Where a thin line only tells you *that* it moved, a thick edge tells you whether the rim also
  // bent it — pure translation and a curved displacement look identical at one pixel wide, and
  // near a crease those two readings are exactly what diverge.
  //
  // Offset by 1 so the 3px bar is concentric with the 1px line it replaces, which is what keeps
  // the two comparable.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  for (const at of heavyLines(size)) {
    ctx.fillRect(at - 1, 0, 3, size);
    ctx.fillRect(0, at - 1, size, 3);
  }

  return canvas.toDataURL('image/png');
};
