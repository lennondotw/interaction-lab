import type { Meta, StoryObj } from '@storybook/react-vite';
import { useLayoutEffect, useRef, useState } from 'react';

import { Segmented } from '#src/instruments/controls/controls.js';

import { Button } from '../button/index.js';
import { MessageInput } from '../message-input/index.js';
import { ChatScrollContainer, type ChatMessage, type ChatScrollState } from './chat-scroll-container.js';

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

const messageOptions: Record<ChatMessage['variant'], readonly string[]> = {
  incoming: [
    'Hi!',
    'Coffee?',
    'I found a little place around the corner that you might like.',
    'The rain has finally stopped. Everything outside looks a little brighter now.',
    'Do you have a moment later today? I have a few ideas to share, but there is no rush. We can pick them up whenever you have a quiet minute.',
    'A small update:\nThe first draft is ready.\nI left a few notes at the end for us to discuss.',
    'I took the long way home and discovered a tiny bookstore between the bakery and the flower shop. There was a sleepy cat in the window and a whole shelf of old travel journals.\n\nWe should stop by sometime. I think you would enjoy getting lost in there for an hour.',
    'Here is the plan for tomorrow:\nMeet at the station after breakfast, walk along the river, and find somewhere for lunch. If the weather changes, we can spend the afternoon at the museum instead.\n\nNothing is booked yet, so there is plenty of room to change our minds.',
  ],
  outgoing: [
    'Yes.',
    'On my way!',
    'That sounds good. Let me finish this and I will join you.',
    'I have been thinking about the same thing. A slower afternoon might be exactly what we need.',
    'Thanks for putting this together. I will read through it after lunch and send you a few thoughts. The overall direction already feels right to me.',
    'A few things to bring:\nA notebook.\nSomething warm.\nEnough time to take the scenic route.',
    'I like the idea of leaving the afternoon open. We could start with a short walk and see where we end up, without trying to fit too many things into one day.\n\nI will bring my camera in case the light is good, but I am equally happy to just sit somewhere and talk.',
    'I went through the notes and made a few small changes. The opening is shorter now, and the examples have a little more room to breathe.\n\nThere is one question I would rather talk through together than settle in a message. Everything else can wait until tomorrow. Have a restful evening!',
  ],
};

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

function SendMessagesDemo() {
  const [chatMessages, setChatMessages] = useState(messages);
  const [threshold, setThreshold] = useState(20);
  const [scrollState, setScrollState] = useState<ChatScrollState>();

  function appendMessage(variant: ChatMessage['variant']) {
    const options = messageOptions[variant];
    const content = options[Math.floor(Math.random() * options.length)]!;
    setChatMessages((previous) => [
      ...previous,
      {
        id: `message-${previous.length + 1}`,
        variant,
        content,
      },
    ]);
  }

  return (
    <div className="flex size-full flex-col gap-3">
      <ChatScrollContainer
        messages={chatMessages}
        bottomThreshold={threshold}
        onScrollStateChange={setScrollState}
        className="flex-1"
      />
      <div className="flex shrink-0 flex-wrap justify-center gap-2">
        <Button type="button" onClick={() => appendMessage('incoming')}>
          Receive a message
        </Button>
        <Button type="button" onClick={() => appendMessage('outgoing')}>
          Send a message
        </Button>
      </div>
      <div className="flex shrink-0 flex-col gap-2 rounded-lg border border-neutral-500/20 p-3 text-xs leading-5 text-neutral-600 tabular-nums dark:text-neutral-400">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            State:{' '}
            <strong className="text-neutral-900 dark:text-neutral-100">{scrollState?.mode ?? 'following'}</strong>
          </span>
          <fieldset aria-label="Bottom zone" className="m-0 flex min-w-0 items-center gap-2 border-0 p-0">
            <span>Bottom zone</span>
            <Segmented
              options={[
                { value: 2, label: '2 px' },
                { value: 20, label: '20 px · debug' },
              ]}
              value={threshold}
              onChange={setThreshold}
            />
          </fieldset>
        </div>
        <div className="grid grid-cols-2 gap-x-4">
          <span>Following: {scrollState?.mode === 'detached' ? 'No' : 'Yes'}</span>
          <span>Near bottom: {scrollState?.nearBottom ? 'Yes' : 'No'}</span>
          <span>Distance: {scrollState?.distance.toFixed(2) ?? '0.00'} px</span>
          <span>Velocity: {scrollState?.velocity.toFixed(0) ?? '0'} px/s</span>
          <span>Position: {scrollState?.scrollTop.toFixed(2) ?? '0.00'} px</span>
          <span>Target: {scrollState?.target.toFixed(2) ?? '0.00'} px</span>
        </div>
        <span>Last transition: {scrollState?.reason ?? 'Initial position'}</span>
      </div>
    </div>
  );
}

export const SendMessages: Story = {
  parameters: { controls: { disable: true } },
  render: () => <SendMessagesDemo />,
};

function WithMessageInputDemo() {
  const [chatMessages, setChatMessages] = useState(messages);
  const [draft, setDraft] = useState('');
  const hostRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);

  useLayoutEffect(() => {
    const composer = composerRef.current;
    const host = hostRef.current;
    if (!composer || !host) return;
    const measure = () =>
      host.style.setProperty('--chat-composer-height', `${composer.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(composer);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={hostRef} className="grid size-full min-h-0 min-w-0">
      <ChatScrollContainer
        messages={chatMessages}
        className="col-start-1 row-start-1"
        contentClassName="pb-[calc(var(--chat-composer-height,0px)+0.75rem)]"
      />
      <form
        ref={composerRef}
        aria-label="Compose message"
        className="pointer-events-none z-10 col-start-1 row-start-1 flex min-w-0 self-end p-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.trim()) return;
          setChatMessages((previous) => [
            ...previous,
            { id: `message-${previous.length + 1}`, variant: 'outgoing', content: draft.trim() },
          ]);
          setDraft('');
        }}
      >
        <MessageInput
          className="pointer-events-auto flex-1"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
      </form>
    </div>
  );
}

export const WithMessageInput: Story = {
  parameters: { controls: { disable: true } },
  render: () => <WithMessageInputDemo />,
};
