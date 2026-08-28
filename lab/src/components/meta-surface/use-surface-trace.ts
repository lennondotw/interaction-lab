/**
 * Turns the registry's rects into a contour, once per frame in which something moved.
 *
 * Event-driven rather than per-frame. The three `sdf-edge-trace` stories re-trace
 * every frame because their shapes are always moving; a DOM surface's shape only
 * changes when layout does, so tracing on a rAF loop would burn a trace per frame to
 * redraw an identical curve. The registry emits, this marks dirty, and one frame
 * later a single trace covers however many items settled in that layout pass.
 *
 * The tracer is memoised on the *padded* view rather than the region size, which is
 * what makes a resize cheap: `quadtreeSafeView` quantises to 256, so dragging a
 * window across 200px of width reallocates nothing. It has to be memoised on
 * something, because the buffers are sized from the domain at construction.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { buildPathData } from '#src/components/meta-surface/sdf/contour-path.js';
import {
  ContourTracer,
  quadtreeSafeView,
  type FieldShape,
  type TraceConfig,
} from '#src/components/meta-surface/sdf/field.js';
import type { ShapeRegistry } from '#src/components/meta-surface/sdf/rect-registry.js';

/** Margin sampled past the region, and half the quadtree tile. */
export const SURFACE_OVERSCAN = 128;
/** Finest cell the tracer will ever be asked for; sizes its buffers. */
const MIN_CELL = 1;
/** Decimals kept per coordinate — 0.05px of round-off, invisible at any zoom. */
const PRECISION = 1;

export interface SurfaceTraceOptions {
  registry: ShapeRegistry;
  /** Region size in CSS px. The domain is padded up from the longer side. */
  width: number;
  height: number;
  /** smin blend radius: how far apart two items still merge. */
  blend: number;
  /** Marching-squares cell size in px. 2 is sub-pixel at these scales. */
  cell: number;
  /** Inner-contour distance for the `second-iso` outline, or 0 for none. */
  inset: number;
  /** Called after each trace with the fresh path data. */
  onTraced: (result: SurfaceTraceResult) => void;
}

export interface SurfaceTraceResult {
  /** Outer surface, in region coordinates. */
  surface: string;
  /** Surface plus the inset contour, for an `evenodd` ring fill. Empty without an inset. */
  ring: string;
  surfaceLoops: number;
  insetLoops: number;
  shapes: readonly FieldShape[];
  traceMs: number;
  fieldEvals: number;
  vertices: number;
}

export interface SurfaceTrace {
  /** The tracer, exposed so an instrument can re-trace the same geometry itself. */
  tracer: ContourTracer;
  /** Force a trace now, outside the dirty/rAF path. */
  retrace: () => void;
}

export function useSurfaceTrace(options: SurfaceTraceOptions): SurfaceTrace {
  const { registry, width, height, blend, cell, inset, onTraced } = options;

  const view = quadtreeSafeView(Math.max(width, height, 1));
  // Two levels always, so toggling the outline technique never reallocates. The
  // second level's edge cache is the only cost and it is idle when `inset` is 0.
  const tracer = useMemo(() => new ContourTracer(view, SURFACE_OVERSCAN, MIN_CELL, 2), [view]);

  // Only the callback goes through a ref, and it is synced in an effect rather than
  // during render — a consumer passing an inline `onTraced` would otherwise rebuild
  // `retrace` every render, and the subscription effect below would trace on each one.
  // The numeric config goes straight into the deps, where a change *should* retrace.
  const emitRef = useRef(onTraced);
  useEffect(() => {
    emitRef.current = onTraced;
  }, [onTraced]);

  const retrace = useCallback(() => {
    const emit = emitRef.current;
    const b = blend;
    const c = cell;
    const i = inset;
    const shapes = registry.shapes();
    if (shapes.length === 0) {
      emit({
        surface: '',
        ring: '',
        surfaceLoops: 0,
        insetLoops: 0,
        shapes,
        traceMs: 0,
        fieldEvals: 0,
        vertices: 0,
      });
      return;
    }

    const config: TraceConfig = {
      field: 'sdf',
      traversal: 'sparse',
      cell: c,
      // Unused: every shape carries its own extents. Present because a disc-shaped
      // caller needs it, and it is the fallback those optional fields resolve to.
      radius: 0,
      sigma: 0,
      blend: b,
      collectCells: false,
      inset: i,
    };

    const start = performance.now();
    const stats = tracer.trace(shapes, config);
    const traceMs = performance.now() - start;

    const surface = buildPathData(tracer, { smooth: true, precision: PRECISION, level: 0 });
    let ring = '';
    let insetLoops = 0;
    if (i > 0 && stats.levelsTraced > 1) {
      const inner = buildPathData(tracer, { smooth: true, precision: PRECISION, level: 1 });
      insetLoops = inner.loops;
      ring = surface.d + inner.d;
    }

    emit({
      surface: surface.d,
      ring,
      surfaceLoops: surface.loops,
      insetLoops,
      shapes,
      traceMs,
      fieldEvals: stats.fieldEvals,
      vertices: stats.pointCount,
    });
  }, [registry, tracer, blend, cell, inset]);

  // One redraw per frame in which anything moved, no redraw otherwise. The registry
  // already drops no-op `set` calls, so a plain window scroll — which fires every
  // participant's measure — does not even reach here.
  const frameRef = useRef<number | null>(null);
  const schedule = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      retrace();
    });
  }, [retrace]);

  useEffect(() => {
    const unsubscribe = registry.subscribe(schedule);
    // The region size is an input the registry knows nothing about, and `schedule`
    // itself changes whenever blend / cell / inset do, so this covers every config
    // change as well as the initial trace.
    schedule();
    return () => {
      unsubscribe();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [registry, schedule, width, height]);

  return { tracer, retrace };
}

/** Region size, observed. Drives the padded domain and the overlay's viewBox. */
export function useRegionSize(ref: React.RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setSize({ width: el.offsetWidth, height: el.offsetHeight });
    });
    observer.observe(el);
    setSize({ width: el.offsetWidth, height: el.offsetHeight });
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
