import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScrollSmoothing } from './scroll-smoothing.js';

const meta: Meta = {
  title: 'Animations/ScrollSmoothing',
};

export default meta;

export const Default: StoryObj = {
  render: () => <ScrollSmoothing />,
};
