// Canvas 2D takes a CSS `font` shorthand string, so the label typography
// has to live outside Tailwind. Both the one-shot `wrapLabel` pre-measure
// pass and the per-frame `fillText` read from here — if the two ever
// drifted apart, cached line breaks would be measured against a different
// font than the one that paints them.

const LABEL_FONT_FAMILY = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const IDLE_LABEL_FONT = `400 15px / 18px ${LABEL_FONT_FAMILY}`;
export const SELECTED_LABEL_FONT = `510 18px / 21px ${LABEL_FONT_FAMILY}`;

export const IDLE_LINE_HEIGHT = 18;
export const SELECTED_LINE_HEIGHT = 21;
