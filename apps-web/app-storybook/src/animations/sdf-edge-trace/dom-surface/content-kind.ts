/**
 * What sits behind the clip, split out from the components that render it so the
 * component file exports components only and fast refresh keeps working.
 *
 * The three are chosen to span paint cost rather than to look good: a gradient is
 * one pass over the box, text is a glyph run, and a filter is a separate render
 * surface plus a blur kernel. Which one is behind a clip that moves every frame is
 * the variable that decides whether the clip is affordable at all.
 */

export type ContentKind = 'gradient' | 'text' | 'filtered';

export const CONTENT_LABELS: Record<ContentKind, string> = {
  gradient: 'gradient',
  text: 'text',
  filtered: 'filter',
};

export const CONTENT_KINDS = Object.keys(CONTENT_LABELS) as ContentKind[];
