/**
 * What the minimap draws, as plain shapes in CSS pixels. Built from the core and a settled
 * view with no canvas involved, so the geometry is tested directly.
 */

import type { VirtualCore, VirtualRange } from '../virtual-core.js';
import { minimapScale, type MinimapView } from './minimap-view.js';

export type MinimapShape =
  /** A filled rectangle, drawn at fractional positions as given. */
  | { kind: 'fill'; x: number; y: number; width: number; height: number; color: string }
  /** A 1px horizontal line on one side of `y`, snapped to the device pixel grid. */
  | { kind: 'edge'; x: number; y: number; width: number; side: 'below' | 'above'; color: string }
  /** A 1px outline whose edges lie inside `top`..`bottom`, snapped to the device pixel grid. */
  | { kind: 'frame'; x: number; width: number; top: number; bottom: number; color: string }
  | { kind: 'text'; x: number; y: number; text: string; font: string; color: string };

export const minimapColors = {
  measured: ['rgb(115 115 115 / 0.25)', 'rgb(115 115 115 / 0.45)'],
  estimated: ['rgb(245 158 11 / 0.35)', 'rgb(245 158 11 / 0.6)'],
  render: 'rgb(59 130 246 / 0.6)',
  visible: 'rgb(34 197 94 / 0.7)',
  viewport: 'rgb(239 68 68)',
  bounds: 'rgb(203 213 225 / 0.55)',
  flash: (alpha: number) => `rgb(34 211 238 / ${0.85 * alpha})`,
  label: 'rgb(115 115 115)',
};

/** Horizontal inset of the rows and strips; the viewport frame reaches past them into it. */
export const minimapInset = 5;
/** A flashing row is drawn at least this tall, so a row thinner than a pixel still shows. */
const minimumFlashHeight = 2;

export interface MinimapSceneInput {
  core: VirtualCore;
  /** Already settled for this frame. */
  view: MinimapView;
  width: number;
  height: number;
  /** When each row's size last changed, by key. */
  flashes: ReadonlyMap<string, number>;
  flashDuration: number;
  /** Maps fade progress 0..1 to eased progress; the highlight's opacity is 1 minus it. */
  flashEase: (progress: number) => number;
  now: number;
}

export interface MinimapScene {
  shapes: MinimapShape[];
  /** Some flash is still fading, so the scene changes on the next frame even if nothing else does. */
  animating: boolean;
}

/**
 * Layers, bottom to top: rows, fading size updates, render and visible range strips, the
 * scroll start and end lines, the viewport frame, and the scale label.
 */
export function buildMinimapScene({
  core,
  view,
  width,
  height,
  flashes,
  flashDuration,
  flashEase,
  now,
}: MinimapSceneInput): MinimapScene {
  const shapes: MinimapShape[] = [];
  const scale = minimapScale(view, { height, total: core.totalSize() });
  const y = (offset: number) => (offset - view.top) * scale;
  const inner = width - minimapInset * 2;
  const rowsWidth = inner * 0.6;
  const stripWidth = inner * 0.16;

  const range = core.rangeFor(view.top, view.top + height / scale);
  if (range) {
    for (let index = range.startIndex; index <= range.endIndex; index++) {
      const item = core.item(index);
      shapes.push({
        kind: 'fill',
        x: minimapInset,
        y: y(item.start),
        width: rowsWidth,
        height: item.size * scale,
        color: (item.measured ? minimapColors.measured : minimapColors.estimated)[index % 2]!,
      });
    }
  }

  // Size updates fade on the list overlay's curve.
  let animating = false;
  for (const [key, at] of flashes) {
    const progress = (now - at) / flashDuration;
    const index = core.indexOf(key);
    if (progress >= 1 || index === undefined) continue;
    animating = true;
    const item = core.item(index);
    shapes.push({
      kind: 'fill',
      x: minimapInset,
      y: y(item.start),
      width: rowsWidth,
      height: Math.max(minimumFlashHeight, item.size * scale),
      color: minimapColors.flash(1 - flashEase(progress)),
    });
  }

  const strip = (stripRange: VirtualRange | null, x: number, color: string) => {
    if (!stripRange) return;
    const start = core.item(stripRange.startIndex).start;
    const end = core.item(stripRange.endIndex).end;
    shapes.push({ kind: 'fill', x, y: y(start), width: stripWidth, height: (end - start) * scale, color });
  };
  strip(core.renderRange(), minimapInset + inner * 0.64, minimapColors.render);
  strip(core.visibleRange(), minimapInset + inner * 0.84, minimapColors.visible);

  // The first and last pixel of the list, across the full width: the outer border is a layer
  // above the canvas and covers their ends. Under the frame, which wins where they coincide.
  shapes.push({ kind: 'edge', x: 0, y: y(0), width, side: 'below', color: minimapColors.bounds });
  shapes.push({ kind: 'edge', x: 0, y: y(core.totalSize()), width, side: 'above', color: minimapColors.bounds });

  const viewport = core.viewport;
  if (viewport) {
    // One pixel inside the 1px border on each side.
    shapes.push({
      kind: 'frame',
      x: 1,
      width: width - 2,
      top: y(viewport.offset),
      bottom: y(viewport.offset + viewport.size),
      color: minimapColors.viewport,
    });
  }

  shapes.push({
    kind: 'text',
    x: minimapInset,
    y: height - 3,
    text: `1:${Math.round(1 / scale)}`,
    font: '10px ui-monospace, monospace',
    color: minimapColors.label,
  });

  return { shapes, animating };
}
