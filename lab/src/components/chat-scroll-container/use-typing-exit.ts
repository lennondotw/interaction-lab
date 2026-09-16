import { animate, useMotionValue } from 'motion/react';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import { registerChatDebugVisual } from './chat-item-debug.js';
import { readChatItemGap } from './chat-items.js';
import { registerChatTransition, type ChatLayoutEntry } from './chat-layout.js';
import {
  chatEnterOffset,
  chatEnterSpring,
  chatExitOffset,
  chatLayoutSpring,
  chatPresenceSpring,
} from './chat-presence.js';

/** Settled typing owns its layout; entry and exit use a measured temporary slot. */
export function useTypingExit(
  visible: boolean,
  animationSpeed: number,
  reducedMotion: boolean,
  onLayoutChange: () => void
) {
  const [present, setPresent] = useState(visible);
  const [geometry, setGeometry] = useState<{
    height: number;
    gap: number;
    entry?: boolean;
    replacement?: HTMLElement;
  } | null>(null);
  const replacing = Boolean(geometry?.replacement);
  const rowRef = useRef<HTMLLIElement>(null);
  const progress = useMotionValue(0);
  const opacity = useMotionValue(0);
  const offset = useMotionValue(chatEnterOffset);
  const animationRef = useRef<ReturnType<typeof animate> | null>(null);
  const releaseLayoutRef = useRef<(() => void) | null>(null);
  const visualAnimations = useRef<ReturnType<typeof animate>[]>([]);
  const speedRef = useRef(animationSpeed);
  const entryRequested = useRef(false);
  const preparingEntry = visible && (replacing || (!geometry && (!present || entryRequested.current)));
  const replaceWith = useCallback(
    (replacement: HTMLElement) => {
      // Transfer the running footprint before the new slot starts. Release its
      // old projected height in this same commit so scrolling sees one owner.
      const velocity = geometry ? -geometry.height * progress.getVelocity() : 0;
      animationRef.current?.stop();
      releaseLayoutRef.current?.();
      for (const animation of visualAnimations.current) animation.stop();
      progress.jump(0);
      // A partially entered indicator still has an offset. Freeze it for the
      // crossfade instead of snapping it to zero or adding an exit translation.
      offset.jump(offset.get());
      setGeometry({ height: 0, gap: 0, replacement });
      return { velocity };
    },
    [geometry, progress, offset]
  );

  useLayoutEffect(() => {
    speedRef.current = animationSpeed;
    if (animationRef.current) animationRef.current.speed = animationSpeed;
    for (const animation of visualAnimations.current) animation.speed = animationSpeed;
  }, [animationSpeed]);

  useLayoutEffect(() => {
    if (visible && (!present || replacing)) {
      entryRequested.current = !reducedMotion;
      opacity.jump(0);
      offset.jump(chatEnterOffset);
      progress.jump(1);
      setGeometry(null);
      setPresent(true);
    } else if (visible && present && !geometry && entryRequested.current) {
      const row = rowRef.current;
      if (!row) return;
      const gap = readChatItemGap(row);
      setGeometry({ height: row.getBoundingClientRect().height, gap, entry: true });
    } else if (!visible && present && !geometry) {
      entryRequested.current = false;
      const row = rowRef.current;
      if (!row) return;
      if (reducedMotion) {
        setPresent(false);
        return;
      }
      const gap = readChatItemGap(row);
      progress.jump(0);
      setGeometry({ height: row.getBoundingClientRect().height, gap });
    }
  }, [visible, present, geometry, replacing, reducedMotion, progress, opacity, offset]);

  useLayoutEffect(() => {
    const visual = rowRef.current?.querySelector<HTMLElement>('[data-slot="typing-bubble"]');
    if (!present || !visual) return;
    const unregisterDebug = registerChatDebugVisual(
      visual.closest<HTMLElement>('[data-slot="chat-scroll-viewport"]')!,
      visual,
      {
        element: visual,
        phase: () =>
          replacing
            ? 'replacing'
            : opacity.isAnimating() || offset.isAnimating()
              ? visible
                ? 'entering'
                : 'exiting'
              : 'idle',
      }
    );
    const paintOpacity = (value: number) => {
      visual.style.opacity = String(Math.max(0, Math.min(1, value)));
    };
    const paintOffset = (value: number) => {
      visual.style.transform = `translateY(${value}px)`;
    };
    if (reducedMotion) {
      opacity.jump(visible ? 1 : 0);
      offset.jump(visible || replacing ? 0 : chatExitOffset);
      paintOpacity(opacity.get());
      paintOffset(offset.get());
      return unregisterDebug;
    }

    // Separate visual values preserve their position and velocity if entry is
    // interrupted by exit (or exit by entry), without resetting the height spring.
    paintOpacity(opacity.get());
    paintOffset(offset.get());
    const visualSpring = visible ? chatEnterSpring : chatPresenceSpring;
    const animations = [
      animate(opacity, visible ? 1 : 0, {
        ...visualSpring,
        velocity: opacity.getVelocity() / speedRef.current,
        onUpdate: paintOpacity,
      }),
      ...(!visible && replacing
        ? []
        : [
            animate(offset, visible ? 0 : chatExitOffset, {
              ...visualSpring,
              velocity: offset.getVelocity() / speedRef.current,
              onUpdate: paintOffset,
            }),
          ]),
    ];
    for (const animation of animations) animation.speed = speedRef.current;
    visualAnimations.current = animations;
    return () => {
      for (const animation of animations) animation.stop();
      visualAnimations.current = [];
      unregisterDebug();
    };
  }, [visible, present, replacing, reducedMotion, opacity, offset]);

  useLayoutEffect(() => {
    if (!geometry) return;
    const row = rowRef.current;
    if (!row) return;
    const viewport = row.closest<HTMLElement>('[data-slot="chat-scroll-viewport"]')!;
    const layout: ChatLayoutEntry = { row, remaining: 0, gapRemaining: 0 };
    const unregister = geometry.entry ? registerChatTransition(viewport, layout) : () => {};
    releaseLayoutRef.current = unregister;

    const paint = (value: number) => {
      const remaining = 1 - Math.max(0, Math.min(1, value));
      row.style.height = `${geometry.height * remaining}px`;
      layout.remaining = visible
        ? geometry.height - row.getBoundingClientRect().height
        : -row.getBoundingClientRect().height;
      // Entry and exit keep the declared top inset. Slot height only changes
      // spacing; the independent visual offset supplies the entrance/exit motion.
      if (geometry.replacement?.isConnected) {
        const visual = row.querySelector<HTMLElement>('[data-slot="typing-bubble"]')!;
        visual.style.top = `${geometry.replacement.getBoundingClientRect().top - row.getBoundingClientRect().top}px`;
      }
      // Record the new geometry before native scroll events can mistake the
      // browser's shrinking-range clamp for an upward user gesture.
      onLayoutChange();
      if (geometry.entry) entryRequested.current = false;
    };
    const finish = () => {
      setPresent(visible);
      setGeometry(null);
      unregister();
    };

    if (reducedMotion) {
      paint(visible ? 0 : 1);
      finish();
      return;
    }

    paint(progress.get());
    const animation = animate(progress, visible ? 0 : 1, {
      ...chatLayoutSpring,
      velocity: progress.getVelocity() / speedRef.current,
      onUpdate: paint,
      onComplete: finish,
    });
    animation.speed = speedRef.current;
    animationRef.current = animation;
    return () => {
      animation.stop();
      unregister();
      animationRef.current = null;
      if (releaseLayoutRef.current === unregister) releaseLayoutRef.current = null;
    };
  }, [visible, geometry, reducedMotion, progress, onLayoutChange]);

  return { present, geometry, replacing, replaceWith, rowRef, preparingEntry };
}
