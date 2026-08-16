import type { Meta, StoryObj } from '@storybook/react-vite';
import { useArgs } from 'storybook/preview-api';

import { BACKDROP_KINDS, FADE_MODES } from './glass-fade-modes.js';
import { GlassFadeComparison, GlassFadeStage } from './glass-fade.js';

/**
 * `backdrop-filter` **replaces** what is behind an element with a processed copy
 * of it; `opacity` **blends** the element back over the unprocessed original. Run
 * both and the backdrop is composited twice:
 *
 * ```text
 * result = α · (blurred backdrop + content) + (1 − α) · sharp backdrop
 * ```
 *
 * So a half-transparent glass layer is not half-frosted, it is a double exposure.
 * Each story drives the same 0 → 1 through a different property; scrub it — in the page
 * or in Controls, they are the same value — and try to read the copy through the panel.
 * You should not be able to, at any value.
 *
 * `blurPx` and `tintAlphaTarget` are where each ramp *ends*; the sliders are where along
 * it the material currently is. Only `material strength` splits them in two, because it
 * is the only mode whose fade is the ramp itself; the others have a single α, and giving
 * them two knobs would mean two knobs that cannot disagree.
 *
 * Keep `backdrop` on `text` while judging: a legible word inside the panel is proof
 * the frost is not working, and it needs no calibration to see. `flat` is there to
 * show the opposite — over a solid colour every mode looks correct, which is the
 * reason this ships broken so often.
 */
const meta = {
  title: 'Demos/Glass fade',
  component: GlassFadeStage,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    backdrop: { control: 'inline-radio', options: BACKDROP_KINDS },
    blurPx: { control: { max: 48, min: 0, step: 1, type: 'range' } },
    // Off by default, and re-enabled by the one story that reads them. A knob that does
    // nothing is worse than no knob, and in every other mode the material is simply done.
    blurRadiusProgress: { control: false },
    // Off unless a story reads it: only the mapped stories have a γ to move.
    blurGamma: { control: false },
    // Structural: which gesture owns the α is what a story *is*, not something to flip.
    interaction: { control: false },
    mapping: { control: 'inline-radio', options: ['linear', 'perceptual'] },
    mode: { control: 'select', options: FADE_MODES },
    timing: { control: 'inline-radio', options: ['linear', 'ease'] },
    progress: { control: { max: 1, min: 0, step: 0.01, type: 'range' } },
    // Colour and alpha as two controls: a dark glass is reachable without touching the
    // component, and the alpha stays a slider, which is how you find the value where
    // the tint stops carrying the ramp.
    tint: { control: 'color' },
    tintAlphaProgress: { control: false },
    tintAlphaTarget: { control: { max: 0.6, min: 0, step: 0.01, type: 'range' } },
  },
  /*
   * `mapping` and `timing` are spelled out rather than left to the component's defaults, so the
   * radios show what is actually applied instead of showing nothing selected. Unmapped and
   * constant-rate is the default everywhere: the material's own response curve first, the
   * corrections in the stories that say so in their names.
   */
  args: {
    backdrop: 'text',
    blurPx: 20,
    mapping: 'linear',
    progress: 0.5,
    timing: 'linear',
    tint: '#ffffff',
    tintAlphaTarget: 0.18,
  },
  /*
   * `useArgs` is a Storybook hook, not a React one: its context is only live while the
   * story function runs, so it has to be called in `render` itself. Moving it into a
   * component throws "Rendered more hooks than during the previous render".
   */
  render: (args) => {
    const [, updateArgs] = useArgs();

    return (
      <div className="flex min-h-screen w-full items-center justify-center px-2">
        <GlassFadeStage {...args} onOptionsChange={updateArgs} />
      </div>
    );
  },
} satisfies Meta<typeof GlassFadeStage>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The defect. Park at 0.5: the copy is still readable through the panel, at about
 * half contrast, with a washed frost behind it. The inset hairline and the corner
 * radius fade out along with everything else, so the panel reads unfinished rather
 * than translucent.
 */
export const LayerOpacity: Story = {
  name: 'opacity on the layer',
  args: { mode: 'layer-opacity' },
};

/**
 * The workaround that is not one. A uniform-alpha mask composites through the same
 * formula, so it is visually indistinguishable from `opacity` — though not bit-for-bit:
 * swapping one for the other on the same layer moves 0.14% of pixels, all inside the
 * panel, 93% of them by one 8-bit step (a mask is a quantised image, opacity is a
 * float), and up to 19/255 on the corner arcs, where the antialiased coverage takes a
 * second rounding. Worth its own story because `mask-image` is what people reach for
 * after opacity disappoints — and because a *gradient* mask genuinely is fine, which is
 * what makes the flat one plausible.
 */
export const UniformAlphaMask: Story = {
  name: 'uniform-alpha mask',
  args: { mode: 'mask-alpha' },
};

/**
 * A different and worse bug: the fade sits on a wrapper, the shape you get when
 * `AnimatePresence` fades a container instead of the card. Any α below 1 makes the
 * wrapper a backdrop root, so the blur can only sample the wrapper's own content —
 * nothing — and stops entirely. Scrub to exactly 1 and it is correct again, which
 * is how this survives review: the stable state is fine, only the frames are not.
 */
export const AncestorOpacity: Story = {
  name: 'opacity on an ancestor',
  args: { mode: 'ancestor-opacity' },
};

/**
 * The fix: `opacity` untouched, blur radius and tint alpha ramping together. The copy
 * stays unreadable at every value.
 *
 * The only story that takes the ramp apart, because it is the only mode whose fade *is*
 * the ramp. Three axes, each worth a look on its own:
 *
 *  - `tint alpha` to 0, then sweep `blur radius` — past roughly a third the copy is
 *    already illegible and more radius changes nothing. That is what "the radius saturates
 *    early" means: from there on the tint carries the whole perceived ramp.
 *  - `content` to 1 with the other two at 0 — the label hangs in mid-air with no surface
 *    under it, which is what happens when the content's fade is forgotten.
 *  - `content` to 0 with the material up — the surface arrives empty, which is the
 *    trailing-content shape most transitions actually want.
 *
 * `progress` is off here; these three are it.
 */
export const MaterialStrength: Story = {
  name: 'material strength',
  args: { blurRadiusProgress: 0.5, contentProgress: 0.5, mode: 'material', tintAlphaProgress: 0.5 },
  argTypes: {
    blurRadiusProgress: { control: { max: 1, min: 0, step: 0.01, type: 'range' } },
    contentProgress: { control: { max: 1, min: 0, step: 0.01, type: 'range' } },
    progress: { control: false },
    tintAlphaProgress: { control: { max: 1, min: 0, step: 0.01, type: 'range' } },
  },
};

/**
 * The same material on one knob, which is what a real transition has: a single timeline
 * spending its α on radius, tint and content at once. Worth its own story rather than a
 * mode of the one above, because this is the shape to copy and the three axes are only an
 * instrument for understanding what each contributes.
 *
 * Nothing switches it: not supplying the axes *is* the bound case, so all three fall back
 * to `progress`.
 */
export const MaterialStrengthTogether: Story = {
  name: 'material strength · one progress',
  args: { mode: 'material' },
};

/*
 * The two mapped scrubs below. Every story above this point is unmapped — α drives the axes
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
 * `content` is mapped too, at γ = 1, which is to say not at all. Same for the tint. Measured,
 * neither needs it; the radius is the only axis whose perceived rate is not already even.
 */
export const MaterialStrengthMapped: Story = {
  name: 'material strength, mapped α',
  args: {
    blurGamma: 2,
    blurRadiusProgress: 0.5,
    contentProgress: 0.5,
    mapping: 'perceptual',
    mode: 'material',
    tintAlphaProgress: 0.5,
  },
  argTypes: {
    blurGamma: { control: { max: 4, min: 1, step: 0.1, type: 'range' } },
    blurRadiusProgress: { control: { max: 1, min: 0, step: 0.01, type: 'range' } },
    contentProgress: { control: { max: 1, min: 0, step: 0.01, type: 'range' } },
    progress: { control: false },
    tintAlphaProgress: { control: { max: 1, min: 0, step: 0.01, type: 'range' } },
  },
};

/**
 * One knob, mapped — the scrubbable twin of the interactive stories, and the one to park on when
 * choosing `blurGamma`. Drag α slowly with the copy behind the panel: the question the γ answers
 * is whether equal drags of the slider feel like equal amounts of frost arriving, and a slider
 * lets you go back and forth over the same tenth, which a 400ms transition does not.
 */
export const MaterialStrengthTogetherMapped: Story = {
  name: 'material strength · one progress, mapped α',
  args: { blurGamma: 2, mapping: 'perceptual', mode: 'material' },
  argTypes: { blurGamma: { control: { max: 4, min: 1, step: 0.1, type: 'range' } } },
};

/*
 * The stories below are the first ones here with a time axis, and the only place the defect
 * can be judged the way a user meets it — in flight.
 *
 * There are three layers between a gesture and a pixel, and they apply in this order:
 *
 *   1. gesture      the target α, 0 or 1
 *   2. easing       how α travels there over time
 *   3. mapping      what a given α means in radius, tint alpha and content opacity
 *
 * Each story's name says which of 2 and 3 are switched on. Order matters and is not
 * commutative: easing reshapes time, the mapping reshapes the material, and swapping them
 * gives a different curve. It is also why these drive α per frame rather than handing the job
 * to a CSS `transition` — a transition interpolates each property's *endpoint values* and
 * never evaluates the α in between, and since 0 and 1 map to 0 and 1 under any mapping, a
 * transition-driven toggle silently ignores layer 3 entirely.
 *
 * `mode` stays live on all of them. Switching it to `opacity on the layer` and running the
 * gesture again is the shortest route to the whole point of the demo: the same motion, over
 * the same copy, reading as dirty instead of as frosted.
 */

/**
 * **Layers: gesture → decelerating α → perceptual mapping.** All three.
 *
 * α from the story's `progress` to 1 on pointer-enter — a surface *strengthening* under the
 * pointer rather than appearing, which is the common case for a hover state on glass. Starting
 * at 0.5 rather than 0 also means the wrong modes are already showing their ghost at rest, and
 * the gesture only deepens it.
 *
 * Both layers on, because a hover has no patience: it has to answer on the first frame, which
 * is what the deceleration curve buys, and it starts from half strength, so the mapping's slow
 * low end is not even in the range being travelled. Drop `mapping` to `linear` and the second
 * half of the gesture goes flat — by then the radius is far past where more of it shows.
 */
export const HoverToStrengthen: Story = {
  name: 'interactive · hover 0.5 → 1, mapped α + ease',
  args: { blurGamma: 2, interaction: 'hover', mapping: 'perceptual', mode: 'material', progress: 0.5, timing: 'ease' },
  argTypes: { blurGamma: { control: { max: 4, min: 1, step: 0.1, type: 'range' } } },
};

/**
 * **Layers: gesture → decelerating α → perceptual mapping.** The same hover from nothing.
 *
 * Worth having both, because the range travelled is what decides whether the mapping matters at
 * all. Strengthening from 0.5 never enters the low end, so γ barely shows; appearing from 0
 * crosses all of it, and this is the story where `blurGamma` earns its slider — sweep it to 4
 * and the surface hesitates under the pointer, drop it to 1 and everything arrives in the first
 * two frames with the rest of the gesture going nowhere.
 *
 * One cost this story makes visible: a hover target sits at α = 0 almost all of its life, and
 * mid-gesture the radius must stay `blur(0px)` rather than `none`, since the two do not
 * interpolate. So the panel holds a compositing layer permanently for a material that is not
 * there — fine for one, worth settling back to `none` on rest for a list of them.
 */
export const HoverFromNothing: Story = {
  name: 'interactive · hover 0 → 1, mapped α + ease',
  args: { blurGamma: 2, interaction: 'hover', mapping: 'perceptual', mode: 'material', progress: 0, timing: 'ease' },
  argTypes: { blurGamma: { control: { max: 4, min: 1, step: 0.1, type: 'range' } } },
};

/**
 * **Layers: gesture → linear α → no mapping.** The baseline.
 *
 * The appearance proper: 0 → 1 on a button, which is the transition every sheet, popover and
 * toolbar runs. Constant-rate α with no mapping, so what you feel is the material's own
 * response curve and nothing else — and it front-loads badly, because one eighth of the way in
 * the blur has already delivered 85% of the change it will ever make.
 *
 * This is also the one to watch with `mode` on `opacity on an ancestor` — the blur is not
 * merely wrong mid-flight there, it is absent, and then snaps in at the end.
 */
export const ToggleVisibility: Story = {
  name: 'interactive · toggle',
  args: { interaction: 'toggle', mode: 'material' },
};

/**
 * **Layers: gesture → linear α → perceptual mapping.**
 *
 * The mapping layer alone, with time still constant-rate so the two cannot be confused. Only
 * the radius is remapped: measured, the tint's rate is already 1 (mean error 0.009), so there
 * is nothing to correct there, and the content's is left at 1 by the same argument.
 *
 * `blurGamma` is a control because the right value is a judgement the numbers cannot settle.
 * The metric's own optimum is 4, and it is not shippable — 0.3⁴ of 20px is 0.16px, so the first
 * third reads as a dead zone. 2 is the default: about twice as even as linear, with nothing
 * dead. Nothing in between is *correct*; perceived frostiness goes as roughly the log of the
 * radius, so evening it out always means crawling through the low end.
 */
export const ToggleVisibilityPerceptual: Story = {
  name: 'interactive · toggle, mapped α',
  args: { blurGamma: 2, interaction: 'toggle', mapping: 'perceptual', mode: 'material' },
  argTypes: { blurGamma: { control: { max: 4, min: 1, step: 0.1, type: 'range' } } },
};

/**
 * **Layers: gesture → decelerating α → perceptual mapping.** All three, in order.
 *
 * The shipping shape, and the one place where the two curves multiply. `cubic-bezier(0, 0, 0.2,
 * 1)`: full speed from the first frame, decelerating into the end, which is the convention for
 * something entering.
 *
 * The two layers pull against each other here, and that is the point. The ease spends α early,
 * where the mapping is stingy with material, so the surface commits on the first frame without
 * the mapping's low end reading as a dead zone — and it decelerates through the range where
 * more radius stops showing anyway. The stock `cubic-bezier(0.4, 0, 0.2, 1)` is the wrong
 * partner for exactly the same reason: measured, it is an S that leaves α at 0 for two frames,
 * and that delay stacks with the mapping's into a visible nothing.
 *
 * Compare with `mapped α` to feel the easing alone, and flip `mapping` to `linear` to see the
 * pairing that ships by default: a decelerating curve over an unmapped material, which puts
 * nearly all of the perceived change in the first few frames.
 */
export const ToggleVisibilityEased: Story = {
  name: 'interactive · toggle, mapped α + ease',
  args: { blurGamma: 2, interaction: 'toggle', mapping: 'perceptual', mode: 'material', timing: 'ease' },
  argTypes: { blurGamma: { control: { max: 4, min: 1, step: 0.1, type: 'range' } } },
};

/**
 * All four at the same α, because 0.5 is only damning beside the mode that gets it
 * right there. Controls are off: this story hard-codes the α it is about.
 */
export const AllModes: StoryObj<typeof GlassFadeComparison> = {
  name: 'all four at α = 0.5',
  parameters: { controls: { disable: true } },
  render: () => (
    <GlassFadeComparison backdrop="text" blurPx={20} progress={0.5} tint="#ffffff" tintAlphaTarget={0.18} />
  ),
};
