import { animate, motionValue } from 'motion/react';

import { readChatItemGap } from './chat-items.js';
import { registerChatLayout, type ChatLayoutEntry } from './chat-layout.js';
import { chatLayoutSpring } from './chat-presence.js';

export interface ReadingAnchor {
  element: HTMLElement;
  /** Body bottom relative to the viewport, independent of container translation. */
  bottom: number;
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

// ResizeObserver and DOMRect can differ slightly in subpixel reporting.
const intrinsicSizeTolerance = 0.02;

/** Layout alone owns expansion. Bubble visuals and flight clocks remain independent. */
export function createChatInsertions(
  viewport: HTMLElement,
  content: HTMLElement,
  changed: (localSend: boolean, anchor?: ReadingAnchor) => void
) {
  const entries = new Set<Insertion>();
  const unregister = registerChatLayout(viewport, entries);
  const measurements = new Map<HTMLElement, { body: HTMLElement; height?: number; gap: number }>();
  const active = new Map<HTMLElement, Insertion>();
  let savedAnchor: (ReadingAnchor & { scrollTop: number }) | undefined;
  let typingSnapshot: { row: Element; height: number } | undefined;
  let speed = 1;
  let reduced = false;
  let anchorOverlay: HTMLSpanElement | undefined;

  function showAnchor(element?: HTMLElement) {
    if (!anchorOverlay || anchorOverlay.parentElement === element) return;
    anchorOverlay.parentElement?.removeAttribute('data-chat-reading-anchor');
    anchorOverlay.remove();
    if (element) {
      element.setAttribute('data-chat-reading-anchor', '');
      element.append(anchorOverlay);
    }
  }

  function readingElement(row: HTMLElement) {
    return row.querySelector<HTMLElement>(':scope > [data-chat-item-id], :scope > [data-chat-item-body]') ?? row;
  }

  function captureAnchor(): ReadingAnchor | undefined {
    const top = viewport.getBoundingClientRect().top;
    const rows = content.children;
    // Row boxes are ordered and never overlap, even when their visuals overflow.
    // Binary search avoids measuring an entire history on every animation tick.
    let low = 0;
    let high = rows.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (rows[mid]!.getBoundingClientRect().bottom <= top) low = mid + 1;
      else high = mid;
    }
    for (let index = low; index < rows.length; index++) {
      const row = rows[index] as HTMLElement;
      if (active.get(row)?.newItem) continue;
      const element = readingElement(row);
      // Preserve the edge that made this partially visible row eligible. Rewrap
      // can shorten its body without moving that edge out of the reading viewport.
      return { element, bottom: element.getBoundingClientRect().bottom - top };
    }
    return undefined;
  }

  function remember() {
    const anchor = captureAnchor();
    savedAnchor = anchor && { ...anchor, scrollTop: viewport.scrollTop };
    showAnchor(anchor?.element);
    const tail = content.lastElementChild;
    const last = tail?.getAttribute('data-slot') === 'chat-bottom-space' ? tail.previousElementSibling : tail;
    const typing = last?.querySelector<HTMLElement>(':scope > [data-chat-item-body]');
    // Replacement inherits the painted footprint, including partial entry/exit,
    // rather than the body's full intrinsic height or a newly committed gap.
    typingSnapshot = typing && last ? { row: last, height: last.getBoundingClientRect().height } : undefined;
  }

  function anchorFromSnapshot(): ReadingAnchor | undefined {
    return savedAnchor?.element.isConnected
      ? { element: savedAnchor.element, bottom: savedAnchor.bottom + savedAnchor.scrollTop - viewport.scrollTop }
      : captureAnchor();
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
  }

  function measureRemaining(entry: Insertion) {
    entry.remaining = entry.measurement.height + entry.measurement.gap - entry.row.getBoundingClientRect().height;
  }

  function finish(entry: Insertion) {
    const anchor = captureAnchor();
    entry.animation?.stop();
    entries.delete(entry);
    active.delete(entry.row);
    restore(entry);
    entry.size.destroy();
    changed(false, anchor);
    remember();
  }

  function start(entry: Insertion, velocity = entry.size.getVelocity()) {
    const target = entry.measurement.height + entry.measurement.gap;
    entry.animation = animate(entry.size, target, {
      ...chatLayoutSpring,
      restDelta: 0.1,
      restSpeed: 1,
      velocity: velocity / speed,
      onUpdate: (height) => {
        if (!entry.row.isConnected) {
          finish(entry);
          return;
        }
        const anchor = captureAnchor();
        apply(entry, height);
        measureRemaining(entry);
        changed(false, anchor);
        remember();
      },
      onComplete: () => finish(entry),
    });
    entry.animation.speed = speed;
  }

  // Observation supplies geometry, not animation intent. Only an explicit model
  // change can create a slot; reflow and loaded content update stable rows naturally.
  // Observe bodies, never slots, so an animation cannot invalidate its own target.
  let width = viewport.clientWidth;
  const bodyObserver = new ResizeObserver((records) => {
    const affected = new Set<HTMLElement>();
    let geometryChanged = false;
    // Stable bodies reflow naturally and report their new sizes. Active rows have
    // a temporary fixed width, so explicitly release and remeasure only those rows.
    if (viewport.clientWidth !== width) {
      width = viewport.clientWidth;
      geometryChanged = true;
      for (const row of active.keys()) affected.add(row);
    }
    for (const record of records) {
      const row = record.target.parentElement;
      const previous = row && measurements.get(row);
      if (!row || !previous) continue;
      const height = record.borderBoxSize[0]?.blockSize ?? record.contentRect.height;
      if (previous.height === undefined) previous.height = height;
      else if (Math.abs(previous.height - height) > intrinsicSizeTolerance) {
        geometryChanged = true;
        if (active.has(row)) affected.add(row);
        else previous.height = height;
      }
    }
    if (affected.size) api.insert(new Set(), false, undefined, affected);
    else if (geometryChanged) {
      changed(false, anchorFromSnapshot());
      remember();
    }
  });

  function register(row: HTMLElement) {
    if (measurements.has(row)) return;
    const body = row.querySelector<HTMLElement>(':scope > [data-chat-item-id]');
    if (!body) return;
    measurements.set(row, {
      body,
      // The model declares this value directly. Registration requires no layout read.
      gap: Number.parseFloat(row.style.getPropertyValue('--chat-item-gap')) || 0,
    });
    bodyObserver.observe(body, { box: 'border-box' });
  }

  for (const row of content.children) register(row as HTMLElement);
  remember();
  function onScroll() {
    // A queued event from our last compensation can arrive after the next reflow,
    // before ResizeObserver. It must not replace the pre-layout reading snapshot.
    // Real scrolling during a width change is accounted for by anchorFromSnapshot;
    // the resize callback compensates first and only then selects the next anchor.
    if (savedAnchor?.scrollTop === viewport.scrollTop || viewport.clientWidth !== width) return;
    remember();
  }
  viewport.addEventListener('scroll', onScroll, { passive: true });
  const api = {
    register,
    unregister(row: HTMLElement) {
      const previous = measurements.get(row);
      if (previous) bodyObserver.unobserve(previous.body);
      measurements.delete(row);
      const entry = active.get(row);
      if (entry) {
        entry.animation?.stop();
        entry.size.destroy();
        entries.delete(entry);
        active.delete(row);
      }
    },
    /** The model supplies dirty rows; unchanged history does not need DOM measurement. */
    insert(
      ids: Set<string>,
      localSend: boolean,
      replacement?: { body: HTMLElement; row: HTMLElement; velocity: number },
      affected: ReadonlySet<HTMLElement> = new Set()
    ) {
      const anchor = anchorFromSnapshot();
      const replacementHeight = replacement
        ? typingSnapshot?.row === replacement.row
          ? typingSnapshot.height
          : replacement.row.getBoundingClientRect().height
        : 0;
      const targets = [...affected].filter((row) => row.isConnected && measurements.has(row));
      // Release only width to measure intrinsic wrapping. Keep active footprints
      // in place during measurement; exposing their final heights could clamp the
      // scroll range before the transaction restores its starting layout.
      // Unrelated animations retain their clock and velocity.
      for (const row of targets) {
        if (active.has(row)) row.style.removeProperty('width');
      }
      const nextMeasurements = targets.map((row): Measurement => {
        const body = readingElement(row);
        return {
          row,
          body,
          height: body.getBoundingClientRect().height,
          gap: readChatItemGap(row),
          width: row.getBoundingClientRect().width,
        };
      });
      if (replacement) {
        replacement.row.style.height = '0px';
        replacement.row.style.paddingTop = '0px';
        const visual = replacement.row.firstElementChild as HTMLElement;
        visual.style.position = 'absolute';
      }
      const updated: Insertion[] = [];
      const remeasured: Insertion[] = [];
      for (const measurement of nextMeasurements) {
        const { row } = measurement;
        let entry = active.get(row);
        const isNew = ids.has(measurement.body.dataset.chatItemId!);
        const previous = measurements.get(row)!;
        const heightChanged =
          previous.height !== undefined && Math.abs(previous.height - measurement.height) > intrinsicSizeTolerance;
        const gapChanged = previous.gap !== measurement.gap;
        if (previous.body !== measurement.body) {
          bodyObserver.unobserve(previous.body);
          bodyObserver.observe(measurement.body, { box: 'border-box' });
        }
        measurements.set(row, measurement);
        if (!entry && !isNew && !heightChanged && !gapChanged) continue;
        if (
          entry &&
          Math.abs(entry.measurement.height - measurement.height) <= intrinsicSizeTolerance &&
          entry.measurement.gap === measurement.gap
        ) {
          // Width may change without a new height target. Refresh geometry while
          // keeping the existing spring clock, including its completion deadline.
          entry.measurement = measurement;
          apply(entry, entry.size.get());
          remeasured.push(entry);
          continue;
        }
        if (!entry) {
          const initial = isNew
            ? measurement.body === replacement?.body
              ? replacementHeight
              : 0
            : (previous.height ?? measurement.height) + previous.gap;
          const fromGap = isNew ? measurement.gap : previous.gap;
          entry = {
            row,
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
          active.set(row, entry);
        }
        entry.animation?.stop();
        entry.fromSize = entry.size.get();
        entry.fromGap = entry.currentGap;
        entry.measurement = measurement;
        apply(entry, reduced ? measurement.height + measurement.gap : entry.size.get());
        updated.push(entry);
        remeasured.push(entry);
      }
      // Atomic starting layout: absolutely no geometry reads inside the write loop.
      // Otherwise a new zero-height slot plus its neighbor's already-reduced gap
      // temporarily shortens the list, and a forced layout clamps scrollTop before
      // the neighbor can restore its previous footprint (e.g. 8px -> 3px).
      for (const entry of remeasured) measureRemaining(entry);
      changed(localSend, anchor);
      for (const entry of updated) {
        if (reduced) finish(entry);
        else start(entry, entry.measurement.body === replacement?.body ? replacement.velocity : undefined);
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
    setDebugAnchor(enabled: boolean) {
      if (enabled && !anchorOverlay) {
        anchorOverlay = document.createElement('span');
        anchorOverlay.dataset.slot = 'chat-reading-anchor-overlay';
        anchorOverlay.setAttribute('aria-hidden', 'true');
        // Show the manager's saved selection, without an independent geometry scan.
        showAnchor(savedAnchor?.element);
      } else if (!enabled) {
        showAnchor();
        anchorOverlay = undefined;
      }
    },
    dispose() {
      showAnchor();
      anchorOverlay = undefined;
      bodyObserver.disconnect();
      viewport.removeEventListener('scroll', onScroll);
      for (const entry of entries) {
        entry.animation?.stop();
        entry.size.destroy();
        restore(entry);
      }
      entries.clear();
      active.clear();
      measurements.clear();
      unregister();
    },
  };
  bodyObserver.observe(viewport);
  return api;
}
