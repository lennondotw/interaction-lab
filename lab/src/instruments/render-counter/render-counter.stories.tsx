import type { Meta, StoryObj } from '@storybook/react-vite';

import { RenderCounterDemo, RenderCounterPointerDemo } from './render-counter.js';

const meta: Meta = {
  title: 'Instruments/Render counter',
};

export default meta;

export const Default: StoryObj = {
  render: () => <RenderCounterDemo />,
};

export const Pointer: StoryObj = {
  render: () => <RenderCounterPointerDemo />,
};
