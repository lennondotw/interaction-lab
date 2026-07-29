import { cn } from '@monorepo/utils';
import { useEffect, useRef, type FC, type PointerEvent as ReactPointerEvent } from 'react';
import bubbleIdleUrl from './assets/bubble-idle.png';
import bubbleSelectedUrl from './assets/bubble-selected.png';
import { DEFAULT_MAX_SELECT, DT_CLAMP, SELECTED_SCALE, TOUCH_SLOP_PX } from './constants.js';
import { hitTest } from './hit-test.js';
import type { BubbleState } from './physics/bubble-state.js';
import { layoutSettle } from './physics/layout-settle.js';
import { isClusterAtRest } from './physics/rest-detector.js';
import { stepRuntime, stepScaleOnly } from './physics/step-runtime.js';
import { drawAnchors, drawCollisionRims, drawSettleSnapshot } from './render/debug-overlay.js';
import { drawClusterContents } from './render/draw-bubble.js';
import { IDLE_LABEL_FONT, IDLE_LINE_HEIGHT, SELECTED_LABEL_FONT, SELECTED_LINE_HEIGHT } from './render/label-fonts.js';
import { wrapLabel } from './render/wrap-label.js';

export interface BubblePickerItem {
  id: string;
  label: string;
}

/**
 * Debug overlays used by Storybook stories. Regular callers leave this
 * undefined; tree-shaking drops every branch when no debug option is set.
 *
 *   * `settleSnapshot` — render plain circles at `b.pos` with no harmonic
 *     deformation, drift, or glass shell. Verifies the layout algorithm
 *     output independently of any animation.
 *   * `collisionRims` — overlay the physics rim (solid) and personal
 *     claim radius (dashed) per bubble, so you can see when PBD fires
 *     and which pairs sit at minDist.
 *   * `anchors` — overlay restPos crosshair, displacement line, and
 *     drift envelope per bubble.
 *   * `timeScale` — slow down or speed up physics + procedural clock
 *     uniformly. Default 1; set to 0.15 for a "slow motion" view of
 *     selection / collision dynamics.
 */
export interface BubblePickerDebugOptions {
  settleSnapshot?: boolean;
  collisionRims?: boolean;
  anchors?: boolean;
  timeScale?: number;
}

export interface BubblePickerProps {
  items: readonly BubblePickerItem[];
  selectedIds: readonly string[];
  onToggle: (id: string) => void;
  /** Hard cap on simultaneous selections. Default 3. */
  maxSelected?: number;
  /**
   * Idle / selected bubble textures. Every bubble shares one texture pair —
   * per-bubble variety comes from `textureRotationDeg`, not from swapping
   * in a second artwork. Overridable so a story can point at a different
   * pair without touching the render layer.
   */
  idleSrc?: string;
  selectedSrc?: string;
  className?: string;
  /**
   * Disable all procedural motion (breathing, drift, specular sweep).
   * Selection scale ease still animates so taps stay legible.
   * Forced to true when the user has prefers-reduced-motion: reduce.
   */
  paused?: boolean;
  debug?: BubblePickerDebugOptions;
}

interface InternalState {
  bubbles: BubbleState[];
  selectedIdsRef: { current: Set<string> };
  prevTs: number | null;
  procClockMs: number;
  rafId: number;
  ctx: CanvasRenderingContext2D | null;
  imageCache: Map<string, HTMLImageElement>;
  width: number;
  height: number;
  dpr: number;
  settled: boolean;
  effectivePaused: boolean;
  /**
   * Reference to the mount-effect-scoped `trySettle` so a separate
   * `items`-watching effect can retry settle when the prop arrives
   * async (e.g. a host hydrates the option list from a fetch after the
   * picker has already mounted with an empty list). Cleared on unmount;
   * the effect that calls it guards on `state.trySettle != null`.
   */
  trySettle: (() => void) | null;
}

function loadImage(url: string, cache: Map<string, HTMLImageElement>): Promise<HTMLImageElement> {
  const existing = cache.get(url);
  if (existing) {
    if (existing.complete && existing.naturalWidth > 0) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(existing), { once: true });
      existing.addEventListener('error', () => reject(new Error(`image load failed: ${url}`)), {
        once: true,
      });
    });
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.addEventListener(
      'load',
      () => {
        cache.set(url, img);
        resolve(img);
      },
      { once: true }
    );
    img.addEventListener('error', () => reject(new Error(`image load failed: ${url}`)), { once: true });
    img.src = url;
  });
}

export const BubblePicker: FC<BubblePickerProps> = ({
  items,
  selectedIds,
  onToggle,
  maxSelected = DEFAULT_MAX_SELECT,
  idleSrc = bubbleIdleUrl,
  selectedSrc = bubbleSelectedUrl,
  className,
  paused = false,
  debug,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<InternalState | null>(null);
  // Latest props snapshot for the rAF loop and pointer handlers — avoids
  // stale closures without restarting the loop on every render.
  const propsRef = useRef({ items, onToggle, maxSelected, idleSrc, selectedSrc, paused, debug });
  propsRef.current = { items, onToggle, maxSelected, idleSrc, selectedSrc, paused, debug };

  // Sync the selection Set during render. Not an effect — this is a pure
  // ref mutation that mirrors the prop. The rAF loop reads `.has(id)`
  // against this Set every frame.
  if (stateRef.current) {
    stateRef.current.selectedIdsRef.current = new Set(selectedIds);
  }

  // Mount: build the InternalState shell, attach observers, kick the rAF
  // loop. Settle waits for the first frame where the container has
  // measurable size AND every required image has decoded.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const state: InternalState = {
      bubbles: [],
      selectedIdsRef: { current: new Set(selectedIds) },
      prevTs: null,
      procClockMs: 0,
      rafId: 0,
      ctx,
      imageCache: new Map(),
      width: 0,
      height: 0,
      dpr: window.devicePixelRatio || 1,
      settled: false,
      effectivePaused: propsRef.current.paused || reduceMotion.matches,
      trySettle: null,
    };
    stateRef.current = state;

    const resizeCanvas = (w: number, h: number): void => {
      state.width = w;
      state.height = h;
      state.dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * state.dpr);
      canvas.height = Math.round(h * state.dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    };

    const trySettle = async (): Promise<void> => {
      if (state.settled) return;
      const { items: currentItems, idleSrc: idleUrl, selectedSrc: selectedUrl } = propsRef.current;
      if (state.width <= 0 || state.height <= 0) return;
      if (currentItems.length === 0) return;

      try {
        await Promise.all([idleUrl, selectedUrl].map((u) => loadImage(u, state.imageCache)));
      } catch {
        // If a texture fails we still render the cluster — bubbles
        // without textures fall through to glass + label.
      }
      // After awaiting, the component might have unmounted.
      if (!stateRef.current || stateRef.current !== state) return;

      const ids = currentItems.map((c) => c.id);
      const labels = currentItems.map((c) => c.label);
      const { bubbles, stageWidth } = layoutSettle({ ids, labels, viewportHeight: state.height });

      // layoutSettle only knows the viewport's height; horizontally it
      // outputs a cluster that hugs the left edge (`edgePad` from the
      // origin). Center it in the viewport's width here so it sits in
      // the middle of the canvas. When the cluster is wider than the
      // viewport (lots of bubbles, narrow container) we keep it left-
      // anchored — no horizontal scroll yet, so we'd rather show the
      // left half than centre and clip both sides.
      //
      // The shift is computed once at first settle and never recomputed.
      // If the host responsively resizes the picker after first paint,
      // the cluster stays anchored to the original viewport's centre and
      // looks misaligned. Tracking the applied shift on the state and
      // re-applying the delta in the ResizeObserver handler is the fix
      // when the picker needs to become responsive.
      const horizontalShift = Math.max(0, (state.width - stageWidth) / 2);
      if (horizontalShift > 0) {
        for (const b of bubbles) {
          b.pos.x += horizontalShift;
          b.restPos.x += horizontalShift;
        }
      }

      // Attach textures + measure labels once.
      const idleImage = state.imageCache.get(idleUrl) ?? null;
      const selectedImage = state.imageCache.get(selectedUrl) ?? null;
      for (const b of bubbles) {
        b.idleImage = idleImage;
        b.selectedImage = selectedImage;

        const idleMaxW = Math.max(1, b.radius * 1.5);
        const selectedMaxW = Math.max(1, b.radius * SELECTED_SCALE * 1.5);
        b.idleLines = wrapLabel(ctx, IDLE_LABEL_FONT, b.label, idleMaxW);
        b.selectedLines = wrapLabel(ctx, SELECTED_LABEL_FONT, b.label, selectedMaxW);
        b.idleLineHeight = IDLE_LINE_HEIGHT;
        b.selectedLineHeight = SELECTED_LINE_HEIGHT;
      }

      state.bubbles = bubbles;
      state.settled = true;
    };

    // Expose `trySettle` so the `items`-watching effect below can retry
    // settle when the prop arrives async. The cleanup function clears it
    // before the closure becomes stale.
    state.trySettle = () => {
      void trySettle();
    };

    const initialRect = container.getBoundingClientRect();
    if (initialRect.width > 0 && initialRect.height > 0) {
      resizeCanvas(initialRect.width, initialRect.height);
      void trySettle();
    }

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      resizeCanvas(width, height);
      // First-time settle if not yet done; otherwise we keep the cluster
      // anchored where it is and just update walls.
      if (!state.settled) void trySettle();
    });
    ro.observe(container);

    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        // Skip dt accumulation on the first frame back so the spring
        // doesn't see a 30-second jump.
        state.prevTs = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onReduceMotionChange = (): void => {
      state.effectivePaused = propsRef.current.paused || reduceMotion.matches;
    };
    reduceMotion.addEventListener('change', onReduceMotionChange);

    const tick = (ts: number): void => {
      const s = stateRef.current;
      if (!s?.ctx) {
        state.rafId = requestAnimationFrame(tick);
        return;
      }
      // Refresh effectivePaused every frame so the prop change picks up
      // immediately without re-mounting.
      s.effectivePaused = propsRef.current.paused || reduceMotion.matches;

      const debugOpts = propsRef.current.debug;
      // timeScale slows down (or speeds up) physics + procedural clock
      // uniformly. Real elapsed time stays real so we don't accumulate
      // a backlog when timeScale < 1.
      //
      // The clamp happens BEFORE scaling so that a real GC hitch (rawDt
      // briefly hits 200ms) gets capped at DT_CLAMP and any visible drift
      // / breath jump is bounded by 33ms regardless of timeScale. Without
      // this, `procClockMs` would receive the unclamped step and cause a
      // visible time jump in procedural rendering.
      const timeScale = debugOpts?.timeScale ?? 1;
      const rawDt = s.prevTs == null ? 0 : (ts - s.prevTs) / 1000;
      s.prevTs = ts;
      const clampedRawDt = Math.min(Math.max(rawDt, 0), DT_CLAMP);
      const dt = clampedRawDt * timeScale;

      if (s.settled) {
        if (s.effectivePaused) {
          stepScaleOnly(s.bubbles, s.selectedIdsRef.current, dt);
        } else {
          s.procClockMs += dt * 1000;
          if (!isClusterAtRest(s.bubbles, s.selectedIdsRef.current)) {
            stepRuntime(s.bubbles, s.selectedIdsRef.current, { width: s.width, height: s.height }, dt);
          }
        }
        s.ctx.clearRect(0, 0, s.width, s.height);

        if (debugOpts?.settleSnapshot) {
          drawSettleSnapshot(s.ctx, s.bubbles, s.selectedIdsRef.current);
        } else {
          drawClusterContents(s.ctx, s.bubbles, { procClockMs: s.procClockMs });
        }

        if (debugOpts?.collisionRims) {
          drawCollisionRims(s.ctx, s.bubbles, s.selectedIdsRef.current);
        }
        if (debugOpts?.anchors) {
          drawAnchors(s.ctx, s.bubbles);
        }
      }

      state.rafId = requestAnimationFrame(tick);
    };
    state.rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(state.rafId);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      reduceMotion.removeEventListener('change', onReduceMotionChange);
      state.trySettle = null;
      stateRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only setup; props are read via propsRef
  }, []);

  // Retry settle when `items` arrives or changes. The mount effect's
  // `trySettle` short-circuits if the list is empty (so an empty initial
  // mount leaves the canvas intentionally blank), and the existing
  // `ResizeObserver` only retries on size change — neither covers the
  // realistic case where the host hydrates the option list from a fetch
  // after the picker has already mounted.
  //
  // `trySettle` itself is internally idempotent (`if (state.settled)
  // return`), so this effect is safe to fire on every `items` prop
  // identity change.
  useEffect(() => {
    if (items.length === 0) return;
    stateRef.current?.trySettle?.();
  }, [items]);

  // Pointer handling: tap iff pointerup happens within TOUCH_SLOP_PX of
  // the pointerdown position. Otherwise we let the parent handle scroll
  // / drag. We never call preventDefault on move.
  const downRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    downRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const start = downRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (dx * dx + dy * dy > TOUCH_SLOP_PX * TOUCH_SLOP_PX) {
      // Past slop — cancel the tap. Subsequent up won't toggle anything.
      downRef.current = null;
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const start = downRef.current;
    downRef.current = null;
    if (!start || start.pointerId !== event.pointerId) return;

    const container = containerRef.current;
    const state = stateRef.current;
    if (!container || !state?.settled) return;

    const rect = container.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const hit = hitTest(state.bubbles, px, py);
    if (!hit) return;

    const { onToggle: toggle, maxSelected: cap } = propsRef.current;
    const set = state.selectedIdsRef.current;
    if (set.has(hit.id) || set.size < cap) {
      toggle(hit.id);
    }
  };

  const onPointerCancel = (): void => {
    downRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      className={cn('relative size-full touch-none select-none', className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <canvas ref={canvasRef} className="absolute inset-0" aria-hidden="true" />
    </div>
  );
};
