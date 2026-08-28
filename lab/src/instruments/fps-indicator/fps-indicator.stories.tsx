import type { Meta, StoryObj } from '@storybook/react-vite';

import { FpsIndicator } from './fps-indicator.js';

const meta: Meta = {
  title: 'Instruments/FPS indicator',
  parameters: {
    layout: 'centered',
  },
};

export default meta;

export const Default: StoryObj = {
  render: () => <FpsIndicator />,
};
