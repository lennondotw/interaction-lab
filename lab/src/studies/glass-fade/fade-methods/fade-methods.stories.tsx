import type { StoryObj } from '@storybook/react-vite';

import { glassFadeMeta, type GlassFadeStory } from '../glass-fade-story-meta.js';
import { GlassFadeComparison } from '../glass-fade.js';

// Preserve the original CSS pipeline for the three fade defects and their comparison.
const meta = {
  ...glassFadeMeta,
  args: { ...glassFadeMeta.args, blurImplementation: 'css' as const },
  title: 'Studies/Glass fade/Fade methods',
};

export default meta;
type Story = GlassFadeStory;

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
 * All four at the same α, because 0.5 is only damning beside the mode that gets it
 * right there. Controls are off: this story hard-codes the α it is about.
 */
export const AllModes: StoryObj<typeof GlassFadeComparison> = {
  name: 'all four at α = 0.5',
  parameters: { controls: { disable: true } },
  render: () => (
    <GlassFadeComparison
      backdrop="text"
      blurImplementation="css"
      blurPx={16}
      borderColor="#ffffff"
      borderAlphaTarget={0.08}
      progress={0.5}
      tint="#000000"
      tintAlphaTarget={0.1}
    />
  ),
};
