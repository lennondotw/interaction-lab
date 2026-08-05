/**
 * The knobs a glass has, shared by the single-shape view and the gallery.
 *
 * In a `.ts` rather than beside either component because `react-refresh/only-export-components`
 * wants a `.tsx` to export its component and nothing else, and because both views need to take
 * exactly the same set — a gallery whose parameters had drifted from the single view's would
 * make the two impossible to compare, which is the only thing the gallery is for.
 *
 * Every field is a Storybook arg. That is the reason they are plain numbers and booleans with no
 * nesting: an args table can address `bevel` but not `glass.profile.bevel`.
 */
export interface GlassLook {
  /** Side of the square each shape is placed inside, in logical px. */
  size: number;
  /** Width of the curved rim band, in px. Inside it the surface is flat. */
  bevel: number;
  /** Height of the glass at the flat top, in px. The bevel climbs to this. */
  thickness: number;
  /** Distance from the exit face down to the backdrop, in px. Scales the whole effect. */
  depth: number;
  /** Refractive index. 1.5 is glass, 1.33 water, 1.0 no refraction at all. */
  ior: number;
  /** Stroke the shape's stated outline over the result, to check the field against it. */
  showOutline: boolean;
  /**
   * Dim everything outside the shape, so the glass reads as the subject.
   *
   * On by default because it is what makes the effect legible at a glance. Worth turning off
   * before believing anything about how much the rim darkens what is behind it: with the
   * surroundings taken to 42% there is no honest reference left to compare the interior against,
   * and the refraction reads as stronger than it is.
   */
  dimSurroundings: boolean;
  /** Show the map and its two channels alongside the result. */
  showChannels: boolean;
  /**
   * How the result and the three map views are arranged.
   *
   * `thumbnails` keeps the result large with the maps small underneath, which is right when the
   * question is "what does this shape look like" and the maps are supporting evidence.
   * `filmstrip` gives all four the same size in a row, which is right when the question is "where
   * did that displacement come from" — a 56px thumbnail cannot show which pixels of the R channel
   * correspond to a bend in the result, and the two are only comparable at the same scale.
   */
  channelLayout: 'thumbnails' | 'filmstrip';
  /** Show the peak / scale / step / build readout. */
  showStats: boolean;
  /** Show the label, the id and the note. */
  showCaption: boolean;
}
