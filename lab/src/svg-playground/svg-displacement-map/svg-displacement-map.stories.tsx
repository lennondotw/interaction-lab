import type { Meta, StoryObj } from '@storybook/react-vite';
import { SvgDisplacementMap } from './svg-displacement-map.js';

const meta: Meta = {
  title: 'SVG Playground/SvgDisplacementMap',
};

export default meta;

export const Default: StoryObj = {
  render: () => <SvgDisplacementMap />,
};
