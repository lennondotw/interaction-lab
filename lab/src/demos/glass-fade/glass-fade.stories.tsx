import type { Meta, StoryObj } from '@storybook/react-vite';

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
 * Each story drives the same 0 → 1 through a different property; scrub `progress`
 * and watch the stripes inside the panel. They should be flat grey at every value.
 *
 * Keep `backdrop` on `stripes` while judging: 3px hard stripes blur to flat grey,
 * so a crisp stripe is proof the frost is not working. `flat` is there to show the
 * opposite — over a solid colour every mode looks correct, which is the reason
 * this ships broken so often.
 */
const meta = {
  title: 'Demos/Glass fade',
  component: GlassFadeStage,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    backdrop: { control: 'inline-radio', options: BACKDROP_KINDS },
    blurPx: { control: { max: 48, min: 0, step: 1, type: 'range' } },
    mode: { control: 'select', options: FADE_MODES },
    progress: { control: { max: 1, min: 0, step: 0.01, type: 'range' } },
    tintAlpha: { control: { max: 0.6, min: 0, step: 0.01, type: 'range' } },
  },
  args: { backdrop: 'stripes', blurPx: 20, progress: 0.5, tintAlpha: 0.18 },
  render: (args) => (
    <div className="flex min-h-screen w-full items-center justify-center px-2">
      <GlassFadeStage {...args} />
    </div>
  ),
} satisfies Meta<typeof GlassFadeStage>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The defect. Park at 0.5: the stripes come through crisp at about half contrast,
 * with a washed frost behind them. The inset hairline and the corner radius fade
 * out along with everything else, so the panel reads unfinished rather than
 * translucent.
 */
export const LayerOpacity: Story = {
  name: 'opacity on the layer',
  args: { mode: 'layer-opacity' },
};

/**
 * The workaround that is not one. A uniform-alpha mask composites through the same
 * formula, so this is pixel-identical to `opacity`. Worth its own story because
 * `mask-image` is what people reach for after opacity disappoints — and because a
 * *gradient* mask genuinely is fine, which is what makes the flat one plausible.
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
 * The fix: `opacity` untouched, blur radius and tint alpha ramping together.
 * Stripes stay flat grey at every value. Two things to notice — the radius
 * saturates early, so above roughly 0.3 the tint alone carries the ramp; and the
 * label needs its own opacity, because nothing is fading the layer for it any
 * more.
 */
export const MaterialStrength: Story = {
  name: 'material strength',
  args: { mode: 'material' },
};

/**
 * All four at the same α, because 0.5 is only damning beside the mode that gets it
 * right there. Controls are off: this story hard-codes the α it is about.
 */
export const AllModes: StoryObj<typeof GlassFadeComparison> = {
  name: 'all four at α = 0.5',
  parameters: { controls: { disable: true } },
  render: () => <GlassFadeComparison backdrop="stripes" blurPx={20} progress={0.5} tintAlpha={0.18} />,
};
