import { glassFadeMeta, type GlassFadeStory } from '../glass-fade-story-meta.js';

const meta = { ...glassFadeMeta, title: 'Studies/Glass fade/Material strength' };

export default meta;
type Story = GlassFadeStory;

/**
 * The fix: `opacity` untouched, blur radius and tint alpha ramping together. The copy
 * stays unreadable at every value.
 *
 * The basic split scrub takes the material ramp apart. Four axes, each worth a look
 * on its own:
 *
 *  - `tint alpha` to 0, then sweep `blur radius` — past roughly a third the copy is
 *    already illegible and more radius changes nothing. That is what "the radius saturates
 *    early" means: from there on the tint carries the whole perceived ramp.
 *  - `border alpha` independently controls the white hairline, without changing the black fill.
 *  - `content` to 1 with the other two at 0 — the label hangs in mid-air with no surface
 *    under it, which is what happens when the content's fade is forgotten.
 *  - `content` to 0 with the material up — the surface arrives empty, which is the
 *    trailing-content shape most transitions actually want.
 *
 * `progress` is off here; these four are it.
 */
export const MaterialStrength: Story = {
  name: 'material strength · independent progress',
  args: {
    blurRadiusProgress: 0.5,
    borderAlphaProgress: 0.5,
    contentProgress: 0.5,
    mode: 'material',
    tintAlphaProgress: 0.5,
  },
  argTypes: {
    blurRadiusProgress: { control: { max: 1, min: 0, step: 0.01, type: 'range' } },
    borderAlphaProgress: { control: { max: 1, min: 0, step: 0.01, type: 'range' } },
    contentProgress: { control: { max: 1, min: 0, step: 0.01, type: 'range' } },
    progress: { control: false },
    tintAlphaProgress: { control: { max: 1, min: 0, step: 0.01, type: 'range' } },
  },
};

/**
 * The same material on one knob, which is what a real transition has: a single timeline
 * spending its α on radius, tint, border and content at once. Worth its own story rather than a
 * mode of the one above, because this is the shape to copy and the four axes are only an
 * instrument for understanding what each contributes.
 *
 * Nothing switches it: not supplying the axes *is* the bound case, so all four fall back
 * to `progress`.
 */
export const MaterialStrengthTogether: Story = {
  name: 'material strength · all progress bound',
  args: { mode: 'material' },
};

/*
 * The two mapped scrubs below. The two unmapped scrubs above drive the axes with α
 * directly — which is the right default: it shows what the material's own response curve is,
 * and that curve is the thing being complained about. These two put the correction in without a
 * time axis, which is the only way to inspect it a value at a time rather than as a feeling.
 */

/**
 * The split scrub with the mapping on, which is the most direct way to see what it does: hold
 * `tint alpha` wherever you like and sweep `blur radius`, and the radius follows α^γ rather than
 * α — 0.5 buys a quarter of the radius, not half. The sliders stay in α on purpose; only the
 * material is mapped, so what the slider says is still comparable with the unmapped story.
 *
 * Every parameter has its own remap exponent. Defaults keep tint, border and content linear at
 * gamma 1, while blur uses gamma 2.6; all four exponents can be changed independently.
 */
export const MaterialStrengthMapped: Story = {
  name: 'material strength · independent progress, remapped parameters',
  args: {
    blurGamma: 2.6,
    blurRadiusProgress: 0.5,
    borderAlphaProgress: 0.5,
    contentProgress: 0.5,
    mapping: 'remapped',
    mode: 'material',
    tintAlphaProgress: 0.5,
  },
  argTypes: {
    blurRadiusProgress: { control: { max: 1, min: 0, step: 0.01, type: 'range' } },
    borderAlphaProgress: { control: { max: 1, min: 0, step: 0.01, type: 'range' } },
    contentProgress: { control: { max: 1, min: 0, step: 0.01, type: 'range' } },
    progress: { control: false },
    tintAlphaProgress: { control: { max: 1, min: 0, step: 0.01, type: 'range' } },
  },
};

/**
 * All input progress values are bound; their remap curves remain independent. This is the
 * scrubbable twin of the interactive stories, and the place to tune all four exponents.
 * Drag progress slowly with the copy behind the panel: the question each gamma answers
 * is whether equal drags of the slider feel like equal amounts of frost arriving, and a slider
 * lets you go back and forth over the same tenth, which a 500ms transition does not.
 */
export const MaterialStrengthTogetherMapped: Story = {
  name: 'material strength · all progress bound, remapped parameters',
  args: { blurGamma: 2.6, mapping: 'remapped', mode: 'material' },
};
