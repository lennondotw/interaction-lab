import type { Meta, StoryObj } from '@storybook/react-vite';

import { ScrollBoundaryEvents } from './scroll-boundary-events.js';

const meta = {
  title: 'Studies/Scroll boundary events',
  component: ScrollBoundaryEvents,
  parameters: { layout: 'fullscreen' },
  args: { threshold: 20 },
  argTypes: { threshold: { control: { type: 'range', min: 0, max: 40, step: 1 } } },
} satisfies Meta<typeof ScrollBoundaryEvents>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TrackpadAtBottom: Story = {};
