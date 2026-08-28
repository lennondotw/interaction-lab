import type { Meta, StoryObj } from '@storybook/react-vite';

import { SvgDisplacementMap } from './svg-displacement-map.js';

const meta: Meta = {
  title: 'Studies/SVG displacement map',
};

export default meta;

export const Default: StoryObj = {
  render: () => <SvgDisplacementMap />,
};
