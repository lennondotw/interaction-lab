/** A reading position: the element the viewer is looking at and where it was on screen. */
export interface ReadingAnchor {
  element: HTMLElement;
  /**
   * Bottom edge of the element relative to the viewport, independent of container
   * translation. The bottom edge is what made a partially visible row eligible;
   * rewrap can shorten the body without moving that edge out of view.
   */
  bottom: number;
}

export interface ReadingAnchorOptions {
  /** Rows that cannot serve as an anchor, such as rows still entering. */
  skipRow?: (row: HTMLElement) => boolean;
  /** The element inside a row whose position is anchored; defaults to the row itself. */
  readingElement?: (row: HTMLElement) => HTMLElement;
}

/**
 * The first row whose box crosses the viewport's top edge. Row boxes are assumed
 * ordered and non-overlapping, so a binary search avoids measuring the whole
 * history on every layout tick.
 */
export function captureReadingAnchor(
  viewport: HTMLElement,
  content: HTMLElement,
  { skipRow, readingElement }: ReadingAnchorOptions = {}
): ReadingAnchor | undefined {
  const top = viewport.getBoundingClientRect().top;
  const rows = content.children;
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (rows[mid]!.getBoundingClientRect().bottom <= top) low = mid + 1;
    else high = mid;
  }
  for (let index = low; index < rows.length; index++) {
    const row = rows[index] as HTMLElement;
    if (skipRow?.(row)) continue;
    const element = readingElement?.(row) ?? row;
    return { element, bottom: element.getBoundingClientRect().bottom - top };
  }
  return undefined;
}

export interface ReadingAnchorTrackerOptions extends ReadingAnchorOptions {
  /** Refresh the snapshot on native scroll (default). Disable to drive `remember` manually. */
  observeScroll?: boolean;
}

export interface ReadingAnchorSnapshot extends ReadingAnchor {
  /** The viewport's scrollTop when the snapshot was taken. */
  scrollTop: number;
  /** The viewport's clientWidth when the snapshot was taken. */
  width: number;
}

/** What the controller needs to compensate layout changes the host did not report. */
export interface ReadingAnchorSource {
  fromSnapshot(): ReadingAnchor | undefined;
  remember(): void;
}

/**
 * Keeps a snapshot of the reading anchor from before a layout change, so the
 * change can be compensated after the DOM has already moved.
 */
export function createReadingAnchorTracker(
  viewport: HTMLElement,
  content: HTMLElement,
  { observeScroll = true, ...options }: ReadingAnchorTrackerOptions = {}
) {
  let saved: ReadingAnchorSnapshot | undefined;
  const capture = () => captureReadingAnchor(viewport, content, options);
  function remember() {
    const anchor = capture();
    saved = anchor && { ...anchor, scrollTop: viewport.scrollTop, width: viewport.clientWidth };
  }
  function onScroll() {
    // A queued event from the last compensation write can arrive after the next
    // reflow. Without movement since the snapshot, it must not replace it.
    // During a pending width change, a native clamp can scroll before the resize
    // callback runs; selection waits for that callback, which compensates first
    // and only then remembers the next anchor.
    if (saved && (saved.scrollTop === viewport.scrollTop || saved.width !== viewport.clientWidth)) return;
    remember();
  }
  remember();
  if (observeScroll) viewport.addEventListener('scroll', onScroll, { passive: true });
  return {
    capture,
    remember,
    /** The current snapshot, for hosts that gate their own scroll handling on it. */
    saved: () => saved,
    /** The remembered anchor, adjusted for scrolling since it was saved; falls back to a fresh capture. */
    fromSnapshot(): ReadingAnchor | undefined {
      return saved?.element.isConnected
        ? { element: saved.element, bottom: saved.bottom + saved.scrollTop - viewport.scrollTop }
        : capture();
    },
    dispose() {
      saved = undefined;
      if (observeScroll) viewport.removeEventListener('scroll', onScroll);
    },
  };
}
