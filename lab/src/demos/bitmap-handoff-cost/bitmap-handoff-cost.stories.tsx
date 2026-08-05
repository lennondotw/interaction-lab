import type { Meta, StoryObj } from '@storybook/react-vite';

import { BitmapHandoffCost } from './bitmap-handoff-cost.js';

/**
 * What it costs to hand a freshly-generated bitmap to the compositor every frame, and whether
 * `canvas.toDataURL` is the wrong instrument for it.
 *
 * The scene is deliberately unrelated to anything else in the repo — a per-pixel swirl with a
 * high-frequency grain on top, sized by an octave control so both regimes can be seen: one
 * where generating the pixels dominates and the handoff is noise, and one where it is the
 * other way round. The grain matters: smooth gradients deflate well, and a PNG encoder
 * measured against them flatters itself.
 *
 * Rows are ordered so consecutive pairs differ by one thing, which is what lets the
 * differences price a GPU readback, a deflate pass, base64, and CRC-32 + Adler-32
 * independently rather than as one lump.
 */
const meta: Meta = {
  title: 'Demos/BitmapHandoffCost',
  id: 'demos-bitmap-handoff-cost',
};

export default meta;

export const Default: StoryObj = {
  parameters: {
    layout: 'fullscreen',
  },
  render: () => <BitmapHandoffCost />,
};
