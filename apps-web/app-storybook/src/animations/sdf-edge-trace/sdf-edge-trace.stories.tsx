import type { Meta, StoryObj } from '@storybook/react-vite';
import { SdfEdgeTrace } from './sdf-edge-trace.js';

/**
 * The original: the contour extracted and drawn straight to a 2D canvas, with
 * the field, traversal and cell-size controls that the cost numbers came from.
 * The siblings in this folder take the same tracer somewhere else.
 */
const meta: Meta = {
  title: 'Animations/SdfEdgeTrace/OnCanvas',
  id: 'sdf-edge-trace-on-canvas',
};

export default meta;

export const Default: StoryObj = {
  parameters: {
    layout: 'fullscreen',
  },
  render: () => <SdfEdgeTrace />,
};
