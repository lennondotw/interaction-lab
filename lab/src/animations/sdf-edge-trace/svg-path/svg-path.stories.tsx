import type { Meta, StoryObj } from '@storybook/react-vite';

import { SdfSvgPath } from './svg-path.js';

/**
 * Step one out of canvas: does the contour survive becoming an SVG `d`, and what
 * does that cost? Overlay both renderers to check the curve, then read the two
 * stats canvas never pays — the string's length and the time to build it.
 */
const meta: Meta = {
  title: 'Animations/SdfEdgeTrace/SvgPath',
  id: 'sdf-edge-trace-svg-path',
};

export default meta;

export const Default: StoryObj = {
  parameters: {
    layout: 'fullscreen',
  },
  render: () => <SdfSvgPath />,
};
