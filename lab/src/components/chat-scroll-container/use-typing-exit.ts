import { animate, useMotionValue } from 'motion/react';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

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
  const visualAnimations = useRef<ReturnType<typeof animate>[]>([]);
  const speedRef = useRef(animationSpeed);
  const entryRequested = useRef(false);
  const preparingEntry = visible && (replacing || (!geometry && (!present || entryRequested.current)));
  const replaceWith = useCallback(
    (replacement: HTMLElement) => {
      // The insertion slot takes over typing's measured footprint and grows to
      // the received row. Keep this existing visual for the simultaneous crossfade.
      progress.jump(0);
      offset.jump(0);
      setGeometry({ height: 0, gap: 0, replacement });
    },
    [progress, offset]
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
      const gap = Number.parseFloat(getComputedStyle(row).marginTop);
      setGeometry({ height: row.getBoundingClientRect().height + gap, gap, entry: true });
    } else if (!visible && present && !geometry) {
      entryRequested.current = false;
      const row = rowRef.current;
      if (!row) return;
      if (reducedMotion) {
        setPresent(false);
        return;
      }
      const gap = Number.parseFloat(getComputedStyle(row).marginTop);
      progress.jump(0);
      setGeometry({ height: row.getBoundingClientRect().height + gap, gap });
    }
  }, [visible, present, geometry, replacing, reducedMotion, progress, opacity, offset]);

  useLayoutEffect(() => {
    const visual = rowRef.current?.querySelector<HTMLElement>('[data-slot="typing-bubble"]');
    if (!present || !visual) return;
    const paintOpacity = (value: number) => {
      visual.style.opacity = String(Math.max(0, Math.min(1, value)));
    };
    const paintOffset = (value: number) => {
      visual.style.transform = `translateY(${value}px)`;
    };
    if (replacing && !visible) offset.jump(0);
    if (reducedMotion) {
      opacity.jump(visible ? 1 : 0);
      offset.jump(visible || replacing ? 0 : chatExitOffset);
      paintOpacity(opacity.get());
      paintOffset(offset.get());
      return;
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
      animate(offset, visible || replacing ? 0 : chatExitOffset, {
        ...visualSpring,
        velocity: offset.getVelocity() / speedRef.current,
        onUpdate: paintOffset,
      }),
    ];
    for (const animation of animations) animation.speed = speedRef.current;
    visualAnimations.current = animations;
    return () => {
      for (const animation of animations) animation.stop();
      visualAnimations.current = [];
    };
  }, [visible, present, replacing, reducedMotion, opacity, offset]);

  useLayoutEffect(() => {
    if (!geometry) return;
    const row = rowRef.current;
    if (!row) return;
    const viewport = row.closest<HTMLElement>('[data-slot="chat-scroll-viewport"]')!;
    const layout: ChatLayoutEntry = { row, remaining: 0, gapRemaining: 0 };
    const unregister = geometry.entry ? registerChatTransition(viewport, layout) : () => {};

    const paint = (value: number) => {
      const remaining = 1 - Math.max(0, Math.min(1, value));
      row.style.height = `${geometry.height * remaining}px`;
      layout.remaining = visible
        ? geometry.height - row.getBoundingClientRect().height
        : -row.getBoundingClientRect().height;
      if (geometry.entry) {
        const visual = row.querySelector<HTMLElement>('[data-slot="typing-bubble"]')!;
        // Keep entry aligned to the slot's bottom. At a followed bottom only
        // the requested 20px visual offset moves, while history makes room smoothly.
        visual.style.top = `${geometry.gap - geometry.height * Math.max(0, Math.min(1, value))}px`;
      }
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
    };
  }, [visible, geometry, reducedMotion, progress, onLayoutChange]);

  return { present, geometry, replacing, replaceWith, rowRef, preparingEntry };
}
