import { animate, motionValue } from 'motion/react';

import { registerChatTransition, type ChatLayoutEntry } from './chat-layout.js';
import { chatLayoutSpring } from './chat-presence.js';

export interface ChatBottomSpace {
  /** Complete trailing clearance, including any desired gap above the composer. */
  height: number;
  /** Unique identity for a reset measured in this update. Ordinary edits omit it. */
  release?: symbol;
}

interface Release extends ChatLayoutEntry {
  size: ReturnType<typeof motionValue<number>>;
  animation?: ReturnType<typeof animate>;
  unregister: () => void;
}

/** Trailing space is a layout participant, independent of message IDs and flight lifetime. */
export function createChatBottomSpace(
  viewport: HTMLElement,
  element: HTMLElement,
  changed: (composerResize: boolean) => void
) {
  const releases = new Map<symbol, Release>();
  let base = 0;
  let lastRelease: symbol | undefined;
  let speed = 1;
  let reduced = false;
  let disposed = false;

  function paint() {
    let pending = 0;
    for (const entry of releases.values()) {
      const height = Math.max(0, entry.size.get());
      entry.remaining = -height;
      pending += height;
    }
    element.style.height = `${base + pending}px`;
  }

  function finish(id: symbol, entry: Release) {
    releases.delete(id);
    entry.unregister();
    entry.size.destroy();
    paint();
    changed(false);
  }

  return {
    update(space: ChatBottomSpace) {
      const next = Math.max(0, space.height);
      const released = base - next;
      const id = space.release;
      const transfer = id !== undefined && id !== lastRelease && released > 0 && !reduced;
      lastRelease = id;
      const resized = base !== next;
      base = next;
      let entry: Release | undefined;
      if (transfer) {
        entry = {
          row: element,
          remaining: -released,
          gapRemaining: 0,
          size: motionValue(released),
          unregister: () => {},
        };
        entry.unregister = registerChatTransition(viewport, entry);
        releases.set(id, entry);
      }
      // One write exchanges base clearance for compensation. No intermediate
      // smaller scroll range may be exposed to geometry reads or native clamping.
      paint();
      if (resized) changed(true);
      if (entry) {
        const release = entry;
        release.animation = animate(release.size, 0, {
          ...chatLayoutSpring,
          restDelta: 0.1,
          restSpeed: 1,
          onUpdate: () => {
            if (disposed) return;
            paint();
            changed(false);
          },
          onComplete: () => finish(id!, release),
        });
        release.animation.speed = speed;
      }
    },
    updateOptions(nextSpeed: number, nextReduced: boolean) {
      speed = nextSpeed;
      reduced = nextReduced;
      for (const [id, entry] of releases) {
        if (reduced) finish(id, entry);
        else if (entry.animation) entry.animation.speed = speed;
      }
    },
    dispose() {
      disposed = true;
      for (const entry of releases.values()) {
        entry.size.destroy();
        entry.unregister();
      }
      releases.clear();
      element.style.removeProperty('height');
    },
  };
}
