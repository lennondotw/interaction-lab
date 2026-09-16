import { cancelFrame, frame } from 'motion/react';

interface Visual {
  element: HTMLElement;
  phase: () => string;
}

// Visual owners publish their actual carrier, never an inferred animation timer.
// Weak viewport keys keep this optional instrumentation out of component state.
const visuals = new WeakMap<HTMLElement, Map<HTMLElement, Visual>>();
const listeners = new WeakMap<HTMLElement, () => void>();

/** Clones inherit content, never instrumentation belonging to the source visual. */
export function cloneWithoutChatDebug(source: HTMLElement) {
  const clone = source.cloneNode(true) as HTMLElement;
  for (const badge of clone.querySelectorAll('[data-slot="chat-item-debug"]')) badge.remove();
  clone.removeAttribute('data-chat-debug-anchor');
  for (const anchor of clone.querySelectorAll('[data-chat-debug-anchor]'))
    anchor.removeAttribute('data-chat-debug-anchor');
  return clone;
}

export function registerChatDebugVisual(viewport: HTMLElement, source: HTMLElement, visual: Visual) {
  let entries = visuals.get(viewport);
  if (!entries) {
    entries = new Map();
    visuals.set(viewport, entries);
  }
  entries.set(source, visual);
  listeners.get(viewport)?.();
  return () => {
    if (entries.get(source) === visual) {
      entries.delete(source);
      listeners.get(viewport)?.();
    }
  };
}

/** Annotations belong to their visual carrier, so native scrolling needs no JS position sync. */
export function createChatItemDebug(viewport: HTMLElement, content: HTMLElement) {
  const visible = new Set<HTMLElement>();
  const bodies = new Map<Element, HTMLElement>();
  const badges = new Map<HTMLElement, HTMLSpanElement>();
  const observer = new IntersectionObserver(
    (records) => {
      for (const record of records) {
        const body = record.target as HTMLElement;
        if (record.isIntersecting) visible.add(body);
        else visible.delete(body);
      }
    },
    { root: viewport }
  );
  function add(row: Element) {
    const body = row.querySelector<HTMLElement>(':scope > [data-chat-item-id], :scope > [data-chat-item-body]');
    if (!body) return;
    bodies.set(row, body);
    observer.observe(body);
  }
  function remove(row: Element) {
    const body = bodies.get(row);
    if (!body) return;
    observer.unobserve(body);
    visible.delete(body);
    bodies.delete(row);
  }
  for (const row of content.children) add(row);
  const mutations = new MutationObserver((records) => {
    for (const record of records) {
      // A stable item ID may switch body type without replacing its row.
      if (record.target instanceof Element && record.target.parentElement === content) {
        remove(record.target);
        add(record.target);
        continue;
      }
      if (record.target !== content) continue;
      for (const node of record.removedNodes) if (node instanceof Element) remove(node);
      for (const node of record.addedNodes) if (node instanceof Element) add(node);
    }
  });
  mutations.observe(content, { childList: true, subtree: true });

  function removeBadge(source: HTMLElement) {
    const badge = badges.get(source);
    if (!badge) return;
    badge.parentElement?.removeAttribute('data-chat-debug-anchor');
    badge.remove();
    badges.delete(source);
  }

  const paint = () => {
    const active = visuals.get(viewport);
    // Read states only for visible bodies and live carriers. CSS owns position,
    // clipping, and inherited opacity; no per-frame geometry reads or React updates.
    const sources = new Set([...visible, ...(active?.keys() ?? [])]);
    for (const source of badges.keys()) {
      if (!source.isConnected || !sources.has(source)) removeBadge(source);
    }
    for (const source of sources) {
      if (!source.isConnected) continue;
      const visual = active?.get(source);
      const element = visual?.element ?? source;
      const row = source.parentElement!;
      const slot = row.dataset.slot;
      const typing = source.dataset.slot === 'typing-bubble';
      const label = source.matches('[data-slot="chat-date-label"], [data-slot="chat-status-label"]');
      const anchor = label
        ? (element.querySelector<HTMLElement>(':scope > [data-slot="chat-label-content"]') ?? element)
        : element;
      const phase = visual?.phase() ?? 'idle';
      const layout =
        row.hasAttribute('data-chat-inserting') ||
        slot === 'typing-entry-placeholder' ||
        slot === 'typing-exit-placeholder';
      const kind = typing ? 'typing' : (source.dataset.variant ?? (label ? 'label' : 'content'));
      let badge = badges.get(source);
      if (!badge) {
        badge = document.createElement('span');
        badge.dataset.slot = 'chat-item-debug';
        badge.setAttribute('aria-hidden', 'true');
        badge.inert = true;
        badges.set(source, badge);
      }
      if (badge.parentElement !== anchor) {
        badge.parentElement?.removeAttribute('data-chat-debug-anchor');
        anchor.setAttribute('data-chat-debug-anchor', '');
        anchor.append(badge);
      }
      const text = `${source.dataset.chatItemId ?? 'typing'} · ${kind}\n${phase} · layout: ${layout ? 'animating' : 'idle'}`;
      if (badge.textContent !== text) badge.textContent = text;
      badge.dataset.side = kind === 'content' ? 'inside-right' : kind === 'outgoing' ? 'left' : 'right';
    }
  };
  listeners.set(viewport, paint);
  frame.postRender(paint, true);
  return () => {
    cancelFrame(paint);
    listeners.delete(viewport);
    mutations.disconnect();
    observer.disconnect();
    for (const source of badges.keys()) removeBadge(source);
  };
}
