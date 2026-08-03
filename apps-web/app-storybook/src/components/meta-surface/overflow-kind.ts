/**
 * What to put behind the clip, split out from the components that render it so the component
 * file exports components only and fast refresh keeps working.
 *
 * All three are chosen for having *structure*. A smooth gradient would be cut correctly and
 * look almost the same either way, demonstrating nothing; a grid, text baselines and hard
 * colour boundaries make the cut edge legible, and show that the clip follows the traced
 * curve rather than approximating it.
 */

export type OverflowKind = 'grid' | 'text' | 'stripes';

export const OVERFLOW_LABELS: Record<OverflowKind, string> = {
  grid: 'grid',
  text: 'text',
  stripes: 'stripes',
};

export const OVERFLOW_KINDS = Object.keys(OVERFLOW_LABELS) as OverflowKind[];
