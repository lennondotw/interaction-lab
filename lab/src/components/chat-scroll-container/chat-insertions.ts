import { animate, motionValue } from 'motion/react';

import { readChatItemGap } from './chat-items.js';
import { registerChatLayout, type ChatLayoutEntry } from './chat-layout.js';
import { chatLayoutSpring } from './chat-presence.js';

export interface ReadingAnchor {
  element: HTMLElement;
  top: number;
}

interface Measurement {
  row: HTMLElement;
  body: HTMLElement;
  height: number;
  gap: number;
  width: number;
}

interface Insertion extends ChatLayoutEntry {
  measurement: Measurement;
  size: ReturnType<typeof motionValue<number>>;
  animation?: ReturnType<typeof animate>;
  fromSize: number;
  fromGap: number;
  currentGap: number;
  newItem: boolean;
}

/** Layout alone owns expansion. Bubble visuals and flight clocks remain independent. */
export function createChatInsertions(
  viewport: HTMLElement,
  content: HTMLElement,
  changed: (localSend: boolean, anchor?: ReadingAnchor) => void
) {
  const entries = new Set<Insertion>();
  const unregister = registerChatLayout(viewport, entries);
  const snapshots = new Map<HTMLElement, { top: number; height: number; gap: number }>();
  let speed = 1;
  let reduced = false;

  function rows() {
    return [...content.children].filter((row): row is HTMLElement => row instanceof HTMLElement);
  }

  function readingElement(row: HTMLElement) {
    return row.querySelector<HTMLElement>(':scope > [data-chat-item-id], :scope > [data-chat-item-body]') ?? row;
  }

  function isEntering(row: HTMLElement) {
    return [...entries].some((entry) => entry.row === row && entry.newItem);
  }

  function remember() {
    const origin = viewport.getBoundingClientRect().top;
    snapshots.clear();
    for (const row of rows()) {
      const rect = readingElement(row).getBoundingClientRect();
      snapshots.set(row, {
        top: rect.top - origin + viewport.scrollTop,
        height: rect.height,
        gap: [...entries].find((entry) => entry.row === row)?.currentGap ?? readChatItemGap(row),
      });
    }
  }

  function anchorFromSnapshot(): ReadingAnchor | undefined {
    for (const [element, snapshot] of snapshots) {
      if (element.isConnected && !isEntering(element) && snapshot.top + snapshot.height > viewport.scrollTop) {
        return {
          element: readingElement(element),
          top: snapshot.top - viewport.scrollTop + viewport.getBoundingClientRect().top,
        };
      }
    }
    return undefined;
  }

  function captureAnchor(): ReadingAnchor | undefined {
    const top = viewport.getBoundingClientRect().top;
    // Follow the existing body, not its temporary slot: moving a gap inside
    // that slot must not move the reading anchor. New hidden bodies cannot own it.
    const row = rows().find(
      (row) => snapshots.has(row) && !isEntering(row) && readingElement(row).getBoundingClientRect().bottom > top
    );
    const element = row && readingElement(row);
    return element ? { element, top: element.getBoundingClientRect().top } : undefined;
  }

  function restore(entry: Insertion) {
    const { row, body } = entry.measurement;
    for (const property of ['height', 'width', 'padding-top']) {
      row.style.removeProperty(property);
    }
    body.style.removeProperty('margin-top');
    body.style.removeProperty('flex-shrink');
    delete row.dataset.chatInserting;
  }

  function apply(entry: Insertion, height: number) {
    const { row, body, gap, width } = entry.measurement;
    const total = entry.measurement.height + gap;
    const progress = total === entry.fromSize ? 1 : (height - entry.fromSize) / (total - entry.fromSize);
    entry.currentGap = entry.fromGap + (gap - entry.fromGap) * Math.max(0, Math.min(1, progress));
    entry.gapRemaining = gap - entry.currentGap;
    Object.assign(row.style, {
      height: `${height}px`,
      width: `${width}px`,
      paddingTop: '0px',
    });
    // Keep the leading space inside the slot without imposing a minimum slot height.
    body.style.marginTop = `${entry.currentGap}px`;
    body.style.flexShrink = '0';
    row.dataset.chatInserting = '';
    entry.remaining = entry.measurement.height + gap - row.getBoundingClientRect().height;
  }

  function finish(entry: Insertion) {
    const anchor = captureAnchor();
    entry.animation?.stop();
    entries.delete(entry);
    restore(entry);
    entry.size.destroy();
    changed(false, anchor);
    remember();
  }

  function start(entry: Insertion) {
    const target = entry.measurement.height + entry.measurement.gap;
    entry.animation = animate(entry.size, target, {
      ...chatLayoutSpring,
      restDelta: 0.1,
      restSpeed: 1,
      velocity: entry.size.getVelocity() / speed,
      onUpdate: (height) => {
        if (!entry.row.isConnected) {
          finish(entry);
          return;
        }
        const anchor = captureAnchor();
        apply(entry, height);
        changed(false, anchor);
        remember();
      },
      onComplete: () => finish(entry),
    });
    entry.animation.speed = speed;
  }

  remember();
  const api = {
    /** Call after React commits, before paint and before starting visual entrances. */
    insert(ids: Set<string>, localSend: boolean, replacement?: { body: HTMLElement; row: HTMLElement }) {
      const anchor = anchorFromSnapshot();
      const previousTyping = replacement && snapshots.get(replacement.row);
      const replacementHeight = replacement
        ? previousTyping
          ? previousTyping.height + previousTyping.gap
          : replacement.row.getBoundingClientRect().height
        : 0;
      // Read the final intrinsic layout in one batch, then restore active slots.
      for (const entry of entries) restore(entry);
      const measurements = rows().flatMap((row): Measurement[] => {
        const body = row.querySelector<HTMLElement>(':scope > [data-chat-item-id]');
        if (!body) return [];
        return [
          {
            row,
            body,
            height: body.getBoundingClientRect().height,
            gap: readChatItemGap(row),
            width: row.getBoundingClientRect().width,
          },
        ];
      });
      if (replacement) {
        replacement.row.style.height = '0px';
        replacement.row.style.paddingTop = '0px';
        const visual = replacement.row.firstElementChild as HTMLElement;
        // Match the declared replacement style. React clears it when typing
        // reopens, returning the indicator to normal flow in the same commit.
        visual.style.position = 'absolute';
      }
      for (const measurement of measurements) {
        let entry = [...entries].find((item) => item.row === measurement.row);
        const isNew = ids.has(measurement.body.dataset.chatItemId!);
        const previous = snapshots.get(measurement.row);
        const gapChanged = previous && !entry && previous.gap !== measurement.gap;
        if (!entry && !isNew && !gapChanged) continue;
        if (!entry) {
          const initial = isNew
            ? measurement.body === replacement?.body
              ? replacementHeight
              : 0
            : measurement.height + previous!.gap;
          const fromGap = isNew ? measurement.gap : previous!.gap;
          entry = {
            row: measurement.row,
            measurement,
            remaining: 0,
            gapRemaining: 0,
            size: motionValue(initial),
            fromSize: initial,
            fromGap,
            currentGap: fromGap,
            newItem: isNew,
          };
          entries.add(entry);
        }
        entry.animation?.stop();
        entry.fromSize = entry.size.get();
        entry.fromGap = entry.currentGap;
        entry.measurement = measurement;
        apply(entry, reduced ? measurement.height + measurement.gap : entry.size.get());
      }
      // Publish the complete final target once, before any animation ticks.
      changed(localSend, anchor);
      for (const entry of entries) {
        if (reduced) finish(entry);
        else start(entry);
      }
      remember();
    },
    updateOptions(nextSpeed: number, nextReduced: boolean) {
      speed = nextSpeed;
      reduced = nextReduced;
      for (const entry of entries) {
        if (reduced) finish(entry);
        else if (entry.animation) entry.animation.speed = speed;
      }
    },
    remember,
    dispose() {
      resizeObserver.disconnect();
      for (const entry of entries) {
        entry.animation?.stop();
        entry.size.destroy();
        restore(entry);
      }
      entries.clear();
      unregister();
    },
  };
  let width = viewport.clientWidth;
  const resizeObserver = new ResizeObserver(() => {
    if (viewport.clientWidth === width) return;
    width = viewport.clientWidth;
    api.insert(new Set(), false);
  });
  resizeObserver.observe(viewport);
  return api;
}
