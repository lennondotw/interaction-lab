/**
 * The minimap's view state: whether it fits the whole list or is zoomed, and which part of the
 * list it shows. Pure functions over plain data, so every rule is tested without a canvas.
 *
 * Defined behaviour (see the README's "Minimap view" section):
 * - Fitted, the whole list plus a safe margin at each end fills the canvas, and the scale is
 *   recomputed from the current height and total every time.
 * - Zoomed, the scale is absolute and survives changes to the height and the total.
 * - Once fitting would show at least as much as the zoom, the view returns to fitted and stays
 *   there; a later shrink does not bring the old zoom back.
 * - The view follows the list viewport only when the list reports that it moved.
 */

export interface MinimapView {
  /** Pixels per content pixel chosen by zooming, or null when fitted. Always above fitting. */
  zoomedScale: number | null;
  /** Content offset at the canvas's top edge. Negative while the top safe margin shows. */
  top: number;
}

export interface MinimapBounds {
  /** Canvas height in CSS pixels. */
  height: number;
  /** Total size of the list in content pixels. */
  total: number;
}

export interface ListViewport {
  offset: number;
  size: number;
}

/**
 * Space the minimap can scroll past the first and last pixel of the list, in CSS pixels. It
 * shows only at the ends; mid-list the rows fill the canvas. Following keeps the viewport
 * frame this far from the canvas edges.
 */
export const minimapSafeMargin = 10;
export const minimapZoomPerPixel = 0.002;

export const initialMinimapView: MinimapView = { zoomedScale: null, top: 0 };

/** Fitted, the whole list plus both safe margins fills the canvas, never magnified past 1:1. */
export function fitScale({ height, total }: MinimapBounds) {
  return Math.min(1, Math.max(0, height - minimapSafeMargin * 2) / Math.max(total, 1));
}

/** A zoom that no longer shows less than fitting is no zoom: the view is fitted. */
function isFitted(view: MinimapView, bounds: MinimapBounds) {
  return view.zoomedScale === null || view.zoomedScale <= fitScale(bounds);
}

/** Pixels per content pixel under the fitting rule, even before the view is settled. */
export function minimapScale(view: MinimapView, bounds: MinimapBounds) {
  return isFitted(view, bounds) ? fitScale(bounds) : Math.min(1, view.zoomedScale!);
}

/** The scrollable range runs from one safe margin before the list to one after it. */
function clampTop(top: number, bounds: MinimapBounds, scale: number) {
  const margin = minimapSafeMargin / scale;
  const span = bounds.height / scale;
  return Math.max(-margin, Math.min(bounds.total + margin - span, top));
}

/**
 * Apply the rules that depend on the current height and total: drop a zoom that fitting has
 * caught up with, then clamp to the scroll range. Run on every paint, since both can change at
 * any time.
 */
export function settleMinimapView(view: MinimapView, bounds: MinimapBounds): MinimapView {
  const zoomedScale = isFitted(view, bounds) ? null : view.zoomedScale;
  const scale = minimapScale(view, bounds);
  return { zoomedScale, top: clampTop(view.top, bounds, scale) };
}

/**
 * The list viewport moved: pan just far enough to keep it the safe margin inside the canvas.
 * A viewport taller than the canvas shows its start.
 */
export function followViewport(view: MinimapView, bounds: MinimapBounds, viewport: ListViewport): MinimapView {
  const scale = minimapScale(view, bounds);
  const margin = minimapSafeMargin / scale;
  const span = bounds.height / scale;
  const start = viewport.offset - margin;
  const end = viewport.offset + viewport.size + margin;
  const top = end - start >= span ? start : Math.min(start, Math.max(view.top, end - span));
  return settleMinimapView({ ...view, top }, bounds);
}

/** Scroll the minimap's own view by an on-screen distance, at its current scale. */
export function scrollMinimapView(view: MinimapView, bounds: MinimapBounds, deltaPixels: number): MinimapView {
  return settleMinimapView({ ...view, top: view.top + deltaPixels / minimapScale(view, bounds) }, bounds);
}

/**
 * Zoom by a wheel delta, keeping the content under the pointer where it is. Zooming out to or
 * past fitting returns to the fitted view.
 */
export function zoomMinimapView(
  view: MinimapView,
  bounds: MinimapBounds,
  pointerY: number,
  deltaY: number
): MinimapView {
  const anchor = minimapOffsetAt(view, bounds, pointerY);
  const next = Math.min(1, minimapScale(view, bounds) * Math.exp(-deltaY * minimapZoomPerPixel));
  const zoomed: MinimapView = { ...view, zoomedScale: next };
  return settleMinimapView({ ...zoomed, top: anchor - pointerY / minimapScale(zoomed, bounds) }, bounds);
}

/** The list offset under a point on the minimap, in CSS pixels from its top edge. */
export function minimapOffsetAt(view: MinimapView, bounds: MinimapBounds, pointerY: number) {
  return view.top + pointerY / minimapScale(view, bounds);
}
