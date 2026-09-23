import type { CSSProperties } from 'react';

import styles from './edge-label.module.css';

/**
 * The label that sits on a frame's top edge. No background: the frame's line has a gap cut
 * where the label sits (`edge-label.css`), so the label reads on any backdrop. `left-3` and
 * `px-1` are part of the gap's geometry there - change them together.
 */
export const EDGE_LABEL_CLASS = 'pointer-events-none absolute top-0 left-3 z-20 -translate-y-1/2 px-1 leading-none';

/**
 * One label: the text to render, plus the class and style its frame needs. The frame merges
 * `frameClassName` into its own classes and sets the line's colour and style as `after:`
 * utilities. Its gap is sized from `--label-ch`, the text's length in monospace characters, so
 * deriving both from the same string keeps the gap and the label from drifting apart.
 */
export const edgeLabel = (text: string) => ({
  text,
  frameClassName: styles.frame,
  frameStyle: { '--label-ch': text.length } as CSSProperties,
});
