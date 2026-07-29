/**
 * `observeLayoutShift(el, onMove)` — fire `onMove` whenever `el`'s
 * visual position shifts, even when no `ResizeObserver` or scroll
 * event would fire.
 *
 * The browser offers no single "my position changed" notification. The
 * canonical workaround is the `IntersectionObserver` layout-shift
 * trick, the same one Floating UI uses for
 * `autoUpdate({ layoutShift: true })`.
 *
 * Strategy:
 *
 * 1. Measure `el.getBoundingClientRect()`.
 * 2. Create an `IntersectionObserver` rooted in the document with
 *    `rootMargin` precisely framing the element's current rect. At
 *    rest the intersection ratio is exactly `threshold` (= 1).
 * 3. If `el` moves by ≥ 1 px, the frame no longer aligns — the ratio
 *    drifts off `threshold` — and the callback fires.
 * 4. Fire `onMove`, disconnect the observer, re-arm with the new rect.
 *    Subpixel drift (rect changes while ratio stays 1) is re-armed via
 *    an explicit rect comparison.
 *
 * Why this is the right primitive:
 *
 * - Zero idle cost. No rAF, no per-frame `getBoundingClientRect`. The
 *   observer stays silent until the element actually moves.
 * - Catches position shifts no `ResizeObserver` would see: a sibling
 *   mounting / unmounting in a `justify-center` parent, flex
 *   redistribution, a font load, a CSS class swap.
 * - Covers the gap left by the ancestor-RO cascade — the last bucket
 *   of Floating UI's default coverage.
 *
 * Caveats:
 *
 * - Subpixel positioning: the observer reports `ratio === 1` based on
 *   coarse integer pixels; the rect can still differ. The callback
 *   re-compares rects and re-arms on mismatch.
 * - A first callback with `ratio === 0` means the element isn't
 *   visible yet (e.g. just mounted off-screen or mid-animation). Defer
 *   for a second and retry.
 * - `root: ownerDocument` is a trick that makes the observer use
 *   document coordinates rather than the default (the nearest
 *   scrolling ancestor). Some older browsers reject this — fall back
 *   to the default root.
 */

export interface LayoutShiftControl {
  disconnect(): void;
}

interface RefreshOptions {
  threshold?: number;
  skipNotify?: boolean;
}

/**
 * Start observing. `onMove` fires on every layout shift. Returns a
 * handle with `disconnect()` to stop.
 */
export function observeLayoutShift(el: Element, onMove: () => void): LayoutShiftControl {
  let io: IntersectionObserver | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function cleanup(): void {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (io) {
      io.disconnect();
      io = null;
    }
  }

  function refresh(opts: RefreshOptions = {}): void {
    if (disposed) return;
    const { threshold = 1, skipNotify = false } = opts;
    cleanup();

    const rect = el.getBoundingClientRect();
    const { left, top, width, height } = rect;

    if (!skipNotify) onMove();

    if (!width || !height) {
      // Detached or display:none. Defer + retry — don't try to build an
      // observer with a zero-area region.
      retryTimer = setTimeout(() => refresh({ skipNotify: true }), 1000);
      return;
    }

    const rootEl = el.ownerDocument.documentElement;
    const insetTop = Math.floor(top);
    const insetRight = Math.floor(rootEl.clientWidth - (left + width));
    const insetBottom = Math.floor(rootEl.clientHeight - (top + height));
    const insetLeft = Math.floor(left);
    const rootMargin = `${-insetTop}px ${-insetRight}px ${-insetBottom}px ${-insetLeft}px`;

    const clampedThreshold = Math.max(0, Math.min(1, threshold)) || 1;

    let isFirstCallback = true;
    const handler: IntersectionObserverCallback = (entries) => {
      const entry = entries[0];
      if (!entry) return;
      const ratio = entry.intersectionRatio;

      if (ratio !== threshold) {
        if (isFirstCallback) {
          // Element not visible at first observation — can happen when
          // the placeholder mounts off-screen (e.g. a step is
          // mid-fade-in). Defer and retry with ratio=1, or if we got a
          // partial ratio, re-arm with that exact threshold.
          if (ratio === 0) {
            retryTimer = setTimeout(() => refresh({ skipNotify: true, threshold: 1e-7 }), 1000);
          } else {
            refresh({ threshold: ratio });
          }
        } else {
          refresh();
        }
      }

      // Subpixel fallback: IO reports integer ratios; if the rect
      // drifted but rounding kept ratio at 1, the frame is stale.
      if (ratio === 1 && !rectsEqual(rect, el.getBoundingClientRect())) {
        refresh();
      }

      isFirstCallback = false;
    };

    const options: IntersectionObserverInit = { rootMargin, threshold: clampedThreshold };

    try {
      io = new IntersectionObserver(handler, { ...options, root: rootEl });
    } catch {
      io = new IntersectionObserver(handler, options);
    }
    io.observe(el);
  }

  refresh({ skipNotify: true });

  return {
    disconnect(): void {
      disposed = true;
      cleanup();
    },
  };
}

function rectsEqual(a: DOMRect, b: DOMRect): boolean {
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}
