import type { Meta, StoryObj } from '@storybook/react-vite';

import { SdfEffect } from './sdf-effect.js';

const meta: Meta = {
  title: 'Studies/SDF effect',
  id: 'sdf-effect',
};

export default meta;

export const Default: StoryObj = {
  parameters: {
    layout: 'fullscreen',
  },
  render: () => <SdfEffect />,
};
