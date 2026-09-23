import type { CSSProperties } from 'react';

import './edge-label.css';

/**
 * The label that sits on a frame's top edge. No background: the frame's line has a gap cut
 * where the label sits (`edge-label.css`), so the label reads on any backdrop. `left-3` and
 * `px-1` are part of the gap's geometry there - change them together.
 */
export const EDGE_LABEL_CLASS = 'pointer-events-none absolute top-0 left-3 z-20 -translate-y-1/2 px-1 leading-none';

/**
 * One label, as the text to render and the style its frame needs. The frame itself opts in
 * with the `data-edge-label-frame` attribute and sets the line's colour and style as `after:`
 * utilities. Its gap is sized from `--label-ch`, the text's length in monospace characters, so
 * deriving both from the same string keeps the gap and the label from drifting apart.
 */
export const edgeLabel = (text: string) => ({
  text,
  frameStyle: { '--label-ch': text.length } as CSSProperties,
});
