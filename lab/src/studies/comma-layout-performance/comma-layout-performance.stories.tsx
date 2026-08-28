import type { Meta, StoryObj } from '@storybook/react-vite';

import { CommaLayoutPerformance } from './comma-layout-performance.js';

const meta: Meta = {
  title: 'Studies/Comma layout performance',
};

export default meta;

export const Default: StoryObj = {
  render: () => <CommaLayoutPerformance />,
};
