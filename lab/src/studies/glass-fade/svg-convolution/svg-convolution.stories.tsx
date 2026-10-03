import { glassFadeMeta, type GlassFadeStory } from '../glass-fade-story-meta.js';

const meta = { ...glassFadeMeta, title: 'Studies/Glass fade/SVG convolution' };

export default meta;
type Story = GlassFadeStory;

/**
 * Same material and mapping, replacing only the blur implementation. Keep one panel in place
 * and switch implementations in Controls: separate panels at different positions would mix
 * rasterisation differences into the comparison. Fixed kernel support avoids a size-dependent
 * shader switch while scrubbing; weights vary continuously. No feGaussianBlur is involved.
 */
export const MaterialStrengthTogetherMappedConvolution: Story = {
  name: 'material strength · all progress bound, SVG convolution experiment',
  args: {
    blurGamma: 2.6,
    blurImplementation: 'svg-convolution',
    // Keep caption geometry fixed when switching implementations on this comparison panel.
    captionNote:
      'Compare CSS Gaussian blur with SVG convolution on the same panel. CSS can jump at downsampling thresholds; SVG uses fixed-support Gaussian kernels and changes only their weights. Larger targets use a fixed number of pass pairs. The SVG approximation has different edge sampling and higher cost at large radii; small pixel quantisation remains.',
    mapping: 'remapped',
    mode: 'material',
  },
  argTypes: {
    blurImplementation: { control: 'inline-radio', options: ['css', 'svg-convolution'] },
  },
};
