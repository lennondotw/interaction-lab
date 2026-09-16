import { cancelFrame, frame } from 'motion/react';

interface Visual {
  element: HTMLElement;
  phase: () => string;
}

// Visual owners publish their actual carrier, never an inferred animation timer.
// Weak viewport keys keep this optional instrumentation out of component state.
const visuals = new WeakMap<HTMLElement, Map<HTMLElement, Visual>>();

export function registerChatDebugVisual(viewport: HTMLElement, source: HTMLElement, visual: Visual) {
  let entries = visuals.get(viewport);
  if (!entries) {
    entries = new Map();
    visuals.set(viewport, entries);
  }
  entries.set(source, visual);
  return () => {
    if (entries.get(source) === visual) entries.delete(source);
  };
}

/** Read-only annotations live outside the scroller, so they cannot extend its range. */
export function createChatItemDebug(viewport: HTMLElement, content: HTMLElement) {
  const host = viewport.parentElement!;
  const layer = document.createElement('div');
  layer.dataset.slot = 'chat-item-debug-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.inert = true;
  host.append(layer);
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

  const paint = () => {
    const active = visuals.get(viewport);
    // Only visible bodies and live visual carriers need geometry reads, even in
    // long histories. No per-frame scan or React update of the message array.
    const sources = new Set([...visible, ...(active?.keys() ?? [])]);
    const hostRect = host.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const samples = [];
    for (const source of sources) {
      if (!source.isConnected) continue;
      const visual = active?.get(source);
      const element = visual?.element ?? source;
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden') continue;
      let rect = element.getBoundingClientRect();
      const row = source.parentElement!;
      const slot = row.dataset.slot;
      const typing = source.dataset.slot === 'typing-bubble';
      const label = source.matches('[data-slot="chat-date-label"], [data-slot="chat-status-label"]');
      if (label) {
        // Label boxes span the row; the annotation belongs beside the painted text.
        const range = document.createRange();
        range.selectNodeContents(element);
        rect = range.getBoundingClientRect();
      }
      if (rect.bottom < viewportRect.top || rect.top > viewportRect.bottom) continue;
      const phase = visual?.phase() ?? 'idle';
      const layout =
        row.hasAttribute('data-chat-inserting') ||
        slot === 'typing-entry-placeholder' ||
        slot === 'typing-exit-placeholder';
      const outgoing = source.dataset.variant === 'outgoing';
      const kind = typing ? 'typing' : (source.dataset.variant ?? (label ? 'label' : 'content'));
      samples.push({
        source,
        text: `${source.dataset.chatItemId ?? 'typing'} · ${kind}\n${phase} · layout: ${layout ? 'animating' : 'idle'}`,
        x: (outgoing ? rect.left - 6 : rect.right + 6) - hostRect.left - host.clientLeft,
        y: rect.top + rect.height / 2 - hostRect.top - host.clientTop,
        outgoing,
        opacity: style.opacity,
      });
    }
    // Batch writes after reads; annotation geometry is never an input to motion.
    const painted = new Set(samples.map((sample) => sample.source));
    for (const [source, badge] of badges) {
      if (!painted.has(source)) {
        badge.remove();
        badges.delete(source);
      }
    }
    for (const sample of samples) {
      let badge = badges.get(sample.source);
      if (!badge) {
        badge = document.createElement('span');
        badge.dataset.slot = 'chat-item-debug';
        layer.append(badge);
        badges.set(sample.source, badge);
      }
      if (badge.textContent !== sample.text) badge.textContent = sample.text;
      badge.dataset.side = sample.outgoing ? 'left' : 'right';
      Object.assign(badge.style, {
        left: `${sample.x}px`,
        top: `${sample.y}px`,
        opacity: sample.opacity,
      });
    }
  };
  frame.postRender(paint, true);
  return () => {
    cancelFrame(paint);
    mutations.disconnect();
    observer.disconnect();
    layer.remove();
  };
}
