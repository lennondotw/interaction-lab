import type { Meta, StoryObj } from '@storybook/react-vite';

import { SdfOnCanvas } from './on-canvas.js';

/**
 * The original: the contour extracted and drawn straight to a 2D canvas, with the
 * field, traversal and cell-size controls the cost numbers in `archive/` came
 * from. The siblings in this folder take the same tracer somewhere else, and this
 * one stays the reference they are compared against.
 */
const meta: Meta = {
  title: 'Studies/SDF edge trace/On canvas',
  id: 'sdf-edge-trace-on-canvas',
};

export default meta;

export const Default: StoryObj = {
  parameters: {
    layout: 'fullscreen',
  },
  render: () => <SdfOnCanvas />,
};
