import { glassFadeMeta, type GlassFadeStory } from '../glass-fade-story-meta.js';

const meta = { ...glassFadeMeta, title: 'Studies/Glass fade/CSS blur issues' };

export default meta;
type Story = GlassFadeStory;

/**
 * Keep CSS blur here as an explicit reproduction, while the working material and gesture
 * stories use SVG convolution. With the 16px target and gamma 2.6, scrub 0.79 → 0.80 to cross 8.889px.
 * The historical second threshold at 17.778px needs a target above that radius;
 * setting blurPx to 20 crosses it at 0.95 → 0.96 with gamma 2.6.
 * The original archived 0.94 → 0.95 reproduction used gamma 2.
 * Changing the mapping relocates the thresholds rather than removing them.
 */
export const MappedDownsamplingJumps: Story = {
  name: 'CSS blur · remapped parameters, downsampling jumps',
  args: {
    blurGamma: 2.6,
    blurImplementation: 'css',
    mapping: 'remapped',
    mode: 'material',
    progress: 0.79,
  },
};
