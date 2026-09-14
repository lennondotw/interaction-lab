import type { Meta, StoryObj } from '@storybook/react-vite';

import { MessageBubble } from './message-bubble.js';

const meta = {
  title: 'Components/Message bubble',
  component: MessageBubble,
  parameters: { layout: 'fullscreen' },
  args: { children: 'A little room for a thought.', variant: 'outgoing', tail: true },
  argTypes: {
    children: { control: 'text' },
    variant: { control: 'inline-radio', options: ['outgoing', 'incoming'] },
    tail: { control: 'boolean' },
  },
  decorators: [
    (Story) => (
      <div className="flex min-h-screen items-center justify-center px-4 py-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MessageBubble>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Outgoing: Story = {};
export const OutgoingWithoutTail: Story = { args: { tail: false } };
export const Incoming: Story = { args: { variant: 'incoming' } };
export const IncomingWithoutTail: Story = { args: { variant: 'incoming', tail: false } };

/** Side-by-side comparison isolates the effect of direction and tail on the same text. */
export const AllVariants: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex max-w-full flex-wrap justify-center gap-x-12 gap-y-6">
      <div className="flex min-w-0 flex-col items-start gap-6">
        <MessageBubble variant="incoming" tail={false}>
          A little room for a thought.
        </MessageBubble>
        <MessageBubble variant="incoming">A little room for a thought.</MessageBubble>
      </div>
      <div className="flex min-w-0 flex-col items-end gap-6">
        <MessageBubble tail={false}>A little room for a thought.</MessageBubble>
        <MessageBubble>A little room for a thought.</MessageBubble>
      </div>
    </div>
  ),
};

export const Multiline: Story = {
  args: {
    children:
      'The afternoon light drifts across the room.\nA few words become a longer story, with room for another line.',
    variant: 'incoming',
  },
  render: (args) => (
    <div className="w-64 max-w-full">
      <MessageBubble {...args} />
    </div>
  ),
};

export const SingleCharacter: Story = { args: { children: 'A' } };

export const Empty: Story = { args: { children: '' } };

export const UnbrokenText: Story = {
  args: { children: 'OneVeryLongUnbrokenWordThatKeepsGoingUntilItNeedsToWrapOntoAnotherLine' },
  render: (args) => (
    <div className="w-48 max-w-full">
      <MessageBubble {...args} />
    </div>
  ),
};
