/**
 * Draws minimap shapes onto a 2D canvas. The only part of the minimap that touches canvas, so
 * swapping the drawing backend means replacing this file alone.
 */

import type { MinimapShape } from './minimap-scene.js';

/**
 * Snap a CSS pixel position to the device pixel grid. The small bias stops floating-point
 * noise at an exact .5 boundary (an edge pinned to the bottom computes as 550 or 549.9999…)
 * from flipping a line between two pixels from one frame to the next.
 */
export function snapToDevicePixel(value: number, dpr: number) {
  return Math.round(value * dpr + 1e-6) / dpr;
}

/** A frame is never drawn shorter than this, so its top and bottom edges stay distinct. */
const minimumFrameHeight = 2;

export function renderMinimap(
  context: CanvasRenderingContext2D,
  shapes: readonly MinimapShape[],
  { width, height, dpr }: { width: number; height: number; dpr: number }
) {
  const snap = (value: number) => snapToDevicePixel(value, dpr);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  for (const shape of shapes) {
    context.fillStyle = shape.color;
    switch (shape.kind) {
      case 'fill':
        context.fillRect(shape.x, shape.y, shape.width, shape.height);
        break;
      case 'edge': {
        // Filled on the given side of the edge, so a line marking a start and one marking an
        // end sit the same distance from what they bound.
        const y = snap(shape.y);
        context.fillRect(shape.x, shape.side === 'below' ? y : y - 1, shape.width, 1);
        break;
      }
      case 'frame': {
        const top = snap(shape.top);
        const bottom = Math.max(top + minimumFrameHeight, snap(shape.bottom));
        const right = shape.x + shape.width - 1;
        context.fillRect(shape.x, top, shape.width, 1);
        context.fillRect(shape.x, bottom - 1, shape.width, 1);
        context.fillRect(shape.x, top, 1, bottom - top);
        context.fillRect(right, top, 1, bottom - top);
        break;
      }
      case 'text':
        context.font = shape.font;
        context.textBaseline = 'bottom';
        context.fillText(shape.text, shape.x, shape.y);
        break;
    }
  }
}
