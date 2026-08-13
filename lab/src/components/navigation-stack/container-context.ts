import { createContext, useContext } from 'react';

/**
 * Whether the header takes space in the column or floats over the content.
 *
 * - `inset` — the header is in flow, so the column sizes the content area
 *   around it. Nothing has to know how tall it is, which is what makes
 *   hiding the breadcrumb give the space back instead of stranding it.
 * - `overlay` — the header is lifted out of flow and the content runs
 *   edge to edge underneath it. Content that must stay clear of the chrome
 *   insets itself by `--nav-safe-top`.
 */
export type NavigationHeaderMode = 'inset' | 'overlay';

/** Custom property carrying {@link ContainerLayout.safeTop}. */
export const SAFE_TOP_VAR = '--nav-safe-top';

/** Custom property carrying the header's raw measured height. */
export const HEADER_HEIGHT_VAR = '--nav-header-height';

/**
 * Breathing room between a floating header and the content below it.
 *
 * Clearing the header is not the same as sitting flush against it. An
 * `overlay` header ends in a visible material edge with no rule under it, so
 * content that starts exactly at its underside reads as clipped by it rather
 * than as beginning after it — especially once the content scrolls, when the
 * same edge really is cutting rows in half.
 *
 * Only `overlay` gets this. An `inset` header is not floating above the
 * content, it is the block before it, and two adjacent blocks are supposed to
 * meet: a gap there would show a strip of the view's own background between
 * the chrome and the first row, which reads as a seam rather than as air.
 *
 * Half the header's own padding — enough to separate, not enough to become
 * another band of whitespace.
 */
export const OVERLAY_CONTENT_GAP = 8;

/**
 * How far content must inset itself to sit comfortably clear of the chrome.
 *
 * Deliberately not "the header's height": in `overlay` mode it is that plus
 * {@link OVERLAY_CONTENT_GAP}, and in `inset` mode it is zero however tall
 * the header is, because the column has already placed the content area.
 * Anything that needs the header's actual height — to align to its edge
 * rather than to clear it — should read `headerHeight` instead.
 *
 * Returns `0` while the height is still unmeasured, rather than a bare gap:
 * a lone 8px inset before the real number lands would be a visible nudge of
 * the whole content area.
 */
export function resolveSafeTop(headerMode: NavigationHeaderMode, headerHeight: number | null): number {
  if (headerMode !== 'overlay' || headerHeight === null) return 0;
  return headerHeight + OVERLAY_CONTENT_GAP;
}

export interface ContainerLayout {
  headerMode: NavigationHeaderMode;
  /**
   * The header's measured height; `null` before the first read. The raw fact,
   * also published as {@link HEADER_HEIGHT_VAR} — for aligning *to* the
   * chrome. To stay clear of it, use `safeTop`.
   */
  headerHeight: number | null;
  /**
   * What {@link resolveSafeTop} returns. Published as {@link SAFE_TOP_VAR}
   * too, so a descendant at any depth can use it without a hook and without
   * re-rendering when it changes.
   */
  safeTop: number;
}

export const ContainerContext = createContext<ContainerLayout | null>(null);

/** Layout facts published by `NavigationContainer`. */
export function useContainerLayout(): ContainerLayout {
  const ctx = useContext(ContainerContext);
  if (!ctx) throw new Error('useContainerLayout must be used within NavigationContainer');
  return ctx;
}
