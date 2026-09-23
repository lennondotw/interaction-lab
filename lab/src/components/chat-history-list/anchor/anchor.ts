/**
 * Reading-position anchoring over the virtual core's layout.
 *
 * Just before a layout change, `captureAnchor` records rows near a reference line in the
 * viewport. After the change, `resolveAnchor` finds the best of them that is still in the window
 * and returns the scroll offset that puts it back where it was. Positions come from the core,
 * not the DOM, so a row that is unmounted still anchors as long as its key is in the window.
 *
 * The reference line sits at `ratio` of the viewport height: 0 is the top edge, 0.5 the middle
 * and 1 the bottom edge. The point kept still on the anchor row sits at the same ratio of the
 * row, so at 0 the row's top edge keeps its place, at 1 its bottom edge, at 0.5 its middle. When
 * the viewport is resized, the anchor keeps its distance from the reference line, so bottom
 * anchoring keeps the bottom of the viewport still.
 */

import type { VirtualCore } from '../virtual-core/virtual-core.js';

/** The layout queries anchoring needs; the core satisfies it. */
export type AnchorLayout = Pick<VirtualCore, 'indexOf' | 'item' | 'rangeFor'>;

export interface AnchorViewport {
  offset: number;
  size: number;
}

export interface AnchorCandidate {
  key: string;
  /** Distance of the row's anchor point below the reference line, in pixels; negative above. */
  fromLine: number;
}

export interface AnchorSnapshot {
  ratio: number;
  /**
   * Best first: rows ordered by distance from the reference line (0 for a row it crosses), ties
   * broken by how near the row's anchor point is to the line, then by order.
   */
  candidates: AnchorCandidate[];
}

export interface ResolvedAnchor {
  key: string;
  /** Scroll offset that restores the anchor. May need clamping to the scrollable range. */
  offset: number;
}

function assertRatio(ratio: number) {
  if (!(ratio >= 0 && ratio <= 1)) throw new RangeError(`Anchor ratio must be within 0..1, received ${ratio}.`);
}

/**
 * Record anchor candidates from the layout as it is now, before a change. Candidates are every
 * row within `margin` pixels of the viewport (the viewport's own height by default), so a
 * removal or trim near the viewport still leaves one to fall back on.
 */
export function captureAnchor(
  layout: AnchorLayout,
  viewport: AnchorViewport,
  ratio: number,
  margin = viewport.size
): AnchorSnapshot {
  assertRatio(ratio);
  const line = viewport.offset + ratio * viewport.size;
  const range = layout.rangeFor(viewport.offset - margin, viewport.offset + viewport.size + margin);
  const ranked: (AnchorCandidate & { distance: number; index: number })[] = [];
  if (range) {
    for (let index = range.startIndex; index <= range.endIndex; index++) {
      const item = layout.item(index);
      const point = item.start + ratio * item.size;
      const distance = line < item.start ? item.start - line : line > item.end ? line - item.end : 0;
      ranked.push({ key: item.key, fromLine: point - line, distance, index });
    }
  }
  // On a tie (the line on a boundary, or a zero-size row), the row whose anchor point is nearer
  // the line wins: at ratio 0 the row starting at the line, at ratio 1 the row ending there.
  ranked.sort((a, b) => a.distance - b.distance || Math.abs(a.fromLine) - Math.abs(b.fromLine) || a.index - b.index);
  return { ratio, candidates: ranked.map(({ key, fromLine }) => ({ key, fromLine })) };
}

/**
 * After a change, the offset that returns the best surviving candidate to its place relative to
 * the reference line of a viewport `viewportSize` tall. Null when no candidate is in the window
 * any more, which means the window was replaced and nothing should be compensated.
 */
export function resolveAnchor(
  snapshot: AnchorSnapshot,
  layout: AnchorLayout,
  viewportSize: number
): ResolvedAnchor | null {
  for (const candidate of snapshot.candidates) {
    const index = layout.indexOf(candidate.key);
    if (index === undefined) continue;
    const item = layout.item(index);
    const point = item.start + snapshot.ratio * item.size;
    return { key: candidate.key, offset: point - snapshot.ratio * viewportSize - candidate.fromLine };
  }
  return null;
}
