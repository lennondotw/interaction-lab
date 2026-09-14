import type { Meta, StoryObj } from '@storybook/react-vite';

import { ChatScrollContainer, type ChatMessage } from './chat-scroll-container.js';

const conversation: Omit<ChatMessage, 'id'>[] = [
  { variant: 'incoming', content: 'A little room for a thought.' },
  { variant: 'incoming', content: 'The afternoon light drifts across the room, slowly finding every corner.' },
  { variant: 'outgoing', content: 'That sounds like a good place to start.' },
  { variant: 'outgoing', content: 'A quiet moment, a fresh page.' },
  {
    variant: 'incoming',
    content: 'Some ideas arrive all at once. Others take the scenic route.\nThere is room for both.',
  },
  { variant: 'outgoing', content: 'Agreed.' },
  { variant: 'incoming', content: 'Shall we keep going?' },
  { variant: 'outgoing', content: 'Yes. There are still a few more stories waiting just around the corner.' },
];

const messages: ChatMessage[] = Array.from({ length: 120 }, (_, index) => ({
  ...conversation[index % conversation.length]!,
  id: `message-${index + 1}`,
}));

const meta = {
  title: 'Components/Chat scroll container',
  component: ChatScrollContainer,
  parameters: { layout: 'fullscreen' },
  args: { messages },
  argTypes: { messages: { control: false } },
  decorators: [
    (Story) => (
      <div className="flex min-h-svh items-center justify-center px-4 py-8">
        <div className="h-[min(640px,calc(100svh-64px))] w-full max-w-md">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof ChatScrollContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LongList: Story = {
  args: { className: 'size-full' },
};
