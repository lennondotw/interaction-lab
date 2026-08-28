import type { Meta, StoryObj } from '@storybook/react-vite';

import { HelloWorld } from './hello-world.js';

const meta: Meta = {
  title: 'Documentation/Template',
};

export default meta;

export const Default: StoryObj = {
  render: () => <HelloWorld />,
};
