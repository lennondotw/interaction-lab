import { toSpringPhysics } from '@monorepo/utils';
import { animate, calcGeneratorDuration, motionValue, spring } from 'motion/react';
import { useLayoutEffect, useRef, type RefObject } from 'react';

import { cloneWithoutChatDebug, registerChatDebugVisual } from '../chat-scroll-container/chat-item-debug.js';
import { hasChatLayoutAnimation, projectedChatY } from '../chat-scroll-container/chat-layout.js';
import { scrollAnchorInterrupted } from '../scroll-anchor/scroll-anchor-controller.js';

import styles from './chat-send-flight.module.css';

export const chatSendFlightSpring = toSpringPhysics({ angularFrequency: 18, dampingRatio: 0.8 });
export const chatSendFlightLag = 100;
const springOptions = { ...chatSendFlightSpring, keyframes: [0, 1] };
const destinationSpring = {
  type: 'spring',
  ...toSpringPhysics({ angularFrequency: 22, dampingRatio: 1 }),
  restDelta: 0.1,
  restSpeed: 1,
} as const;
export const chatSendFlightDuration = calcGeneratorDuration(spring(springOptions)) + chatSendFlightLag;

interface Flight {
  stop: () => void;
  setSpeed: (speed: number) => void;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  corners: number[];
}

function readBox(element: HTMLElement): Box {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    width: rect.width,
    height: rect.height,
    corners: [
      style.borderTopLeftRadius,
      style.borderTopRightRadius,
      style.borderBottomRightRadius,
      style.borderBottomLeftRadius,
    ].map(Number.parseFloat),
  };
}

const mix = (from: number, to: number, progress: number) => from + (to - from) * progress;

/** A visual copy stays outside the scroller; the hidden original remains the live layout anchor. */
function startFlight(
  host: HTMLElement,
  target: HTMLElement,
  from: Box,
  speed: number,
  finished: (flight: Flight) => void
) {
  const viewport = target.closest<HTMLElement>('[data-slot="chat-scroll-viewport"]')!;
  const remainingScroll = () => Math.max(0, viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop);
  const originalVisibility = target.style.visibility;
  const layer = document.createElement('div');
  layer.dataset.slot = 'chat-send-flight-layer';
  layer.className = styles.layer!;
  layer.setAttribute('aria-hidden', 'true');
  layer.inert = true;
  const carrier = cloneWithoutChatDebug(target);
  carrier.removeAttribute('id');
  carrier.style.margin = '0';
  carrier.dataset.chatSendFlight = '';
  carrier.classList.add(styles.carrier!);
  const content = carrier.querySelector<HTMLElement>('[data-slot="message-bubble-content"]')!;
  const targetContent = target.querySelector<HTMLElement>('[data-slot="message-bubble-content"]')!;
  // Final bubble wrapping may need more lines than the wider composer. Clip
  // counter-scaled text to the moving body without clipping the separate tail.
  const contentClip = document.createElement('div');
  contentClip.dataset.slot = 'chat-send-flight-clip';
  contentClip.className = styles.clip!;
  content.classList.add(styles.clippedContent!);
  contentClip.append(content);
  carrier.append(contentClip);
  layer.append(carrier);
  host.append(layer);
  target.style.visibility = 'hidden';
  const generator = spring(springOptions);
  const initialTarget = readBox(target);
  const initialText = targetContent.getBoundingClientRect();
  // Start at the normal bubble inset within the composer box. Express that
  // position relative to its center, keeping the final text wrapping width.
  const initialTextOffset =
    -from.width / 2 + initialText.left - (initialTarget.x - initialTarget.width / 2) + initialText.width / 2;
  const initialDestinationY = projectedChatY(viewport, target, readBox(target).y);
  const destinationOffset = motionValue(0);
  let destinationOffsetTarget = 0;
  let playbackSpeed = speed;
  let offsetAnimation: ReturnType<typeof animate> | undefined;
  let stopped = false;
  let arrivalFrame = 0;
  let arriving = false;
  const unregisterDebug = registerChatDebugVisual(viewport, target, {
    element: carrier,
    phase: () => (arriving ? 'handoff' : 'flying'),
  });
  let animation: ReturnType<typeof animate> | undefined;
  const flight: Flight = {
    stop,
    setSpeed: (nextSpeed) => {
      playbackSpeed = nextSpeed;
      if (animation) animation.speed = nextSpeed;
      if (offsetAnimation) offsetAnimation.speed = nextSpeed;
    },
  };

  function stop() {
    if (stopped) return;
    stopped = true;
    animation?.stop();
    destinationOffset.destroy();
    cancelAnimationFrame(arrivalFrame);
    target.style.visibility = originalVisibility;
    unregisterDebug();
    layer.remove();
    finished(flight);
  }

  function paint(elapsed: number) {
    if (!target.isConnected) {
      stop();
      return false;
    }
    // Project the real layout anchor to the bottom scroll position. Re-evaluate
    // clearance and later messages, but subtract scrolling that hasn't happened yet.
    const to = readBox(target);
    const destinationY = projectedChatY(viewport, target, to.y);
    const nextOffsetTarget = destinationY - initialDestinationY;
    if (Math.abs(nextOffsetTarget - destinationOffsetTarget) > 0.01) {
      destinationOffsetTarget = nextOffsetTarget;
      // Only subsequent layout displacement follows a new target. The original
      // flight clock and shape stay uninterrupted, even during a burst of sends.
      offsetAnimation = animate(destinationOffset, destinationOffsetTarget, {
        ...destinationSpring,
        velocity: destinationOffset.getVelocity() / playbackSpeed,
      });
      offsetAnimation.speed = playbackSpeed;
    }
    const textRect = targetContent.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    if (!to.width || !to.height) {
      stop();
      return false;
    }
    // Motion reuses its result object: copy .value before the second sample.
    const horizontal = generator.next(elapsed).value;
    const vertical = generator.next(Math.max(0, elapsed - chatSendFlightLag)).value;
    const scaleX = mix(from.width, to.width, horizontal) / to.width;
    const scaleY = mix(from.height, to.height, vertical) / to.height;
    const x = mix(from.x, to.x, horizontal) - to.x;
    const y = mix(from.y, initialDestinationY, vertical) + destinationOffset.get() - destinationY;
    const corners = from.corners.map((radius, index) => mix(radius, to.corners[index]!, horizontal));
    Object.assign(carrier.style, {
      left: `${to.x - hostRect.x - to.width / 2}px`,
      top: `${destinationY - hostRect.y - to.height / 2}px`,
      width: `${to.width}px`,
      height: `${to.height}px`,
      transform: `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`,
      borderRadius: `${corners.map((radius) => `${radius / scaleX}px`).join(' ')} / ${corners.map((radius) => `${radius / scaleY}px`).join(' ')}`,
    });
    // Debug children share the carrier's transform but retain their natural text size.
    carrier.style.setProperty('--chat-debug-scale-x', String(1 / scaleX));
    carrier.style.setProperty('--chat-debug-scale-y', String(1 / scaleY));
    carrier.toggleAttribute('data-tail', target.hasAttribute('data-tail'));
    carrier.style.setProperty(
      '--message-bubble-tail-opacity',
      String(Math.max(0, Math.min(1, (vertical - 0.55) / 0.45)))
    );
    // Shared spring progress keeps text and body motion synchronized. The linear
    // factor preserves an approximately constant early inset; the fourth power
    // delays centering until later. Weight and slope reach zero at q=1, so text
    // shares the body's overshoot with continuous position and velocity.
    // See chat-scroll-container/README.md: Text placement during flight.
    const q = Math.max(0, Math.min(1, horizontal));
    const offsetDecay = (1 - q) * (1 - q ** 4);
    const targetTextOffset = textRect.left + textRect.width / 2 - to.x;
    const textOffset = mix(targetTextOffset, initialTextOffset, offsetDecay);
    Object.assign(content.style, {
      // Convert the visual center offset to local top-left coordinates, then
      // counter-scale text and insets so glyphs retain their natural dimensions.
      left: `${to.width / 2 + (textOffset - textRect.width / 2) / scaleX}px`,
      // Keep the first line at the visual top inset; reveal extra wrapped lines
      // below it as the body grows. Horizontal centering does not affect this.
      top: `${(textRect.top - (to.y - to.height / 2)) / scaleY}px`,
      width: `${textRect.width}px`,
      height: `${textRect.height}px`,
      transform: `scale(${1 / scaleX}, ${1 / scaleY})`,
    });
    return true;
  }

  function arrive() {
    arriving = true;
    if (!paint(chatSendFlightDuration)) return;
    // Shape finishes on its original clock. Keep only the placement compensation
    // alive until both it and the real row arrive, then hand off within one CSS pixel.
    const handoffDistance = Math.abs(carrier.getBoundingClientRect().top - target.getBoundingClientRect().top);
    if (
      remainingScroll() <= 1 &&
      !hasChatLayoutAnimation(viewport) &&
      !destinationOffset.isAnimating() &&
      handoffDistance <= 1
    )
      stop();
    else arrivalFrame = requestAnimationFrame(arrive);
  }

  // Show the measured departure box before the first paint, without waiting for Motion's first tick.
  if (paint(0)) {
    animation = animate(0, chatSendFlightDuration, {
      duration: chatSendFlightDuration / 1000,
      ease: 'linear',
      onUpdate: (elapsed) => {
        paint(elapsed);
      },
      onComplete: arrive,
    });
    flight.setSpeed(speed);
    return flight;
  }
  return undefined;
}

/** Capture before clearing the draft; consume after the matching message is committed. */
export function useChatSendFlight(
  hostRef: RefObject<HTMLElement | null>,
  messages: readonly { id: string }[],
  animationSpeed = 1
) {
  const departures = useRef(new Map<string, Box>());
  const active = useRef(new Set<Flight>());

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const viewport = host.querySelector('[data-slot="chat-scroll-viewport"]');
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const cancel = () => {
      for (const flight of active.current) flight.stop();
      departures.current.clear();
    };
    const preferenceChanged = () => {
      if (preference.matches) cancel();
    };
    viewport?.addEventListener(scrollAnchorInterrupted, cancel);
    preference.addEventListener('change', preferenceChanged);
    return () => {
      cancel();
      viewport?.removeEventListener(scrollAnchorInterrupted, cancel);
      preference.removeEventListener('change', preferenceChanged);
    };
  }, [hostRef]);

  useLayoutEffect(() => {
    for (const flight of active.current) flight.setSpeed(animationSpeed);
  }, [animationSpeed]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || departures.current.size === 0) return;
    const targets = host.querySelectorAll<HTMLElement>('[data-slot="chat-scroll-viewport"] [data-message-id]');
    for (const target of targets) {
      const id = target.dataset.messageId!;
      const from = departures.current.get(id);
      if (!from) continue;
      departures.current.delete(id);
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) continue;
      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const flight = startFlight(host, target, from, animationSpeed, (completed) => active.current.delete(completed));
      if (flight) active.current.add(flight);
    }
    // A departure only belongs to this local append, not to a future remount.
    departures.current.clear();
  }, [hostRef, messages, animationSpeed]);

  return (id: string) => {
    const host = hostRef.current;
    const source = host?.querySelector<HTMLElement>('[data-slot="message-input"]');
    const viewport = host?.querySelector<HTMLElement>('[data-slot="chat-scroll-viewport"]');
    if (!source || !viewport || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const from = readBox(source);
    if (from.width > 0 && from.height > 0) departures.current.set(id, from);
  };
}
