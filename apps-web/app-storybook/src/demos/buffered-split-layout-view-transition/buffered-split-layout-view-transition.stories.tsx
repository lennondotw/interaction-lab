import type { Meta, StoryObj } from '@storybook/react-vite';
import { BufferedSplitLayoutViewTransitionDemo } from './buffered-split-layout-view-transition.js';

const meta = {
  title: 'Demos/BufferedSplitLayoutViewTransition',
  component: BufferedSplitLayoutViewTransitionDemo,
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
} satisfies Meta<typeof BufferedSplitLayoutViewTransitionDemo>;

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
