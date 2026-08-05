/**
 * A region whose children keep their own layout, and whose shapes merge.
 *
 * The children are ordinary elements. They lay themselves out by the CSS box model —
 * flex, grid, padding, wrapping text, whatever — and the surface only *reads* the
 * boxes that produced. What it paints is a single merged contour, extracted from a
 * signed distance field whose primitives are those boxes, so two items that come
 * close bridge into one shape and pull apart again when they separate.
 *
 * Nothing here is layout-affecting. The overlay is absolutely positioned and takes no
 * pointer events, so it cannot move a child or intercept a click; `d`, `clip-path`
 * and `stroke-width` are all paint-time. The reflex to reach for `contain: layout` is
 * aimed at a stage this never touches — and per archive/2026-07-contour-to-dom, the
 * next suspicion after it (that a per-frame clip forces its subtree to re-raster)
 * also does not survive measurement.
 *
 * Three consumers of one traced `d`, which is the whole reason this is one component
 * rather than three:
 *
 * - **fill** — the merged shape painted behind the children.
 * - **outline** — an inner border, by either technique. `stroke-clip` centres a
 *   stroke of `2w` on the outline and clips it to the shape; `second-iso` traces the
 *   level set at `-w`, which is what "w px in from the edge" actually means on a
 *   distance field. They disagree in a narrow waist, where the iso offset correctly
 *   reports that nothing is left and breaks in two.
 * - **backdrop** — arbitrary content clipped to the shape, via `MetaSurface.Backdrop`.
 *
 * Cost is one trace per frame in which a rect actually changed, not one per frame.
 * See `useSurfaceTrace`.
 */

import { cn } from '@monorepo/utils';
import { Children, isValidElement, useCallback, useId, useMemo, useRef, type FC, type ReactNode } from 'react';

import { ShapeRegistry } from '#src/animations/sdf-edge-trace/rect-registry.js';

import { MetaSurfaceClipContext, MetaSurfaceContainerContext, MetaSurfaceRegistryContext } from './context.js';
import { MetaSurfaceItem } from './meta-surface-item.js';
import { useRegionSize, useSurfaceTrace, type SurfaceTraceResult } from './use-surface-trace.js';

export type OutlineMode = 'stroke-clip' | 'second-iso';

export interface MetaSurfaceProps {
  children?: ReactNode;
  className?: string;
  /** How far apart two items still merge, in px. */
  blend?: number;
  /** Marching-squares cell size in px. Smaller is smoother and costs more. */
  cell?: number;
  /** Fill colour for the merged shape, or null for no fill. */
  fill?: string | null;
  /** Inner border width in px. 0 for none. */
  outline?: number;
  outlineMode?: OutlineMode;
  outlineColor?: string;
  /** Notified after every trace. For instruments and debug panels. */
  onTraced?: (result: SurfaceTraceResult) => void;
}

interface MetaSurfaceComponent extends FC<MetaSurfaceProps> {
  Item: typeof MetaSurfaceItem;
  Backdrop: FC<BackdropProps>;
}

/**
 * Content clipped to the merged shape.
 *
 * Clips a layer *behind* the items rather than the items themselves — deliberately,
 * because clipping the participants would cut off their own content at the merged
 * boundary, which is almost never what a surface effect wants. An item that should be
 * clipped can carry its own `clip-path` from the context if it really needs to.
 */
interface BackdropProps {
  children?: ReactNode;
  className?: string;
  /**
   * Set false to place the content in the same layer but leave it uncut.
   *
   * The layer matters as much as the clip: rendering unclipped content as an ordinary
   * sibling instead would put it in a different stacking position, so switching the
   * effect off would change two things at once and the comparison would be worthless.
   * @default true
   */
  clip?: boolean;
}

const Backdrop: FC<BackdropProps> = () => null;

export const MetaSurface = (({
  children,
  className,
  blend = 40,
  cell = 2,
  fill = 'rgba(99, 102, 241, 0.22)',
  outline = 0,
  outlineMode = 'second-iso',
  outlineColor = '#6366f1',
  onTraced,
}) => {
  const uid = useId().replace(/:/g, '');
  const cssClipId = `meta-clip-css-${uid}`;
  const svgClipId = `meta-clip-svg-${uid}`;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const registry = useMemo(() => new ShapeRegistry(), []);
  const { width, height } = useRegionSize(containerRef);

  const surfacePathRef = useRef<SVGPathElement>(null);
  const clipCssRef = useRef<SVGPathElement>(null);
  const clipSvgRef = useRef<SVGPathElement>(null);
  const outlineStrokeRef = useRef<SVGPathElement>(null);
  const outlineRingRef = useRef<SVGPathElement>(null);

  const wantsRing = outline > 0 && outlineMode === 'second-iso';

  const handleTraced = useCallback(
    (result: SurfaceTraceResult) => {
      // Written straight onto the elements. Nothing in the tree depends on the curve,
      // so a state update here would be a render per layout change for no gain.
      surfacePathRef.current?.setAttribute('d', result.surface);
      clipCssRef.current?.setAttribute('d', result.surface);
      clipSvgRef.current?.setAttribute('d', result.surface);
      outlineStrokeRef.current?.setAttribute('d', result.surface);
      if (result.ring !== '') outlineRingRef.current?.setAttribute('d', result.ring);
      onTraced?.(result);
    },
    [onTraced]
  );

  useSurfaceTrace({
    registry,
    width,
    height,
    blend,
    cell,
    inset: wantsRing ? outline : 0,
    onTraced: handleTraced,
  });

  const clipIds = useMemo(() => ({ cssClipId, svgClipId }), [cssClipId, svgClipId]);

  // `Backdrop` renders nothing itself; the provider lifts its children into the
  // clipped layer so the clip lives below the items in paint order without the
  // consumer having to know that.
  const backdrops: ReactNode[] = [];
  const content: ReactNode[] = [];
  for (const child of Children.toArray(children)) {
    if (isValidElement<BackdropProps>(child) && child.type === Backdrop) {
      // The clip goes on each backdrop rather than on the shared layer, so one can opt out
      // without leaving the layer — see `BackdropProps.clip`.
      backdrops.push(
        <div
          key={child.key ?? backdrops.length}
          className={cn('absolute inset-0', child.props.className)}
          style={(child.props.clip ?? true) ? { clipPath: `url(#${cssClipId})` } : undefined}
        >
          {child.props.children}
        </div>
      );
    } else {
      content.push(child);
    }
  }

  return (
    <MetaSurfaceRegistryContext.Provider value={registry}>
      <MetaSurfaceContainerContext.Provider value={containerRef}>
        <MetaSurfaceClipContext.Provider value={clipIds}>
          <div ref={containerRef} data-slot="meta-surface" className={cn('relative isolate', className)}>
            {/*
          Below the children in paint order, and inert. An overlay that took pointer
          events would swallow every click meant for an item — the items keep their
          own hit areas precisely because this does not compete for them.
        */}
            {/*
              The negative z-index is load-bearing, not decoration. The overlay is a
              positioned element and the items are static, so positioned-above-static
              paints it over its own content no matter the DOM order. `isolate` on the
              container bounds the negative index to this stacking context; the one
              thing it costs is that the container must not paint its own background,
              or it would cover the surface.
            */}
            {/*
              No `viewBox`, deliberately. The traced `d` is already in region CSS px, and
              an `<svg>` without a viewBox maps one user unit to one CSS px from its own
              top-left — the identity this needs, for free.
              A viewBox would have to be `0 0 width height`, and `width`/`height` come
              from a ResizeObserver, so they are one frame behind the box during any
              resize. `preserveAspectRatio` then resolves that disagreement by *scaling
              and centring* the whole drawing: mid-drag on the gap slider, a 400px-wide
              box against a stale 512-unit viewBox painted the surface at 78% and 9px
              left of its items, which reads as the shape jittering under them.
            */}
            <svg aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 size-full overflow-visible">
              <defs>
                <clipPath id={cssClipId} clipPathUnits="userSpaceOnUse">
                  <path ref={clipCssRef} />
                </clipPath>
                <clipPath id={svgClipId} clipPathUnits="userSpaceOnUse">
                  <path ref={clipSvgRef} />
                </clipPath>
              </defs>

              <path ref={surfacePathRef} fill={fill ?? 'none'} />

              {outline > 0 && outlineMode === 'stroke-clip' && (
                <g clipPath={`url(#${svgClipId})`}>
                  {/*
                A stroke of 2w centred on the outline keeps exactly w of itself inside
                once clipped to the shape. Round joins are not cosmetic: the path is
                thousands of short marching-squares segments, and a mitered wide
                stroke spikes on every sharp turn.
              */}
                  <path
                    ref={outlineStrokeRef}
                    fill="none"
                    stroke={outlineColor}
                    strokeWidth={outline * 2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </g>
              )}

              {wantsRing && <path ref={outlineRingRef} fill={outlineColor} fillRule="evenodd" />}
            </svg>

            {backdrops.length > 0 && <div className="pointer-events-none absolute inset-0 -z-10">{backdrops}</div>}

            {content}
          </div>
        </MetaSurfaceClipContext.Provider>
      </MetaSurfaceContainerContext.Provider>
    </MetaSurfaceRegistryContext.Provider>
  );
}) as MetaSurfaceComponent;

MetaSurface.Item = MetaSurfaceItem;
MetaSurface.Backdrop = Backdrop;
