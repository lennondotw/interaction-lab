import type { Meta, StoryObj } from '@storybook/react-vite';

import { SdfContinuousCorner } from './continuous-corner-trace.js';

/**
 * The corner families a real component uses, traced and measured.
 *
 * `round` and `superellipse(k)` are exact: the p-norm level set inside the `r × r` corner
 * box *is* CSS's `corner-shape` curve. Apple's continuous corner is not in that family —
 * it reaches `1.528665r` along each edge, leaving the corner box — so it can only be
 * approximated, and this story reports by how much against `ContinuousCorner`'s own
 * geometry rather than asserting a number.
 */
const meta: Meta = {
  title: 'Studies/SDF edge trace/Continuous corner',
  id: 'sdf-edge-trace-continuous-corner',
};

export default meta;

export const Default: StoryObj = {
  parameters: {
    layout: 'fullscreen',
  },
  render: () => <SdfContinuousCorner />,
};
