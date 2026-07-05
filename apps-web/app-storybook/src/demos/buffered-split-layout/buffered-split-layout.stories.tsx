import type { Meta, StoryObj } from '@storybook/react-vite';
import { BufferedSplitLayoutDemo } from './buffered-split-layout.js';

const meta = {
  title: 'Demos/BufferedSplitLayout',
  component: BufferedSplitLayoutDemo,
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
} satisfies Meta<typeof BufferedSplitLayoutDemo>;

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
