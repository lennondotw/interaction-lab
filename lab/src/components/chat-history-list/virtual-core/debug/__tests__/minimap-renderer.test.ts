/**
 * The renderer against a recording context: pixel snapping, and which side of an edge each
 * 1px line is filled on.
 */

import { describe, expect, it } from 'vitest';

import { renderMinimap, snapToDevicePixel } from '../minimap-renderer.js';
import type { MinimapShape } from '../minimap-scene.js';

function record(shapes: MinimapShape[], dpr = 1) {
  const rects: { x: number; y: number; width: number; height: number; color: string }[] = [];
  const context = {
    fillStyle: '',
    font: '',
    textBaseline: '',
    setTransform() {},
    clearRect() {},
    fillText() {},
    fillRect(x: number, y: number, width: number, height: number) {
      rects.push({ x, y, width, height, color: this.fillStyle });
    },
  };
  renderMinimap(context as unknown as CanvasRenderingContext2D, shapes, { width: 96, height: 560, dpr });
  return rects;
}

describe('snapToDevicePixel', () => {
  it('rounds to the device grid', () => {
    expect(snapToDevicePixel(10.3, 1)).toBe(10);
    expect(snapToDevicePixel(10.3, 2)).toBe(10.5);
    expect(snapToDevicePixel(10.2, 2)).toBe(10);
  });

  it('does not flip between pixels on floating-point noise at a half-pixel boundary', () => {
    // A canvas 557.5px tall pins the bottom edge at 547.5: an exact half pixel, where noise
    // from the view arithmetic would otherwise round to alternating pixels frame to frame.
    for (const dpr of [1, 2, 3]) {
      const boundary = (Math.round(547.5 * dpr) + 0.5) / dpr;
      expect(snapToDevicePixel(boundary - 1e-10, dpr)).toBe(snapToDevicePixel(boundary, dpr));
      expect(snapToDevicePixel(boundary + 1e-10, dpr)).toBe(snapToDevicePixel(boundary, dpr));
    }
  });
});

describe('renderMinimap', () => {
  it('draws the frame edges inside its extent, the same distance from each end', () => {
    const rects = record([{ kind: 'frame', x: 1, width: 94, top: 10, bottom: 550, color: 'red' }]);
    const [top, bottom, left, right] = rects;
    expect(top).toEqual({ x: 1, y: 10, width: 94, height: 1, color: 'red' });
    expect(bottom).toEqual({ x: 1, y: 549, width: 94, height: 1, color: 'red' });
    expect(left).toEqual({ x: 1, y: 10, width: 1, height: 540, color: 'red' });
    expect(right).toEqual({ x: 94, y: 10, width: 1, height: 540, color: 'red' });
    expect(top!.y - 0).toBe(560 - (bottom!.y + 1));
  });

  it('keeps a collapsed frame at least two pixels tall', () => {
    const [top, bottom] = record([{ kind: 'frame', x: 1, width: 94, top: 100.2, bottom: 100.4, color: 'red' }]);
    expect(bottom!.y - top!.y).toBe(1);
  });

  it('fills start lines below their edge and end lines above it', () => {
    const [start, end] = record([
      { kind: 'edge', x: 0, y: 10, width: 96, side: 'below', color: 'blue' },
      { kind: 'edge', x: 0, y: 550, width: 96, side: 'above', color: 'blue' },
    ]);
    expect(start).toMatchObject({ y: 10, height: 1 });
    expect(end).toMatchObject({ y: 549, height: 1 });
  });

  it('draws fills at fractional positions as given', () => {
    const [fill] = record([{ kind: 'fill', x: 5, y: 12.37, width: 51.6, height: 3.2, color: 'grey' }]);
    expect(fill).toEqual({ x: 5, y: 12.37, width: 51.6, height: 3.2, color: 'grey' });
  });
});
