/**
 * The minimap scene built from a real core: rows, the viewport frame, the scroll start and end
 * lines, and fading size updates.
 */

import { cubicBezier } from 'motion';
import { describe, expect, it } from 'vitest';

import { createVirtualCore } from '../../virtual-core.js';
import { buildMinimapScene, minimapColors, type MinimapShape } from '../minimap-scene.js';
import { followViewport, initialMinimapView, minimapSafeMargin, type MinimapView } from '../minimap-view.js';

const flashEase = cubicBezier(0.42, 0, 1, 1);
const width = 96;
const height = 560;

function sceneFor(
  offset: number,
  view: MinimapView = initialMinimapView,
  flashes = new Map<string, number>(),
  now = 0,
  anchor: { ratio: number; key: string | null } | null = null
) {
  const core = createVirtualCore({ estimateSize: () => 100 });
  core.setKeys(Array.from({ length: 200 }, (_, index) => `m${index}`));
  core.setViewport({ offset, size: 500 });
  const settled = followViewport(view, { height, total: core.totalSize() }, core.viewport!);
  return buildMinimapScene({ core, view: settled, width, height, flashes, flashDuration: 600, flashEase, now, anchor });
}

const ofKind = <Kind extends MinimapShape['kind']>(shapes: readonly MinimapShape[], kind: Kind) =>
  shapes.filter((shape): shape is Extract<MinimapShape, { kind: Kind }> => shape.kind === kind);

describe('viewport frame', () => {
  it('sits a safe margin from the top at the start of the list', () => {
    const [frame] = ofKind(sceneFor(0).shapes, 'frame');
    expect(frame?.top).toBeCloseTo(minimapSafeMargin, 9);
  });

  it('sits the same margin from the bottom at the end of the list', () => {
    const [frame] = ofKind(sceneFor(20_000 - 500).shapes, 'frame');
    expect(frame?.bottom).toBeCloseTo(height - minimapSafeMargin, 9);
  });

  it('spans the width one pixel inside the border', () => {
    const [frame] = ofKind(sceneFor(0).shapes, 'frame');
    expect(frame).toMatchObject({ x: 1, width: width - 2, color: minimapColors.viewport });
  });
});

describe('rows', () => {
  it('fill the canvas mid-list when zoomed in', () => {
    const scene = sceneFor(10_000, { zoomedScale: 0.5, top: 0 });
    const rows = ofKind(scene.shapes, 'fill').filter((shape) => shape.color.startsWith('rgb(245 158 11'));
    expect(rows[0]!.y).toBeLessThanOrEqual(0);
    expect(rows.at(-1)!.y + rows.at(-1)!.height).toBeGreaterThanOrEqual(height);
  });

  it('are drawn only where the canvas can show them', () => {
    const scene = sceneFor(10_000, { zoomedScale: 0.5, top: 0 });
    const rows = ofKind(scene.shapes, 'fill').filter((shape) => shape.color.startsWith('rgb(245 158 11'));
    expect(rows.length).toBeLessThan(20);
  });
});

describe('scroll start and end lines', () => {
  it('mark the first and last pixel of the list across the full width', () => {
    const edges = ofKind(sceneFor(0).shapes, 'edge');
    expect(edges).toHaveLength(2);
    expect(edges[0]).toMatchObject({ x: 0, width, side: 'below' });
    expect(edges[0]!.y).toBeCloseTo(minimapSafeMargin, 9);
    expect(edges[1]).toMatchObject({ x: 0, width, side: 'above' });
    expect(edges[1]!.y).toBeCloseTo(height - minimapSafeMargin, 9);
  });

  it('are drawn under the viewport frame', () => {
    const kinds = sceneFor(0).shapes.map((shape) => shape.kind);
    expect(kinds.lastIndexOf('edge')).toBeLessThan(kinds.indexOf('frame'));
  });
});

describe('size update flashes', () => {
  it('fade out on the given curve and keep the scene animating', () => {
    const at = 1000;
    const alphaAt = (now: number) => {
      const scene = sceneFor(0, initialMinimapView, new Map([['m1', at]]), now);
      const flash = ofKind(scene.shapes, 'fill').find((shape) => shape.color.startsWith('rgb(34 211 238'));
      return { scene, alpha: flash ? Number(/\/ ([\d.]+)\)/.exec(flash.color)![1]) : null };
    };
    const start = alphaAt(at);
    const middle = alphaAt(at + 300);
    const end = alphaAt(at + 600);
    expect(start.alpha).toBeCloseTo(0.85, 9);
    expect(middle.alpha).toBeCloseTo(0.85 * (1 - flashEase(0.5)), 9);
    expect(start.scene.animating).toBe(true);
    expect(end.alpha).toBeNull();
    expect(end.scene.animating).toBe(false);
  });

  it('uses CSS ease-in, the curve the list overlay animates with', () => {
    // Reference points of cubic-bezier(0.42, 0, 1, 1).
    expect(flashEase(0.5)).toBeCloseTo(0.3154, 4);
    expect(flashEase(0.25)).toBeCloseTo(0.0934, 4);
  });

  it('ignore keys that are no longer in the window', () => {
    const scene = sceneFor(0, initialMinimapView, new Map([['gone', 0]]), 10);
    expect(scene.animating).toBe(false);
  });
});

describe('scale label', () => {
  it('reports content pixels per minimap pixel', () => {
    const [label] = ofKind(sceneFor(0).shapes, 'text');
    expect(label?.text).toBe(`1:${Math.round(20_000 / (height - 2 * minimapSafeMargin))}`);
  });
});

describe('anchor', () => {
  const anchorShapes = (shapes: readonly MinimapShape[]) =>
    shapes.filter((shape) => 'color' in shape && shape.color === minimapColors.anchor);

  it('draws nothing when anchoring is off', () => {
    expect(anchorShapes(sceneFor(5000).shapes)).toEqual([]);
  });

  it('fills the anchor row and draws the reference line at its ratio of the viewport', () => {
    const scene = sceneFor(5000, initialMinimapView, new Map(), 0, { ratio: 0.5, key: 'm52' });
    const [row] = ofKind(anchorShapes(scene.shapes), 'fill');
    const [line] = ofKind(anchorShapes(scene.shapes), 'edge');
    const [frame] = ofKind(scene.shapes, 'frame');
    const scale = (frame!.bottom - frame!.top) / 500;
    expect(row!.y).toBeCloseTo(frame!.top + (5200 - 5000) * scale, 9);
    expect(row!.height).toBeCloseTo(100 * scale, 9);
    expect(line).toMatchObject({ side: 'below' });
    expect(line!.y).toBeCloseTo(frame!.top + 250 * scale, 9);
  });

  it('puts the line above the bottom edge at ratio 1, and draws only the line without a key', () => {
    const scene = sceneFor(5000, initialMinimapView, new Map(), 0, { ratio: 1, key: null });
    const shapes = anchorShapes(scene.shapes);
    expect(shapes).toHaveLength(1);
    const [frame] = ofKind(scene.shapes, 'frame');
    expect(shapes[0]).toMatchObject({ kind: 'edge', side: 'above' });
    expect((shapes[0] as { y: number }).y).toBeCloseTo(frame!.bottom, 9);
  });
});
