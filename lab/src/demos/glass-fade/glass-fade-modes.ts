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
    'The defect. 1 − α of the backdrop survives at full sharpness on top of a washed copy of the frost, so the surface reads as dirty rather than as less frosted. The hairline and the corner wash out with it.',
  'mask-alpha':
    'Identical to opacity, pixel for pixel. Mask alpha decides where the material is, not how much of it there is — which is why a narrow gradient band reads fine and a flat 50% does not.',
  material:
    'Ship this. Every frame is real frost, just less of it. Note the radius saturates early — past the backdrop’s detail scale more radius changes nothing, so the tint carries the perceived ramp.',
};

/**
 * `text` is the instrument, and the question it answers needs no calibration: can
 * you still read it. Blur at any usable radius turns 11px copy into smear, so a
 * legible word inside a panel proves the frost is not doing its job — and it is
 * also the honest case, since the backdrop production glass sits over is usually
 * somebody's paragraph. `checker` is the same test at a coarser scale, where the
 * defect reads as doubled edges instead. `flat` is the case that excuses
 * everything: blurring a solid colour is a no-op, so no fade can be wrong over it.
 *
 * Only the last two are CSS backgrounds; `text` paints DOM, and gets `transparent`
 * here so the canvas shows through behind the copy.
 */
export const BACKDROP_STYLE: Record<BackdropKind, string> = {
  checker: 'repeating-conic-gradient(from 45deg, #f472b6 0% 25%, #38bdf8 0% 50%) 0 0 / 44px 44px',
  flat: '#6a6a6a',
  text: 'transparent',
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
