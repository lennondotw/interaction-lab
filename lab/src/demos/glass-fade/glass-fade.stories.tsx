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
    // Structural: which gesture owns the α is what a story *is*, not something to flip.
    interaction: { control: false },
    mode: { control: 'select', options: FADE_MODES },
    progress: { control: { max: 1, min: 0, step: 0.01, type: 'range' } },
    // Colour and alpha as two controls: a dark glass is reachable without touching the
    // component, and the alpha stays a slider, which is how you find the value where
    // the tint stops carrying the ramp.
    tint: { control: 'color' },
    tintAlphaProgress: { control: false },
    tintAlphaTarget: { control: { max: 0.6, min: 0, step: 0.01, type: 'range' } },
  },
  args: { backdrop: 'text', blurPx: 20, progress: 0.5, tint: '#ffffff', tintAlphaTarget: 0.18 },
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
 * The two stories below are the first ones here with a time axis, and they are also the
 * only place the defect can be judged the way a user meets it — in flight, at whatever
 * frame rate the machine happens to give. Nothing animates in JavaScript: every property
 * the material is made of is transitionable, so these set a target and let the browser
 * interpolate, which is both cheaper and the path production actually takes.
 *
 * `mode` stays live on both. Switching it to `opacity on the layer` and running the
 * gesture again is the shortest route to the whole point of the demo: the same motion,
 * over the same copy, reading as dirty instead of as frosted.
 */

/**
 * α from the story's `progress` to 1 on pointer-enter — a surface *strengthening* under
 * the pointer rather than appearing, which is the common case for a hover state on glass.
 * Starting at 0.5 rather than 0 also means the wrong modes are already showing their ghost
 * at rest, and the gesture only deepens it.
 */
export const HoverToStrengthen: Story = {
  name: 'interactive · hover',
  args: { interaction: 'hover', mode: 'material', progress: 0.5 },
};

/**
 * The appearance proper: 0 → 1 on a button, which is the transition every sheet, popover
 * and toolbar runs. This is the one to watch with `mode` on `opacity on an ancestor` — the
 * blur is not merely wrong mid-flight there, it is absent, and then snaps in at the end.
 */
export const ToggleVisibility: Story = {
  name: 'interactive · toggle',
  args: { interaction: 'toggle', mode: 'material' },
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
