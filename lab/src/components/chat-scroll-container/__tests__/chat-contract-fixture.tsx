import { cancelFrame, frame } from 'motion/react';
import { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import { useChatSendFlight } from '../../chat-send-flight/chat-send-flight.js';
import { MessageInput } from '../../message-input/index.js';
import { ChatScrollContainer, type ChatListItem, type ChatScrollState } from '../chat-scroll-container.js';

interface Model {
  items: ChatListItem[];
  typing: boolean;
  speed: number;
  draft: string;
  interruptOnMouseDown: boolean;
  threshold: number;
  debugBubbles: boolean;
}

/** Browser-only fixture: commit arbitrary item/typing changes atomically, using the real components. */
export function mountChatContractFixture() {
  const element = document.createElement('div');
  element.dataset.chatContractFixture = '';
  Object.assign(element.style, { position: 'fixed', inset: '0', zIndex: '10000', background: '#1e1e1e' });
  document.body.append(element);
  const root = createRoot(element);
  const states: ChatScrollState[] = [];
  let model: Model;
  let update: (next: Partial<Model>) => void;
  let capture: (id: string) => void;
  function Fixture() {
    const [value, setValue] = useState<Model>({
      items: Array.from({ length: 30 }, (_, index) => ({
        id: `seed-${index}`,
        variant: 'incoming',
        content: 'A quiet afternoon.',
      })),
      typing: false,
      speed: 0.25,
      draft: '1',
      interruptOnMouseDown: false,
      threshold: 20,
      debugBubbles: false,
    });
    const host = useRef<HTMLDivElement>(null);
    const depart = useChatSendFlight(host, value.items, value.speed);
    useLayoutEffect(() => {
      model = value;
      update = (next) => flushSync(() => setValue((current) => ({ ...current, ...next })));
      capture = depart;
    });
    return (
      <div
        ref={host}
        style={{ position: 'relative', margin: 32, display: 'flex', height: 400, width: 480, flexDirection: 'column' }}
      >
        <ChatScrollContainer
          items={value.items}
          debugBubbles={value.debugBubbles}
          incomingTyping={value.typing}
          animationSpeed={value.speed}
          bottomThreshold={value.threshold}
          interruptOnMouseDown={value.interruptOnMouseDown}
          onScrollStateChange={(state) => states.push(state)}
          className="min-h-0 flex-1"
        />
        <MessageInput
          value={value.draft}
          onChange={(event) => setValue((current) => ({ ...current, draft: event.target.value }))}
        />
      </div>
    );
  }
  flushSync(() => root.render(<Fixture />));
  return {
    element,
    states,
    get model() {
      return model;
    },
    update(next: Partial<Model>) {
      update(next);
    },
    capture(id: string) {
      capture(id);
    },
    send(id: string) {
      capture(id);
      update({ items: [...model.items, { id, variant: 'outgoing', content: '1', entrance: 'flight' }] });
    },
    unmount() {
      flushSync(() => root.unmount());
      element.remove();
    },
  };
}

/** Compare a handoff at one animation timestamp, not a stale click-time paint. */
export function commitChatFrame(action: () => void) {
  return new Promise<void>((resolve) => {
    frame.postRender(() => {
      flushSync(action);
      resolve();
    });
  });
}

/** Sample painted geometry with the timestamp that produced it, not observer delivery time. */
export function observeChatFrames(sample: (timestamp: number) => void) {
  const read = ({ timestamp }: { timestamp: number }) => sample(timestamp);
  frame.postRender(read, true);
  return () => cancelFrame(read);
}
