import { useMemo } from 'react';

/**
 * Instrumentation for the AnimatePresence exit-batching demo.
 *
 * Everything here observes the *real DOM* and *real computed styles*. No Motion
 * internal is patched, imported or read. That constraint is the whole point: the
 * demo has to produce evidence about what the browser actually ends up doing,
 * not echo back our reading of the library source.
 *
 * Two probes are load-bearing:
 *
 * - `observeMounts` uses a MutationObserver, because that is the only way to
 *   tell "the exit animation finished" apart from "React actually removed the
 *   node". Those are different events, and the demo exists because they can be
 *   *seconds* apart.
 * - `readX` parses the composited transform matrix rather than trusting
 *   `onUpdate` or the inline style, so "what Motion thinks it wrote" and "what
 *   the browser is painting" can never be conflated.
 */

export type TraceKind = 'script' | 'mount' | 'unmount' | 'exit-done' | 'enter-done' | 'snapshot' | 'sample';

export interface TraceEntry {
  /** ms since the current run started. */
  t: number;
  kind: TraceKind;
  text: string;
}

export interface ChildSnapshot {
  key: string;
  /** Stable per-DOM-node id, so "the same element was reused" is observable. */
  node: number;
  x: number;
  opacity: number;
}

/** Reads the translateX the browser is actually compositing, not the inline style. */
export const readX = (el: Element): number => {
  const { transform } = getComputedStyle(el);
  if (!transform || transform === 'none') return 0;

  const matrix = /matrix\(([^)]+)\)/.exec(transform);
  if (matrix) return Math.round(Number(matrix[1]?.split(',')[4]));

  const matrix3d = /matrix3d\(([^)]+)\)/.exec(transform);
  if (matrix3d) return Math.round(Number(matrix3d[1]?.split(',')[12]));

  return 0;
};

export const readOpacity = (el: Element): number => Math.round(Number(getComputedStyle(el).opacity) * 100) / 100;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });

export const createExitTracer = () => {
  let t0 = 0;
  let entries: TraceEntry[] = [];
  let subscriptions: (() => void)[] = [];

  // Node identity is scoped to the tracer so ids restart at #1 per demo
  // instance. When a re-entering key gets the *same* number, that is the
  // observation — React reused the element rather than mounting a new one.
  const nodeIds = new WeakMap<Element, number>();
  let nextNodeId = 1;

  const emit = (): void => {
    subscriptions.forEach((sub) => sub());
  };

  const nodeId = (el: Element): number => {
    let id = nodeIds.get(el);
    if (id === undefined) {
      id = nextNodeId++;
      nodeIds.set(el, id);
    }
    return id;
  };

  const log = (kind: TraceKind, text: string): void => {
    entries = [...entries, { t: Math.round(performance.now() - t0), kind, text }];
    emit();
  };

  /** Every child currently living inside the AnimatePresence container. */
  const snapshot = (container: HTMLElement | null): ChildSnapshot[] =>
    [...(container?.children ?? [])].map((el) => ({
      key: (el as HTMLElement).dataset.slide ?? '?',
      node: nodeId(el),
      x: readX(el),
      opacity: readOpacity(el),
    }));

  const logSnapshot = (label: string, container: HTMLElement | null): ChildSnapshot[] => {
    const children = snapshot(container);
    const body = children.length
      ? children.map((c) => `${c.key}#${String(c.node)} x=${String(c.x)} o=${String(c.opacity)}`).join(', ')
      : 'empty';
    log('snapshot', `${label} → [${body}]`);
    return children;
  };

  return {
    log,
    nodeId,
    snapshot,
    logSnapshot,

    reset: (): void => {
      t0 = performance.now();
      entries = [];
      emit();
    },

    getEntries: (): readonly TraceEntry[] => entries,

    subscribe: (callback: () => void): (() => void) => {
      subscriptions.push(callback);
      return () => {
        subscriptions = subscriptions.filter((sub) => sub !== callback);
      };
    },

    /**
     * Real DOM mount/unmount. Separating this from `onAnimationComplete` is what
     * makes the batching visible at all: an `exit-done` with no `unmount` next
     * to it means a finished element is still sitting in the tree.
     */
    observeMounts: (container: HTMLElement): (() => void) => {
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          record.addedNodes.forEach((n) => {
            if (n instanceof HTMLElement) log('mount', `+ ${n.dataset.slide ?? '?'} (node #${String(nodeId(n))})`);
          });
          record.removedNodes.forEach((n) => {
            if (n instanceof HTMLElement) log('unmount', `− ${n.dataset.slide ?? '?'} (node #${String(nodeId(n))})`);
          });
        }
      });
      observer.observe(container, { childList: true });
      return () => observer.disconnect();
    },

    /**
     * Per-frame x series for one slide. A smooth run of numbers means the
     * animation continued from where it was; a discontinuity means it was reset
     * and replayed. This is the only way to tell those two apart — the settled
     * end state is identical either way.
     */
    sampleSlide: async (container: HTMLElement | null, key: string, frames: number): Promise<string> => {
      const series: string[] = [];
      for (let i = 0; i < frames; i++) {
        await nextFrame();
        const el = container?.querySelector<HTMLElement>(`[data-slide="${key}"]`);
        series.push(el ? String(readX(el)) : 'gone');
      }
      return series.join(' ');
    },
  };
};

export type ExitTracer = ReturnType<typeof createExitTracer>;

export const useExitTracer = (): ExitTracer => useMemo(() => createExitTracer(), []);
