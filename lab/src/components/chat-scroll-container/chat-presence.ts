import { toSpringPhysics } from '@monorepo/utils';
import { animate, cancelFrame, frame } from 'motion/react';

import { cloneWithoutChatDebug, registerChatDebugVisual } from './chat-item-debug.js';

export const chatPresenceSpring = {
  type: 'spring',
  ...toSpringPhysics({ angularFrequency: 22, dampingRatio: 1 }),
  restDelta: 0.001,
  restSpeed: 0.01,
} as const;

export const chatEnterSpring = {
  ...chatPresenceSpring,
  ...toSpringPhysics({ angularFrequency: 26, dampingRatio: 1 }),
} as const;

export const chatLayoutSpring = {
  ...chatPresenceSpring,
  ...toSpringPhysics({ angularFrequency: 28, dampingRatio: 1 }),
} as const;

export const chatEnterOffset = 20;
export const chatExitOffset = 10;

/** The visual is outside the expanding row, so layout never clips or scales its text. */
export function animateChatEntrance(
  element: HTMLElement,
  speed: number,
  onComplete: () => void,
  { fadeOnly = false } = {}
) {
  const host = element.closest<HTMLElement>('[data-slot="chat-scroll-container"]')!;
  const layer = document.createElement('div');
  layer.dataset.slot = 'chat-entrance-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.inert = true;
  const visual = cloneWithoutChatDebug(element);
  visual.removeAttribute('data-message-id');
  visual.removeAttribute('data-chat-item-id');
  visual.removeAttribute('id');
  visual.dataset.chatEntrance = '';
  visual.style.marginTop = '0px';
  layer.append(visual);
  host.append(layer);
  const visibility = element.style.visibility;
  element.style.visibility = 'hidden';
  let done = false;
  let stopped = false;
  const unregisterDebug = registerChatDebugVisual(
    element.closest<HTMLElement>('[data-slot="chat-scroll-viewport"]')!,
    element,
    { element: visual, phase: () => (done ? 'handoff' : fadeOnly ? 'crossfading' : 'entering') }
  );
  const position = () => {
    if (!element.isConnected || (done && !element.parentElement?.hasAttribute('data-chat-inserting'))) {
      stop();
      return;
    }
    const rect = element.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    visual.toggleAttribute('data-tail', element.hasAttribute('data-tail'));
    Object.assign(visual.style, {
      left: `${rect.left - hostRect.left - host.clientLeft}px`,
      top: `${rect.top - hostRect.top - host.clientTop}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  };
  const paint = (progress: number) => {
    visual.style.opacity = String(progress);
    visual.style.transform = `translateY(${(fadeOnly ? 0 : chatEnterOffset) * (1 - progress)}px)`;
  };
  paint(0);
  position();
  frame.render(position, true);
  const animation = animate(0, 1, {
    ...chatEnterSpring,
    onUpdate: paint,
    onComplete: () => {
      done = true;
    },
  });
  animation.speed = speed;
  function stop() {
    if (stopped) return;
    stopped = true;
    animation.stop();
    cancelFrame(position);
    element.style.visibility = visibility;
    unregisterDebug();
    layer.remove();
    onComplete();
  }
  return {
    get speed() {
      return animation.speed;
    },
    set speed(value: number) {
      animation.speed = value;
    },
    stop,
    complete: stop,
    sync: position,
  };
}
