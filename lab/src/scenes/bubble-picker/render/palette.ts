export type ColorScheme = 'light' | 'dark';

/**
 * Canvas can't read Tailwind's `dark:` variant, so every colour the render
 * layer paints has to be resolved here instead. Only the values that
 * genuinely flip are listed: the glass shell (white halo, warm specular,
 * white inner stroke) and the debug rims (purple / magenta / yellow) read
 * correctly against both stages, so they stay in the draw code.
 */
export interface BubblePalette {
  /** Label colour at rest. Cross-fades to `selectedLabelFill` as a bubble pops. */
  idleLabelFill: string;
  selectedLabelFill: string;
  /**
   * Alpha the texture is drawn at while unselected, so selected bubbles
   * read as more vivid by contrast. The idle texture is a pale, near-white
   * marble: against the light stage it needs body to show up at all, but
   * against midnight the same alpha turns every bubble into an opaque
   * frosted ball and flattens the selected/unselected difference. Dark
   * therefore runs LOWER, letting the stage through so the bubbles read as
   * glass and a selection still pops.
   */
  idleTextureAlpha: number;
  /**
   * `r, g, b` triple for debug marks that must contrast with the STAGE
   * rather than with a bubble — settle-snapshot labels, restPos
   * crosshairs, replay labels. Callers compose their own alpha.
   */
  debugInkRgb: string;
}

export const BUBBLE_PALETTES: Record<ColorScheme, BubblePalette> = {
  light: {
    idleLabelFill: 'rgba(1, 55, 136, 0.7)',
    selectedLabelFill: '#ffffff',
    idleTextureAlpha: 0.5,
    debugInkRgb: '15, 23, 42',
  },
  dark: {
    idleLabelFill: 'rgba(226, 240, 255, 0.78)',
    selectedLabelFill: '#ffffff',
    idleTextureAlpha: 0.3,
    debugInkRgb: '226, 232, 240',
  },
};
