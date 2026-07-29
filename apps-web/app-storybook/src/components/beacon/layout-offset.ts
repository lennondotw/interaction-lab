/**
 * `layoutOffsetRelativeTo(el, container)` — container-relative static
 * layout offset of `el`, immune to CSS `transform`.
 *
 * Walks the `offsetParent` chain from `el` up to `container`,
 * accumulating `offsetLeft` / `offsetTop` and subtracting the
 * `scrollLeft` / `scrollTop` of every intermediate ancestor between
 * each hop and its `offsetParent`. The result is the element's
 * position as laid out by the browser, *not* where it currently paints
 * after transforms are applied.
 *
 * Why not `getBoundingClientRect()`?
 *
 * `getBoundingClientRect` returns the visual rect *after* every
 * ancestor's `transform` / `perspective` / `filter` has been applied.
 * When a beacon's placeholder is nested inside a presentation-layer
 * animation (a step-transition slide, a shared-element morph, etc.)
 * the rect reports the transient painted position, not the resting
 * layout position. CSS transforms don't invalidate `ResizeObserver` or
 * fire `scroll` / `resize`, so the beacon gets stuck at whatever value
 * was read when the animation started.
 *
 * Beacon is defined to be a **layout anchor** — it follows where the
 * element is *laid out*, not where it *currently paints*. Higher
 * layers are free to run their own presentation animations on top, in
 * parallel with the beacon's spring; the two layers are orthogonal.
 *
 * Caveats:
 *
 * - If `container` is not an ancestor of `el` along the `offsetParent`
 *   chain (e.g. a `position: fixed` ancestor cuts the chain short),
 *   the function returns `null`. Callers should fall back to
 *   `getBoundingClientRect()` differencing in that case.
 * - `el.offsetParent` is `null` for `display: none` or detached nodes;
 *   we return `null` to let the caller skip the measurement.
 * - `writing-mode: vertical-*` / RTL: `offsetLeft` / `offsetTop` are
 *   physical (not logical) coordinates; behaviour matches
 *   `getBoundingClientRect` differencing within the same container for
 *   any writing mode where the container shares the mode.
 */

export interface LayoutOffset {
  x: number;
  y: number;
}

/**
 * `container === null` asks the function to walk all the way up to
 * (but not including) `<body>`, giving a viewport-relative static
 * layout offset. Rarely useful on its own — callers typically pass a
 * real container.
 */
export function layoutOffsetRelativeTo(el: HTMLElement, container: HTMLElement | null): LayoutOffset | null {
  if (!el.offsetParent && el !== document.body && getComputedStyle(el).position !== 'fixed') {
    // Detached or `display: none`. `getBoundingClientRect` would also
    // return zeros here; report null so the caller can skip the update
    // instead of writing a garbage (0, 0) to the beacon.
    return null;
  }

  let x = 0;
  let y = 0;
  // Never null inside the loop: the `!offsetParent` branch below exits
  // before we could assign one.
  let node: HTMLElement = el;

  while (node !== container) {
    x += node.offsetLeft;
    y += node.offsetTop;

    const offsetParent = node.offsetParent as HTMLElement | null;

    // Accumulate scroll offsets of intermediate ancestors between
    // `node` and its `offsetParent`. These are nodes whose `overflow`
    // creates a scroll context without breaking the offset chain (i.e.
    // not `position: relative` themselves, otherwise they'd be the
    // offsetParent). Skip the container itself so callers aren't
    // forced to make it non-scrolling.
    let walker: HTMLElement | null = node.parentElement;
    while (walker && walker !== offsetParent && walker !== container) {
      x -= walker.scrollLeft;
      y -= walker.scrollTop;
      walker = walker.parentElement;
    }

    if (!offsetParent) {
      // Reached `<html>` without encountering container — the chain is
      // broken (container is not an ancestor, or el is positioned in a
      // way that detaches it). Return null so the caller falls back to
      // rect differencing.
      if (container != null) return null;
      break;
    }

    node = offsetParent;
  }

  return { x, y };
}
