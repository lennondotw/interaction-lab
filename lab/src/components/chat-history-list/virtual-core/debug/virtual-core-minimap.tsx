import { cubicBezier } from 'motion';
import { useLayoutEffect, useRef, type FC } from 'react';

import { renderMinimap } from './minimap-renderer.js';
import { buildMinimapScene } from './minimap-scene.js';
import {
  followViewport,
  minimapOffsetAt,
  scrollMinimapView,
  settleMinimapView,
  zoomMinimapView,
  type MinimapBounds,
} from './minimap-view.js';
import { flashDuration, flashEasing, type PlaygroundModel } from './playground-model.js';

/** The list overlay's fade curve, evaluated for the canvas. */
const flashEase = cubicBezier(...flashEasing);
/** Pixels per wheel line, for devices that report `deltaMode` in lines. */
const wheelLinePixels = 16;

/**
 * Whole-list overview on a canvas. This component only wires it up: each frame a painter
 * settles the view (minimap-view), builds shapes from the core (minimap-scene) and draws them
 * (minimap-renderer). It never renders through React after mounting. The view itself lives on
 * the model, so the state panel can show it.
 *
 * The view follows the list viewport when the model reports that it moved, and once when the
 * canvas first gets a size, so the initial viewport is in view.
 *
 * The wheel scrolls the minimap's own view at its current zoom; Cmd + wheel zooms around the
 * pointer; dragging scrolls the list to the point under the pointer.
 */
export const VirtualCoreMinimap: FC<{ model: PlaygroundModel; onSeek: (offset: number) => void }> = ({
  model,
  onSeek,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current!;
    const canvas = canvasRef.current!;
    const context = canvas.getContext('2d')!;
    const { core } = model;
    let width = 0;
    let height = 0;
    let dpr = 1;
    const bounds = (): MinimapBounds => ({ height, total: core.totalSize() });
    const view = () => model.minimap.view;
    const setView = (next: typeof model.minimap.view) => {
      model.minimap = { view: next, height };
    };

    const paint = () => {
      if (width === 0 || height === 0) return;
      setView(settleMinimapView(view(), bounds()));
      const now = performance.now();
      model.pruneFlashes(now);
      const scene = buildMinimapScene({
        core,
        view: view(),
        width,
        height,
        flashes: model.flashes,
        flashDuration,
        flashEase,
        now,
      });
      renderMinimap(context, scene.shapes, { width, height, dpr });
      if (scene.animating) model.invalidate();
    };

    const resize = new ResizeObserver(() => {
      const box = container.getBoundingClientRect();
      const firstSize = height === 0;
      width = box.width;
      height = box.height;
      // Before the first size there is no scale to follow with; follow the initial viewport now.
      if (firstSize && core.viewport) setView(followViewport(view(), bounds(), core.viewport));
      dpr = window.devicePixelRatio;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      // Resizing clears the canvas; repaint now rather than show an empty frame.
      paint();
    });
    resize.observe(container);

    const pointerY = (event: MouseEvent) => event.clientY - canvas.getBoundingClientRect().top;
    const onPointerDown = (event: PointerEvent) => {
      canvas.setPointerCapture(event.pointerId);
      onSeek(minimapOffsetAt(view(), bounds(), pointerY(event)));
    };
    const onPointerMove = (event: PointerEvent) => {
      if (canvas.hasPointerCapture(event.pointerId)) onSeek(minimapOffsetAt(view(), bounds(), pointerY(event)));
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.metaKey) {
        setView(zoomMinimapView(view(), bounds(), pointerY(event), event.deltaY));
      } else {
        const unit =
          event.deltaMode === WheelEvent.DOM_DELTA_LINE
            ? wheelLinePixels
            : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
              ? height
              : 1;
        setView(scrollMinimapView(view(), bounds(), event.deltaY * unit));
      }
      model.invalidate();
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    // Not passive: the wheel scrolls or zooms the minimap, never the page.
    canvas.addEventListener('wheel', onWheel, { passive: false });
    const removeFollower = model.onViewportMove((viewport) => {
      if (height > 0) setView(followViewport(view(), bounds(), viewport));
    });
    const removePainter = model.addPainter(paint);
    return () => {
      removeFollower();
      removePainter();
      resize.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [model, onSeek]);

  return (
    // The row stretches this box to the window's height. The canvas is out of flow, so its
    // backing store never feeds back into the layout it is sized from.
    <div ref={containerRef} className="relative w-24 shrink-0 bg-neutral-500/10">
      {/* A pointer-only scrubber; the state panel carries the same numbers as text. */}
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 size-full cursor-ns-resize touch-none" />
      {/* Above the canvas, so full-width lines end under it. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 border border-neutral-500/30" />
    </div>
  );
};
