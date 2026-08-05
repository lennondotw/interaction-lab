import type { Meta, StoryObj } from '@storybook/react-vite';
import { SvgGradientMask } from './svg-gradient-mask.js';

const meta: Meta = {
  title: 'SVG Playground/SvgGradientMask',
};

export default meta;

export const Default: StoryObj = {
  render: () => <SvgGradientMask />,
};
