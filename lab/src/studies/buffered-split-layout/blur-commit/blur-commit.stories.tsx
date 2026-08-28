import type { Meta, StoryObj } from '@storybook/react-vite';

import { BufferedSplitLayoutBlurCommitDemo } from './blur-commit.js';

const meta = {
  title: 'Studies/Buffered split layout/Blur commit',
  component: BufferedSplitLayoutBlurCommitDemo,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    initialLeadingRatio: {
      control: { type: 'range', min: 0.38, max: 0.72, step: 0.01 },
    },
    initialTrailingOpen: {
      control: { type: 'boolean' },
    },
  },
} satisfies Meta<typeof BufferedSplitLayoutBlurCommitDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Expanded: Story = {
  args: {
    initialLeadingRatio: 0.6,
    initialTrailingOpen: true,
  },
};

export const Collapsed: Story = {
  args: {
    initialLeadingRatio: 0.6,
    initialTrailingOpen: false,
  },
};
