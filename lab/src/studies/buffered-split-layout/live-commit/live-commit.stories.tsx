import type { Meta, StoryObj } from '@storybook/react-vite';

import { BufferedSplitLayoutLiveCommitDemo } from './live-commit.js';

const meta = {
  title: 'Studies/Buffered split layout/Live commit',
  component: BufferedSplitLayoutLiveCommitDemo,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    initialLeadingRatio: {
      control: { type: 'range', min: 0.38, max: 0.72, step: 0.01 },
    },
  },
} satisfies Meta<typeof BufferedSplitLayoutLiveCommitDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    initialLeadingRatio: 0.6,
  },
};
