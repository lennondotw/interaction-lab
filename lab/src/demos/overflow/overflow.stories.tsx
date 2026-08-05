import type { Meta, StoryObj } from '@storybook/react-vite';
import { Overflow, OverflowWithMutationObserver } from './overflow.js';

const meta: Meta = {
  title: 'Demos/Overflow',
  parameters: {
    layout: 'centered',
  },
};

export default meta;

export const Default: StoryObj = {
  render: () => <Overflow />,
};

export const WithMutationObserver: StoryObj = {
  render: () => <OverflowWithMutationObserver />,
};
