import type { Meta, StoryObj } from '@storybook/react-vite';

import { ScrollLinkedTriggered } from './scroll-linked-triggered.js';

const meta: Meta = {
  title: 'Scenes/Scroll linked and triggered',
};

export default meta;

export const Default: StoryObj = {
  render: () => <ScrollLinkedTriggered />,
};
