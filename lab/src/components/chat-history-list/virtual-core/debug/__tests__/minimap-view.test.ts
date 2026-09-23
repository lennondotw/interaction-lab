/**
 * The minimap's view state, one describe block per defined rule. Positions on the canvas are
 * computed as (offset - top) * scale, as the scene does.
 */

import { describe, expect, it } from 'vitest';

import {
  fitScale,
  followViewport,
  initialMinimapView,
  minimapOffsetAt,
  minimapSafeMargin,
  minimapScale,
  scrollMinimapView,
  settleMinimapView,
  zoomMinimapView,
  type MinimapBounds,
  type MinimapView,
} from '../minimap-view.js';

const bounds: MinimapBounds = { height: 560, total: 20_000 };
const onCanvas = (view: MinimapView, offset: number, b = bounds) => (offset - view.top) * minimapScale(view, b);
const zoomed = (scale: number, top = 0): MinimapView => ({ zoomedScale: scale, top });

describe('fitted', () => {
  it('shows the whole list plus a safe margin at each end', () => {
    const view = followViewport(initialMinimapView, bounds, { offset: 0, size: 500 });
    expect(fitScale(bounds)).toBeCloseTo((560 - 2 * minimapSafeMargin) / 20_000, 12);
    expect(onCanvas(view, 0)).toBeCloseTo(minimapSafeMargin, 9);
    expect(onCanvas(view, bounds.total)).toBeCloseTo(bounds.height - minimapSafeMargin, 9);
  });

  it('recomputes the scale when the canvas is resized', () => {
    const taller = { height: 900, total: 20_000 };
    const view = settleMinimapView(initialMinimapView, taller);
    expect(minimapScale(view, taller)).toBe(fitScale(taller));
    expect(onCanvas(view, taller.total, taller)).toBeCloseTo(taller.height - minimapSafeMargin, 9);
  });

  it('never magnifies a short list past one pixel per pixel', () => {
    const short = { height: 560, total: 120 };
    const view = followViewport(initialMinimapView, short, { offset: 0, size: 120 });
    expect(minimapScale(view, short)).toBe(1);
    expect(onCanvas(view, 0, short)).toBe(minimapSafeMargin);
  });
});

describe('zoomed', () => {
  it('keeps an absolute scale when the total changes', () => {
    const view = zoomed(0.2, 6000);
    expect(minimapScale(view, { height: 560, total: 40_000 })).toBe(0.2);
    expect(minimapScale(view, { height: 560, total: 25_000 })).toBe(0.2);
  });

  it('keeps its scale and top when the canvas grows but fitting still shows less', () => {
    const view = settleMinimapView(zoomed(0.05, 6000), { height: 700, total: 20_000 });
    expect(view).toEqual({ zoomedScale: 0.05, top: 6000 });
  });
});

describe('fitting catches up with a zoom', () => {
  it('returns to fitted when the canvas grows until fitting shows as much', () => {
    const view = settleMinimapView(zoomed(0.05, 6000), { height: 1200, total: 20_000 });
    expect(view.zoomedScale).toBeNull();
  });

  it('stays fitted when the canvas shrinks again', () => {
    const grown = settleMinimapView(zoomed(0.05, 6000), { height: 1200, total: 20_000 });
    const shrunk = settleMinimapView(grown, bounds);
    expect(shrunk.zoomedScale).toBeNull();
    expect(minimapScale(shrunk, bounds)).toBe(fitScale(bounds));
  });

  it('returns to fitted when the total shrinks, and stays fitted when it grows back', () => {
    const shrunk = settleMinimapView(zoomed(0.05, 6000), { height: 560, total: 5000 });
    expect(shrunk.zoomedScale).toBeNull();
    expect(settleMinimapView(shrunk, bounds).zoomedScale).toBeNull();
  });

  it('already applies before the view is settled', () => {
    const view = zoomed(0.05, 6000);
    const large = { height: 1200, total: 20_000 };
    expect(minimapScale(view, large)).toBe(fitScale(large));
  });
});

describe('following the list viewport', () => {
  it('keeps the viewport a safe margin inside the canvas', () => {
    let view = followViewport(zoomed(0.2), bounds, { offset: 5000, size: 500 });
    expect(onCanvas(view, 5000)).toBeGreaterThanOrEqual(minimapSafeMargin - 1e-9);
    expect(onCanvas(view, 5500)).toBeLessThanOrEqual(bounds.height - minimapSafeMargin + 1e-9);
    view = followViewport(view, bounds, { offset: 9000, size: 500 });
    expect(onCanvas(view, 9500)).toBeCloseTo(bounds.height - minimapSafeMargin, 9);
    view = followViewport(view, bounds, { offset: 2000, size: 500 });
    expect(onCanvas(view, 2000)).toBeCloseTo(minimapSafeMargin, 9);
  });

  it('pans only as far as needed', () => {
    // Following pins the viewport to the bottom margin; moving it back up stays in view.
    const view = followViewport(zoomed(0.2), bounds, { offset: 5000, size: 500 });
    expect(followViewport(view, bounds, { offset: 4000, size: 500 }).top).toBe(view.top);
    // Moving further down than the margin allows pans by exactly the overshoot.
    expect(followViewport(view, bounds, { offset: 5100, size: 500 }).top - view.top).toBeCloseTo(100, 9);
  });

  it('pins a viewport moving past the bottom to the same place every step', () => {
    let view = followViewport(zoomed(0.2), bounds, { offset: 3000, size: 498 });
    const bottoms = new Set<number>();
    for (let offset = 3000; offset < 12_000; offset += 61.37) {
      view = followViewport(view, bounds, { offset, size: 498 });
      if (offset > 5000) bottoms.add(Math.round(onCanvas(view, offset + 498) * 1e6) / 1e6);
    }
    expect([...bottoms]).toEqual([bounds.height - minimapSafeMargin]);
  });

  it('shows the start of a viewport taller than the canvas', () => {
    const view = followViewport(zoomed(1), bounds, { offset: 4000, size: 2000 });
    expect(onCanvas(view, 4000)).toBeCloseTo(minimapSafeMargin, 9);
  });

  it('happens only when asked: settling leaves a scrolled view where it is', () => {
    const followed = followViewport(zoomed(0.2), bounds, { offset: 5000, size: 500 });
    const scrolled = scrollMinimapView(followed, bounds, 300);
    expect(settleMinimapView(scrolled, bounds).top).toBe(scrolled.top);
  });
});

describe('scrolling the minimap', () => {
  it('moves by the on-screen distance at the current scale', () => {
    expect(scrollMinimapView(zoomed(0.25, 4000), bounds, 100).top).toBe(4400);
  });

  it('stops a safe margin past either end of the list', () => {
    const view = zoomed(0.25, 4000);
    const margin = minimapSafeMargin / 0.25;
    expect(scrollMinimapView(view, bounds, -1e9).top).toBe(-margin);
    expect(scrollMinimapView(view, bounds, 1e9).top).toBe(bounds.total + margin - bounds.height / 0.25);
  });

  it('does not scroll a fitted list', () => {
    const view = settleMinimapView(initialMinimapView, bounds);
    expect(scrollMinimapView(view, bounds, 200).top).toBeCloseTo(view.top, 9);
  });
});

describe('zooming', () => {
  it('keeps the content under the pointer in place', () => {
    const view = zoomed(0.1, 6000);
    const before = minimapOffsetAt(view, bounds, 200);
    const after = zoomMinimapView(view, bounds, 200, -240);
    expect(minimapScale(after, bounds)).toBeGreaterThan(0.1);
    expect(minimapOffsetAt(after, bounds, 200)).toBeCloseTo(before, 9);
  });

  it('returns to fitted when zoomed out past it', () => {
    const view = zoomMinimapView(zoomed(0.05, 6000), bounds, 200, 5000);
    expect(view.zoomedScale).toBeNull();
    expect(minimapScale(view, bounds)).toBe(fitScale(bounds));
  });

  it('stops at one pixel per pixel', () => {
    expect(minimapScale(zoomMinimapView(zoomed(0.9, 6000), bounds, 200, -5000), bounds)).toBe(1);
  });
});
