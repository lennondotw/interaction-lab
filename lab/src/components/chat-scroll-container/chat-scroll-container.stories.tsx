import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Segmented } from '#src/instruments/controls/controls.js';
import { ResizableWindow } from '#src/instruments/resizable-window/resizable-window.js';

import { Button } from '../button/index.js';
import { useChatSendFlight } from '../chat-send-flight/chat-send-flight.js';
import { MessageInput } from '../message-input/index.js';
import { createDemoReplyPlan, demoConversation, type DemoReplyPlan } from './chat-demo-replies.js';
import {
  ChatScrollContainer,
  type ChatListItem,
  type ChatMessage,
  type ChatScrollState,
  type ChatScrollContainerHandle,
} from './chat-scroll-container.js';
import { useChatComposerSpace } from './use-chat-composer-space.js';

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

const composerMessageOptions = [
  'Yes.',
  'On my way!',
  'That sounds good.',
  'See you soon.',
  'Let me grab my notebook.',
  'I will meet you outside.',
  'We can take the scenic route.',
  'Thanks for the update.',
  'I found a quiet place nearby.',
  'Let us pick this up tomorrow.',
  'The afternoon light looks lovely.',
  'I will bring some coffee.',
] as const;

const meta = {
  title: 'Components/Chat scroll container',
  component: ChatScrollContainer,
  parameters: { layout: 'fullscreen' },
  args: { messages },
  argTypes: { messages: { control: false } },
  decorators: [
    (Story, context) =>
      context.parameters.resizableWindow ? (
        <div className="flex min-h-svh items-start p-8">
          <Story />
        </div>
      ) : (
        <div className="flex min-h-svh items-center justify-center px-4 py-8">
          <div
            className={
              context.parameters.happyPathGuide
                ? 'grid w-full max-w-4xl grid-cols-1 items-start gap-6 md:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]'
                : 'h-[min(640px,calc(100svh-64px))] w-full max-w-md'
            }
          >
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

function BubbleDebugToggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
      <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
      Bubble debug
    </label>
  );
}

function ChatDemo({
  withMessageInput = false,
  withAnchorDebug = false,
  resizable = false,
  withHistoryInsertion = false,
  automaticReplies = false,
  interruptOnMouseDown = false,
}: {
  withMessageInput?: boolean;
  withAnchorDebug?: boolean;
  resizable?: boolean;
  withHistoryInsertion?: boolean;
  automaticReplies?: boolean;
  interruptOnMouseDown?: boolean;
}) {
  const [chatItems, setChatItems] = useState<ChatListItem[]>(messages);
  const [threshold, setThreshold] = useState(2);
  const [animationSpeed, setAnimationSpeed] = useState(1);
  const [debugBubbles, setDebugBubbles] = useState(false);
  const [debugReadingAnchor, setDebugReadingAnchor] = useState(false);
  const [scrollState, setScrollState] = useState<ChatScrollState>();
  const [draft, setDraft] = useState('');
  const [sendAfterLayout, setSendAfterLayout] = useState(false);
  const [incomingTyping, setIncomingTyping] = useState(false);
  const chatRef = useRef<ChatScrollContainerHandle>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const { bottomSpace, preserveOnReset } = useChatComposerSpace(composerRef, 12);
  const nextMessageId = useRef(messages.length + 1);
  const hasSent = useRef(false);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingReplies = useRef<DemoReplyPlan[]>([]);
  const depart = useChatSendFlight(hostRef, chatItems, animationSpeed);

  useEffect(
    () => () => {
      clearTimeout(replyTimer.current);
      pendingReplies.current = [];
    },
    []
  );

  useLayoutEffect(() => {
    if (!sendAfterLayout) return;
    // The textarea resizes in its layout effect. Let ResizeObserver deliver
    // composer clearance and bottom-position updates before submitting.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => composerRef.current?.requestSubmit());
    });
    return () => cancelAnimationFrame(frame);
  }, [sendAfterLayout]);

  function sendMessage(variant: ChatMessage['variant'], content: string) {
    const id = `message-${nextMessageId.current++}`;
    const entrance = withMessageInput && variant === 'outgoing' ? 'flight' : 'fade';
    if (entrance === 'flight') depart(id);
    const insertDate = automaticReplies && variant === 'outgoing' && !hasSent.current;
    if (variant === 'outgoing') hasSent.current = true;
    const date: ChatListItem[] = insertDate
      ? [
          {
            id: `date-${id}`,
            kind: 'date',
            dateTime: new Date().toISOString(),
            label: 'Today',
          },
        ]
      : [];
    setChatItems((previous) => [...previous, ...date, { id, variant, content, entrance }]);
  }

  function startReplyBatch() {
    const plan = pendingReplies.current[0]!;
    // Reply plans keep both content and real-time delays reproducible at any playback speed.
    const receive = (index: number) => {
      setIncomingTyping(false);
      sendMessage('incoming', plan.replies[index]!);
      if (index + 1 < plan.replies.length) {
        const delay = plan.delays[index + 1]!;
        if (plan.status?.beforeReply === index + 1) {
          const status = plan.status;
          replyTimer.current = setTimeout(() => {
            const id = `status-${nextMessageId.current++}`;
            setChatItems((previous) => [
              ...previous,
              {
                id,
                kind: 'status',
                content: status.label,
              },
            ]);
            replyTimer.current = setTimeout(() => receive(index + 1), delay / 2);
          }, delay / 2);
        } else {
          replyTimer.current = setTimeout(() => receive(index + 1), delay);
        }
      } else {
        pendingReplies.current.shift();
        if (pendingReplies.current.length > 0) startReplyBatch();
      }
    };
    replyTimer.current = setTimeout(() => {
      setIncomingTyping(true);
      replyTimer.current = setTimeout(() => receive(0), plan.delays[0]);
    }, 600);
  }

  function appendMessage(variant: ChatMessage['variant']) {
    // In every story with a composer, the Send a message button appends a short
    // sentence of at most 10 words. Receive and history-insertion samples stay independent.
    const options = withMessageInput && variant === 'outgoing' ? composerMessageOptions : messageOptions[variant];
    const content = options[Math.floor(Math.random() * options.length)]!;
    if (withMessageInput && variant === 'outgoing') {
      setDraft(content);
      setSendAfterLayout(true);
      return;
    }
    sendMessage(variant, content);
  }

  function insertInHistory(variant: ChatMessage['variant']) {
    const id = `message-${nextMessageId.current++}`;
    const message: ChatMessage = {
      id,
      variant,
      entrance: 'fade',
      scrollToBottom: false,
      content: 'A note inserted before the last message.\nThe surrounding conversation keeps its place.',
    };
    setChatItems((previous) => {
      const index = Math.max(0, previous.length - 1);
      return [...previous.slice(0, index), message, ...previous.slice(index)];
    });
  }

  function insertNearFirstVisibleMessage(placement: 'before' | 'after') {
    const viewport = hostRef.current?.querySelector<HTMLElement>('[data-slot="chat-scroll-viewport"]');
    if (!viewport) return;
    const top = viewport.getBoundingClientRect().top;
    const first = Array.from(viewport.querySelectorAll<HTMLElement>('[data-message-id]')).find(
      (body) => body.getBoundingClientRect().bottom > top
    );
    if (!first) return;
    const message: ChatMessage = {
      id: `message-${nextMessageId.current++}`,
      variant: 'incoming',
      entrance: 'fade',
      scrollToBottom: false,
      content: `A note just ${placement} the first visible message.`,
    };
    setChatItems((previous) => {
      const firstIndex = previous.findIndex((item) => item.id === first.dataset.messageId);
      const index = firstIndex + (placement === 'after' ? 1 : 0);
      return [...previous.slice(0, index), message, ...previous.slice(index)];
    });
  }

  const chat = (
    <div ref={hostRef} className="relative grid min-h-0 min-w-0 flex-1 rounded-lg">
      <ChatScrollContainer
        ref={chatRef}
        items={chatItems}
        debugBubbles={debugBubbles}
        debugReadingAnchor={debugReadingAnchor}
        incomingTyping={withMessageInput && incomingTyping}
        bottomThreshold={threshold}
        animationSpeed={animationSpeed}
        interruptOnMouseDown={interruptOnMouseDown}
        onScrollStateChange={automaticReplies ? undefined : setScrollState}
        className="col-start-1 row-start-1"
        bottomSpace={withMessageInput ? bottomSpace : undefined}
      />
      {withMessageInput && (
        <form
          ref={composerRef}
          aria-label="Compose message"
          className="pointer-events-none z-10 col-start-1 row-start-1 flex min-w-0 self-end p-3"
          onSubmit={(event) => {
            event.preventDefault();
            setSendAfterLayout(false);
            if (!draft.trim()) return;
            preserveOnReset();
            sendMessage('outgoing', draft);
            setDraft('');
            if (automaticReplies) {
              pendingReplies.current.push(createDemoReplyPlan(draft));
              if (pendingReplies.current.length === 1) startReplyBatch();
            }
          }}
        >
          <MessageInput
            className="pointer-events-auto flex-1"
            value={draft}
            onChange={(event) => {
              setSendAfterLayout(false);
              setDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
        </form>
      )}
    </div>
  );
  const controls = automaticReplies ? (
    <div className="flex shrink-0 flex-wrap items-center justify-center gap-3">
      <fieldset aria-label="Animation speed" className="m-0 flex shrink-0 justify-center border-0 p-0">
        <Segmented
          options={[0.25, 1].map((speed) => ({ value: speed, label: `${speed}×` }))}
          value={animationSpeed}
          onChange={setAnimationSpeed}
        />
      </fieldset>
      <BubbleDebugToggle value={debugBubbles} onChange={setDebugBubbles} />
    </div>
  ) : (
    <>
      <div className="flex shrink-0 flex-col items-center gap-2">
        {withAnchorDebug && (
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={() => insertNearFirstVisibleMessage('before')}>
              Insert incoming before first visible message
            </Button>
            <Button type="button" onClick={() => insertNearFirstVisibleMessage('after')}>
              Insert incoming after first visible message
            </Button>
          </div>
        )}
        {withMessageInput && (
          <Button type="button" onClick={() => chatRef.current?.scrollToBottom()}>
            Scroll to bottom
          </Button>
        )}
        {withHistoryInsertion && (
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={() => insertInHistory('incoming')}>
              Insert incoming in history
            </Button>
            <Button type="button" onClick={() => insertInHistory('outgoing')}>
              Insert outgoing in history
            </Button>
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={() => appendMessage('incoming')}>
            Receive a message
          </Button>
          <Button type="button" disabled={sendAfterLayout} onClick={() => appendMessage('outgoing')}>
            Send a message
          </Button>
        </div>
        {withMessageInput && (
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              onClick={() => {
                setIncomingTyping(false);
                appendMessage('incoming');
              }}
            >
              Receive a message and turn typing off
            </Button>
            <Button
              type="button"
              aria-pressed={incomingTyping}
              allPossibleContents={['Typing on', 'Typing off']}
              onClick={() => setIncomingTyping((previous) => !previous)}
            >
              {incomingTyping ? 'Typing on' : 'Typing off'}
            </Button>
          </div>
        )}
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
        <fieldset
          aria-label="Animation speed"
          className="m-0 flex min-w-0 flex-wrap items-center justify-between gap-2 border-0 p-0"
        >
          <span>Animation speed</span>
          <Segmented
            options={[0.1, 0.25, 0.5, 0.75, 1].map((speed) => ({ value: speed, label: `${speed}×` }))}
            value={animationSpeed}
            onChange={setAnimationSpeed}
          />
        </fieldset>
        <BubbleDebugToggle value={debugBubbles} onChange={setDebugBubbles} />
        {withAnchorDebug && (
          <label
            className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400"
            title="Reading anchor candidate; used for position compensation while detached."
          >
            <input
              type="checkbox"
              checked={debugReadingAnchor}
              onChange={(event) => setDebugReadingAnchor(event.target.checked)}
            />
            Show anchor element
          </label>
        )}
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
    </>
  );

  if (resizable) {
    return (
      <div className="flex flex-col items-start gap-3">
        <ResizableWindow>
          <div className="flex size-full flex-col">{chat}</div>
        </ResizableWindow>
        <section
          aria-label="Chat controls"
          className="flex w-[480px] shrink-0 flex-col gap-3 rounded-xl border border-neutral-500/30 p-3"
        >
          {controls}
        </section>
      </div>
    );
  }

  return (
    <div className="flex size-full flex-col gap-3">
      {chat}
      {controls}
    </div>
  );
}

export const SendMessages: Story = {
  parameters: { controls: { disable: true } },
  render: () => <ChatDemo />,
};

export const WithMessageInput: Story = {
  parameters: { controls: { disable: true } },
  render: () => <ChatDemo withMessageInput />,
};

/** Reuses the composer demo so resize can be inspected during any chat transition. */
export const ResizableMessageInput: Story = {
  parameters: { controls: { disable: true }, resizableWindow: true },
  render: () => <ChatDemo withMessageInput withAnchorDebug resizable />,
};

/** Opt-in policy: a mouse press in the message viewport immediately yields follow and flight. */
export const InterruptOnMouseDown: Story = {
  name: 'Detach Following State On Mouse Down',
  parameters: { controls: { disable: true } },
  render: () => <ChatDemo withMessageInput interruptOnMouseDown />,
};

export const InsertInHistory: Story = {
  parameters: { controls: { disable: true } },
  render: () => <ChatDemo withMessageInput withHistoryInsertion />,
};

export const AutomaticReplies: Story = {
  parameters: { controls: { disable: true } },
  render: () => <ChatDemo withMessageInput automaticReplies />,
};

function HappyPathGuide() {
  return (
    <aside
      aria-label="Happy path guide"
      className="flex min-w-0 flex-col gap-4 text-xs leading-5 text-neutral-500 dark:text-neutral-400"
    >
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-sm font-medium text-neutral-900 dark:text-neutral-100">Happy path</h2>
        <p className="m-0">
          Send these in order. Wait for each reply batch before continuing. Paste the list or use Shift+Enter for line
          breaks.
        </p>
      </div>
      <ol className="m-0 flex list-none flex-col gap-4 p-0">
        {demoConversation.map((step, index) => (
          <li key={step.input} className="flex flex-col gap-1">
            <span className="font-medium text-neutral-700 dark:text-neutral-200">{index + 1}. You send</span>
            <pre className="m-0 whitespace-pre-wrap break-words font-mono text-neutral-900 dark:text-neutral-100">
              {step.input}
            </pre>
            {index === 0 && <p className="m-0 italic">Today appears before your first message.</p>}
            <div className="flex flex-col gap-1">
              {step.replies.map((reply, replyIndex) => (
                <div key={reply} className="flex flex-col gap-1">
                  {step.status?.beforeReply === replyIndex && <p className="m-0 italic">Status: {step.status.label}</p>}
                  <p className="m-0">Reply: {reply}</p>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <p className="m-0">
        Typing starts after 0.6s. Replies arrive 0.8–1.2s apart. Playback speed changes motion only.
      </p>
    </aside>
  );
}

/** The same automatic chat, with a reading guide sourced from its actual reply presets. */
export const AutomaticRepliesWithGuide: Story = {
  parameters: { controls: { disable: true }, happyPathGuide: true },
  render: () => (
    <>
      <div className="h-[min(640px,calc(100svh-64px))] min-w-0">
        <ChatDemo withMessageInput automaticReplies />
      </div>
      <HappyPathGuide />
    </>
  ),
};

function MixedItemsDemo() {
  const [items, setItems] = useState<ChatListItem[]>([
    ...messages.slice(-12, -1),
    { ...messages.at(-1)!, variant: 'incoming' },
  ]);
  const [animationSpeed, setAnimationSpeed] = useState(0.25);
  const [debugBubbles, setDebugBubbles] = useState(false);
  const sequence = useRef(0);

  function insertDate() {
    const id = `date-${++sequence.current}`;
    setItems((previous) => [
      ...previous.slice(0, -1),
      {
        id,
        kind: 'date',
        dateTime: '2026-09-15',
        label: 'Tuesday, September 15',
      },
      previous.at(-1)!,
    ]);
  }

  function appendContent() {
    const id = `notice-${++sequence.current}`;
    setItems((previous) => [
      ...previous,
      {
        id,
        kind: 'content',
        content: (
          <p className="m-0 text-center text-xs text-neutral-500 dark:text-neutral-400">You are all caught up.</p>
        ),
      },
    ]);
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <ChatScrollContainer
        items={items}
        debugBubbles={debugBubbles}
        animationSpeed={animationSpeed}
        className="min-h-0 flex-1"
      />
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={insertDate}>Insert date before last item</Button>
        <Button onClick={appendContent}>Append notice</Button>
        <BubbleDebugToggle value={debugBubbles} onChange={setDebugBubbles} />
      </div>
      <fieldset aria-label="Animation speed" className="m-0 flex justify-center border-0 p-0">
        <Segmented
          options={[0.25, 1].map((value) => ({ value, label: `${value}×` }))}
          value={animationSpeed}
          onChange={setAnimationSpeed}
        />
      </fieldset>
    </div>
  );
}

export const MixedItems: Story = {
  parameters: { controls: { disable: true } },
  render: () => <MixedItemsDemo />,
};
