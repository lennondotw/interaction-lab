/*
 * The four properties a glass surface's appearance can be hung on, kept out of
 * the `.tsx` so that file exports components only.
 */

export type FadeMode = 'ancestor-opacity' | 'layer-opacity' | 'mask-alpha' | 'material';

export type BackdropKind = 'checker' | 'flat' | 'stripes';

export const FADE_MODES: readonly FadeMode[] = ['layer-opacity', 'mask-alpha', 'ancestor-opacity', 'material'];

export const BACKDROP_KINDS: readonly BackdropKind[] = ['stripes', 'checker', 'flat'];

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
 * `stripes` is the instrument: 3px hard stripes blur to flat grey, so any crisp
 * stripe inside a panel proves the frost is not doing its job. `checker` is the
 * realistic case at a coarser scale, where the same defect reads as doubled
 * edges. `flat` is the case that excuses everything — blurring a solid colour is
 * a no-op, so a wrong fade is undetectable over it.
 */
export const BACKDROP_STYLE: Record<BackdropKind, string> = {
  checker: 'repeating-conic-gradient(from 45deg, #f472b6 0% 25%, #38bdf8 0% 50%) 0 0 / 44px 44px',
  flat: '#6a6a6a',
  stripes: 'repeating-linear-gradient(90deg, #0a0a0a 0 3px, #f5f5f5 3px 6px)',
};
