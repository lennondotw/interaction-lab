/*
 * The four properties a glass surface's appearance can be hung on, kept out of
 * the `.tsx` so that file exports components only.
 */

export type FadeMode = 'ancestor-opacity' | 'layer-opacity' | 'mask-alpha' | 'material';

export type BackdropKind = 'checker' | 'flat' | 'text';

export const FADE_MODES: readonly FadeMode[] = ['layer-opacity', 'mask-alpha', 'ancestor-opacity', 'material'];

export const BACKDROP_KINDS: readonly BackdropKind[] = ['text', 'checker', 'flat'];

export const FADE_MODE_TITLE: Record<FadeMode, string> = {
  'ancestor-opacity': 'opacity on an ancestor',
  'layer-opacity': 'opacity on the glass layer',
  'mask-alpha': 'uniform-alpha mask on the glass layer',
  material: 'material strength — blur radius + tint alpha',
};

export const FADE_MODE_NOTE: Record<FadeMode, string> = {
  'ancestor-opacity':
    'The worst of the four, and only broken mid-way: at any α below 1 the wrapper forms a backdrop root, so the blur has only the wrapper’s own (empty) content to sample and stops blurring entirely. At α = 1 it is correct again.',
  'layer-opacity':
    'The defect. 1 − α of the backdrop survives at full sharpness on top of a washed copy of the frost, so the surface reads as dirty rather than as less frosted. The hairline and the corner wash out with it. Switch the backdrop to flat and none of it is visible — blurring a solid colour is a no-op, so there is no detail left to survive the blend. That is how this passes review and then falls apart over a photo.',
  'mask-alpha':
    'The same operation as opacity, not a workaround: both scale the finished layer’s alpha and composite it over the unprocessed backdrop. Measured, the two frames differ on 0.14% of pixels, all of them inside the panel and 93% of them by a single 8-bit step — a mask is a quantised image where opacity is a float. Mask alpha decides where the material is, not how much of it there is, which is why a narrow gradient band reads fine and a flat 50% does not.',
  material:
    'Ship this. Every frame is real frost, just less of it. Note the radius saturates early — past the backdrop’s detail scale more radius changes nothing, so the tint carries the perceived ramp.',
};

/*
 * Colour fields under the copy. A blur is a low-pass filter, so copy alone only ever
 * shows what it destroys; these show what it keeps. At blur(20px) a 90px disc is
 * still a disc with a recognisable edge, which is the half of the picture that
 * carries the ghost: inside a correct frost that edge is soft, and any hard edge
 * crossing the panel boundary is 1 − α of the original leaking through.
 *
 * Placed so at least one disc edge crosses the panel's boundary on each axis — an
 * edge wholly inside or wholly outside the panel has nothing to be compared against.
 * Alpha 0.5 rather than solid, so the copy stays legible over them and the other
 * instrument keeps working; and mid-saturation hues, so the white tint's
 * desaturation is visible as the material ramps.
 */
const COLOUR_FIELDS = [
  'radial-gradient(circle 92px at 14% 26%, rgb(244 63 94 / 0.5) 99%, transparent 100%)',
  'radial-gradient(circle 74px at 38% 88%, rgb(245 158 11 / 0.5) 99%, transparent 100%)',
  'radial-gradient(circle 108px at 62% 18%, rgb(16 185 129 / 0.5) 99%, transparent 100%)',
  'radial-gradient(circle 84px at 86% 72%, rgb(139 92 246 / 0.5) 99%, transparent 100%)',
].join(', ');

/**
 * `text` is the instrument, and the question it answers needs no calibration: can you
 * still read it. Blur at any usable radius turns 11px copy into smear, so a legible
 * word inside a panel proves the frost is not doing its job — and it is also the
 * honest case, since what production glass sits over is usually somebody's paragraph
 * over somebody's brand colour. `checker` is the same test at one coarse scale only,
 * where the defect reads as doubled edges instead. `flat` is the case that excuses
 * everything: blurring a solid colour is a no-op, so no fade can be wrong over it.
 */
export const BACKDROP_STYLE: Record<BackdropKind, string> = {
  checker: 'repeating-conic-gradient(from 45deg, #f472b6 0% 25%, #38bdf8 0% 50%) 0 0 / 44px 44px',
  flat: '#6a6a6a',
  text: COLOUR_FIELDS,
};

const LOREM_SOURCE =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem. Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur.';

/**
 * One unbroken paragraph — a texture, not a document, so no paragraph break ever
 * lands behind the panel as a band of blank backdrop. Repeated four times, because
 * the 80px of side overscan makes the measure wide enough that a single pass falls
 * well short of the bottom of the stage, and blank backdrop under the panel is
 * backdrop the frost cannot be judged against. Overshooting costs nothing: the
 * surplus is clipped, and the stage is narrower in a one-column layout.
 */
export const LOREM = Array.from({ length: 4 }, () => LOREM_SOURCE).join(' ');
