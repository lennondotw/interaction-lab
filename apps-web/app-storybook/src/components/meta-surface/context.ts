/**
 * Three contexts rather than one object, mirroring how the beacon splits its own.
 *
 * Not a style choice. An item's `measure` has to be a stable `useCallback` — it is the
 * observation cascade's effect dependency, so an unstable one would tear every
 * observer down per render — and the React Compiler can only preserve that
 * memoisation if its inputs are read directly. Deriving `containerRef` out of a
 * single bundled context with `context?.containerRef ?? null` produces a fresh value
 * each render as far as the compiler can tell, and it refuses the memo. Reading each
 * piece from its own context keeps every input identity-stable.
 */

import { createContext, type RefObject } from 'react';
import type { ShapeRegistry } from './registry.js';

export const MetaSurfaceRegistryContext = createContext<ShapeRegistry | null>(null);

/** The region every rect is measured relative to. */
export const MetaSurfaceContainerContext = createContext<RefObject<HTMLElement | null> | null>(null);

export interface MetaSurfaceClipIds {
  /**
   * For `clip-path: url(…)` on an HTML box.
   *
   * Two ids, not one, because `clipPathUnits="userSpaceOnUse"` does not name a fixed
   * space — it resolves against the *referrer's*. An HTML box measures CSS px from its
   * border box while a path inside the overlay is in the overlay's user units. Those
   * coincide here only because the viewBox is 1:1 with the region; kept separate so
   * that staying true is a choice rather than an accident. See
   * archive/2026-07-contour-to-dom.
   */
  cssClipId: string;
  /** For `clip-path` on an element inside the overlay's own `viewBox`. */
  svgClipId: string;
}

export const MetaSurfaceClipContext = createContext<MetaSurfaceClipIds | null>(null);
