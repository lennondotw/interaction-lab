import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * Whether a measured header height is one we are willing to publish.
 *
 * The header carries no border of its own, so the general reject-border-only
 * guard collapses to a single question: is there any content contribution at
 * all? A zero here means layout has not happened yet — not that the header is
 * zero tall — and committing it would inset the content by nothing, which is
 * exactly the frame of overlapped content the measurement exists to avoid.
 */
export function isMeasuredHeight(height: number): boolean {
  return Number.isFinite(height) && height > 0;
}

export interface HeaderHeightResult {
  /** Attach to the element that wraps the header. */
  headerRef: RefObject<HTMLDivElement | null>;
  /** Ceiled border-box block size; `null` until the first trustworthy read. */
  headerHeight: number | null;
}

/**
 * The header's real height, as an event rather than a guess.
 *
 * Only the overlay mode actually needs this number — with the header in
 * flow, the column already sizes the content area and nothing has to cross
 * into JS. It is measured in both modes so `useContainerLayout` can report
 * something true, but only `safeTop` depends on it, and only when the header
 * floats.
 *
 * Replaces what used to be a hand-computed `headerHeight = 84`: the sum of
 * the header's padding, its row height, its gap and one line of breadcrumb.
 * That number was correct and completely decoupled — hiding the breadcrumb
 * took 24px off the header and left the inset behind, which is the gap this
 * hook closes.
 */
export function useHeaderHeight(): HeaderHeightResult {
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState<number | null>(null);

  const commit = useCallback((height: number): void => {
    if (!isMeasuredHeight(height)) return;
    // Ceil, because a rounded-down inset lets the first line of content slip
    // under the header. Bail when unchanged, so a delivery that reports the
    // same box can't start a render loop.
    const next = Math.ceil(height);
    setHeaderHeight((prev) => (prev === next ? prev : next));
  }, []);

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    // Read synchronously before the first paint rather than waiting on the
    // observer's first delivery. `offsetHeight` is transform-immune and
    // already correct by this point, and an inset that arrives a frame late
    // is a visible jump of the entire content area.
    commit(header.offsetHeight);

    // The observer then owns every later change — the breadcrumb being
    // toggled, a web font swapping in, a long title wrapping to a second
    // line — so the inset is never a snapshot of one particular moment.
    const observer = new ResizeObserver((entries) => {
      const blockSize = entries[0]?.borderBoxSize[0]?.blockSize;
      if (blockSize !== undefined) commit(blockSize);
    });
    observer.observe(header);
    return () => observer.disconnect();
  }, [commit]);

  return { headerRef, headerHeight };
}
