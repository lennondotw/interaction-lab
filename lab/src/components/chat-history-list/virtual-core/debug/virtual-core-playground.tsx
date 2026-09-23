import { cn } from '@monorepo/utils';
import { useIntervalEffect } from '@react-hookz/web';
import { useCallback, useLayoutEffect, useRef, useState, type FC } from 'react';
import { flushSync } from 'react-dom';

import { Button } from '#src/components/button/button.js';
import { ResizableWindow } from '#src/instruments/resizable-window/resizable-window.js';

import type { VirtualItem, VirtualRange } from '../virtual-core.js';
import { minimapScale } from './minimap-view.js';
import {
  flashDuration,
  flashEasing,
  maxLines,
  minLines,
  nextScrollDirection,
  PlaygroundModel,
  toOverscan,
  type PlaygroundOverscanKind,
} from './playground-model.js';
import { VirtualCoreMinimap } from './virtual-core-minimap.js';

export interface VirtualCorePlaygroundProps {
  /** Rows created on mount. */
  initialCount: number;
  /** Size the core assumes for a row it has not measured. */
  estimateSize: number;
  /** `directional` is a custom strategy: `after` pixels in the scroll direction, `before` behind. */
  overscanKind: PlaygroundOverscanKind;
  overscanBefore: number;
  overscanAfter: number;
  /** Seed for the initial row heights. */
  seed: number;
}

const formatPx = (value: number) => `${Number(value.toFixed(2))}px`;

const sameRange = (a: VirtualRange | null, b: VirtualRange | null) =>
  a === b || (a !== null && b !== null && a.startIndex === b.startIndex && a.endIndex === b.endIndex);

export const VirtualCorePlayground: FC<VirtualCorePlaygroundProps> = ({
  initialCount,
  estimateSize,
  overscanKind,
  overscanBefore,
  overscanAfter,
  seed,
}) => {
  const [, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((version) => version + 1), []);
  const [model] = useState(() => new PlaygroundModel(initialCount, estimateSize, seed));
  const [jittering, setJittering] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rowElements = useRef(new Map<Element, string>());
  /** The render range React last committed; scrolling within it needs no React work. */
  const committedRange = useRef<VirtualRange | null>(null);

  /** Report a size to the core; returns a description when the layout changed. */
  const measureRow = useCallback(
    (key: string, size: number) => {
      const index = model.core.indexOf(key);
      const previous = index === undefined ? null : model.core.item(index);
      if (!model.core.measure(key, size) || !previous) return null;
      if (!previous.measured) return `≈${formatPx(previous.size)} → ${formatPx(size)}`;
      const delta = size - previous.size;
      return `${formatPx(previous.size)} → ${formatPx(size)} (${delta > 0 ? '+' : '−'}${formatPx(Math.abs(delta))})`;
    },
    [model]
  );

  /** Highlight updated rows: the overlay and its label appear at once, then fade out together. */
  const flashRows = useCallback(
    (updates: readonly (readonly [key: string, description: string])[]) => {
      const now = performance.now();
      const elements = new Map([...rowElements.current].map(([element, key]) => [key, element]));
      for (const [key, description] of updates) {
        model.flashes.set(key, now);
        const row = elements.get(key);
        if (!row) continue;
        const label = row.querySelector<HTMLElement>('[data-flash-label]')!;
        label.textContent = description;
        for (const target of [row.querySelector<HTMLElement>('[data-flash-overlay]')!, label]) {
          target.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: flashDuration,
            easing: `cubic-bezier(${flashEasing.join(', ')})`,
          });
        }
      }
      model.invalidate();
    },
    [model]
  );

  // Created during render so rows can register in their own layout effects, which run before
  // this component's. StrictMode's simulated remount disconnects it; rows then observe again.
  const [rowObserver] = useState(
    () =>
      new ResizeObserver((entries) => {
        const updates: [string, string][] = [];
        for (const entry of entries) {
          // An entry can be delivered after its row unmounted; there is nothing to measure.
          const key = rowElements.current.get(entry.target);
          if (key === undefined) continue;
          const description = measureRow(key, entry.borderBoxSize[0]!.blockSize);
          if (description) updates.push([key, description]);
        }
        if (updates.length === 0) return;
        // Commit before paint so a row never shows at its estimated position.
        flushSync(refresh);
        flashRows(updates);
        model.flush();
      })
  );

  const registerRow = useCallback(
    (element: HTMLElement, key: string) => {
      rowElements.current.set(element, key);
      rowObserver.observe(element);
      return () => {
        rowObserver.unobserve(element);
        rowElements.current.delete(element);
      };
    },
    [rowObserver]
  );

  const mountedCount = useCallback(() => rowElements.current.size, []);

  useLayoutEffect(() => () => rowObserver.disconnect(), [rowObserver]);
  useLayoutEffect(() => () => model.dispose(), [model]);

  useLayoutEffect(() => {
    committedRange.current = model.core.renderRange();
  });

  useLayoutEffect(() => {
    const scroller = scrollerRef.current!;
    const report = () => model.setViewport({ offset: scroller.scrollTop, size: scroller.clientHeight });
    report();
    refresh();
    const observer = new ResizeObserver(() => {
      report();
      flushSync(refresh);
      model.flush();
    });
    // Painters follow every scroll frame. React commits only when the render range changes,
    // and then inside the scroll event, so new rows are measured before the frame paints.
    const onScroll = () => {
      model.scroll = nextScrollDirection(model.scroll, scroller.scrollTop);
      report();
      model.invalidate();
      if (!sameRange(model.core.renderRange(), committedRange.current)) flushSync(refresh);
    };
    observer.observe(scroller);
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener('scroll', onScroll);
    };
  }, [model, refresh]);

  useLayoutEffect(() => {
    model.core.setOverscan(toOverscan(overscanKind, overscanBefore, overscanAfter, model));
    refresh();
    model.invalidate();
  }, [model, overscanKind, overscanBefore, overscanAfter, refresh]);

  const mountedKeys = () => new Set(rowElements.current.values());

  const act = (change: () => void) => () => {
    change();
    refresh();
    model.invalidate();
  };

  useIntervalEffect(
    act(() => model.jitter([...mountedKeys()])),
    jittering ? 350 : undefined
  );

  const forgetSizes = act(() => {
    for (const key of model.core.measuredKeys()) model.core.forget(key);
    // Mounted rows did not change size, so their observers stay silent: measure them now.
    const updates: [string, string][] = [];
    for (const [element, key] of rowElements.current) {
      const description = measureRow(key, element.getBoundingClientRect().height);
      if (description) updates.push([key, description]);
    }
    flashRows(updates);
  });

  const seek = useCallback((offset: number) => {
    const scroller = scrollerRef.current!;
    scroller.scrollTop = offset - scroller.clientHeight / 2;
  }, []);

  const { core } = model;
  const renderRange = core.renderRange();
  const rendered = renderRange ? core.items(renderRange) : [];

  return (
    <div className="flex min-h-svh flex-col items-start gap-3 p-8">
      <div className="flex max-w-3xl flex-row flex-wrap gap-2">
        <Button size="sm" onClick={act(() => model.prepend(10))}>
          Prepend 10
        </Button>
        <Button size="sm" onClick={act(() => model.append(10))}>
          Append 10
        </Button>
        <Button size="sm" color="red" onClick={act(() => model.removeFirst(10))}>
          Remove 10 from top
        </Button>
        <Button size="sm" color="red" onClick={act(() => model.removeLast(10))}>
          Remove 10 from bottom
        </Button>
        <Button size="sm" onClick={act(() => model.resizeAll(mountedKeys()))}>
          Resize all rows
        </Button>
        <Button size="sm" color="yellow" onClick={forgetSizes}>
          Forget measurements
        </Button>
        <Button
          size="sm"
          color={jittering ? 'red' : 'blue'}
          onClick={() => setJittering((value) => !value)}
          allPossibleContents={['Stop jitter', 'Jitter mounted rows']}
        >
          {jittering ? 'Stop jitter' : 'Jitter mounted rows'}
        </Button>
        <Button size="sm" onClick={() => seek(0)}>
          Scroll to top
        </Button>
        <Button size="sm" onClick={() => seek(core.totalSize())}>
          Scroll to bottom
        </Button>
      </div>

      <div className="flex flex-row items-stretch gap-3">
        <ResizableWindow
          title="Virtual core · Resizable window"
          label="Resizable list window"
          initialSize={{ width: 380, height: 560 }}
          minimumSize={{ width: 240, height: 200 }}
        >
          <div
            ref={scrollerRef}
            className={`
              relative size-full overflow-x-clip overflow-y-auto rounded-sm bg-neutral-500/10 ring-1 ring-neutral-500/50
              [overflow-anchor:none]
            `}
          >
            <div className="relative" style={{ height: core.totalSize() }}>
              {rendered.map((item) => (
                <PlaygroundRow
                  key={item.key}
                  item={item}
                  lines={model.lines.get(item.key)!}
                  register={registerRow}
                  onGrow={act(() => model.resize(item.key, 1))}
                  onShrink={act(() => model.resize(item.key, -1))}
                  onRemove={act(() => model.remove(item.key))}
                />
              ))}
            </div>
          </div>
        </ResizableWindow>

        <VirtualCoreMinimap model={model} onSeek={seek} />
      </div>

      <StatePanel model={model} mountedCount={mountedCount} />

      <section
        aria-label="Why the content jumps"
        className="flex w-[480px] shrink-0 flex-col gap-2 text-xs text-neutral-500"
      >
        <h2 className="font-medium text-neutral-700 dark:text-neutral-300">
          Content jumping when rows above change size is expected
        </h2>
        <p>
          When a row above the viewport changes size, every row below it moves by the same amount while the scroll
          position stays where it was, so the visible content jumps. You see it most when scrolling up into rows that
          have never been measured, when a row above is given new content, and when rows are prepended. Changes below
          the viewport move nothing you can see.
        </p>
        <p>
          This is by design. The virtual core only computes positions; it never writes the scroll position, and this
          playground turns off the browser&apos;s <code>overflow-anchor</code> so it shows the core&apos;s raw layout.
          Keeping the reading position still is the job of the scroll controller that will sit on top of the core:
          before a layout change it remembers anchor rows, and after the change, before the frame paints, it corrects
          the scroll position by how far they moved.
        </p>
      </section>
    </div>
  );
};

const PlaygroundRow: FC<{
  item: VirtualItem;
  lines: number;
  register: (element: HTMLElement, key: string) => () => void;
  onGrow: () => void;
  onShrink: () => void;
  onRemove: () => void;
}> = ({ item, lines, register, onGrow, onShrink, onRemove }) => {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => register(ref.current!, item.key), [register, item.key]);

  return (
    <div ref={ref} className="absolute inset-x-0 px-2 pt-2" style={{ top: item.start }}>
      <div
        className={cn(
          `
            relative flex flex-col gap-1.5 border-[0.5px] border-neutral-500/50 bg-white/50 px-3 py-2 font-mono
            text-xs
            dark:bg-black/50
          `,
          !item.measured && 'border-dashed border-amber-500'
        )}
      >
        <div className="flex flex-row items-center justify-between gap-2">
          <span>
            {item.key} <span className="text-neutral-500">#{item.index}</span>
          </span>
          <span className={cn('tabular-nums', item.measured ? 'text-neutral-500' : 'text-amber-600')}>
            {item.measured ? '' : '≈ '}
            {formatPx(item.size)} @ {formatPx(item.start)}
          </span>
        </div>
        {Array.from({ length: lines }, (_, line) => (
          <div
            key={line}
            className="h-2 rounded-full bg-neutral-500/25"
            style={{ width: `${45 + ((line * 37 + item.key.length * 11) % 50)}%` }}
          />
        ))}
        <div className="flex flex-row gap-1">
          <Button size="sm" onClick={onGrow} disabled={lines >= maxLines}>
            + line
          </Button>
          <Button size="sm" onClick={onShrink} disabled={lines <= minLines}>
            − line
          </Button>
          <Button size="sm" color="red" onClick={onRemove}>
            Remove
          </Button>
        </div>
        {/* Animated imperatively when the row's size changes; hidden otherwise. */}
        <div data-flash-overlay className="pointer-events-none absolute inset-0 bg-cyan-400/25 opacity-0" />
        <span
          data-flash-label
          className={`
            pointer-events-none absolute right-2 bottom-1.5 text-[10px] text-cyan-700 tabular-nums opacity-0
            dark:text-cyan-300
          `}
        />
      </div>
    </div>
  );
};

const stateFields = [
  ['items', 'Items'],
  ['mounted', 'Mounted rows'],
  ['measured', 'Measured'],
  ['estimated', 'Estimated'],
  ['cached', 'Cached sizes'],
  ['total', 'Total size'],
  ['visible', 'Visible'],
  ['render', 'Render'],
] as const;

const describeRange = (range: VirtualRange | null) =>
  range ? `${range.startIndex}…${range.endIndex} (${range.endIndex - range.startIndex + 1})` : '—';

/** Text written by a painter, so the numbers follow every frame without React. */
const StatePanel: FC<{ model: PlaygroundModel; mountedCount: () => number }> = ({ model, mountedCount }) => {
  const panelRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current!;
    const field = (name: string) => panel.querySelector<HTMLElement>(`[data-field="${name}"]`)!;
    const outputs = new Map(
      [...stateFields.map(([name]) => name), 'viewport', 'minimap'].map((name) => [name, field(name)])
    );
    const write = (name: string, value: string) => {
      const output = outputs.get(name)!;
      if (output.textContent !== value) output.textContent = value;
    };
    return model.addPainter(() => {
      const { core } = model;
      const stats = core.stats();
      const viewport = core.viewport;
      write('items', String(stats.count));
      write('mounted', String(mountedCount()));
      write('measured', String(stats.measured));
      write('estimated', String(stats.estimated));
      write('cached', String(stats.cachedSizes));
      write('total', formatPx(core.totalSize()));
      write('visible', describeRange(core.visibleRange()));
      write('render', describeRange(core.renderRange()));
      const { view, height } = model.minimap;
      const scale = minimapScale(view, { height, total: core.totalSize() });
      write(
        'minimap',
        height === 0
          ? '—'
          : `${view.zoomedScale === null ? 'fitted' : 'zoomed'} at 1:${Math.round(1 / scale)}, top at ${formatPx(view.top)}`
      );
      write(
        'viewport',
        `${viewport ? `${formatPx(viewport.offset)} + ${formatPx(viewport.size)}` : '—'}, scrolling ${model.scroll.direction}`
      );
    });
  }, [model, mountedCount]);

  return (
    <section
      ref={panelRef}
      aria-label="Virtual core state"
      className="flex w-[480px] shrink-0 flex-col gap-3 rounded-xl border border-neutral-500/30 p-3 font-mono text-xs"
    >
      <div className="grid grid-cols-2 gap-x-4 tabular-nums">
        {stateFields.map(([name, label]) => (
          <span key={name}>
            {label}: <span data-field={name} />
          </span>
        ))}
      </div>
      <span className="tabular-nums">
        Viewport: <span data-field="viewport" />
      </span>
      <span className="tabular-nums">
        Minimap: <span data-field="minimap" />
      </span>
      <ul className="flex flex-row flex-wrap gap-x-3 gap-y-1 text-neutral-500">
        <LegendItem className="bg-neutral-500/40">Measured</LegendItem>
        <LegendItem className="bg-amber-500/50">Estimated</LegendItem>
        <LegendItem className="bg-blue-500/60">Render range</LegendItem>
        <LegendItem className="bg-green-500/70">Visible range</LegendItem>
        <LegendItem className="border border-red-500">Viewport</LegendItem>
        <LegendItem className="bg-slate-300/60">Scroll start and end</LegendItem>
        <LegendItem className="bg-cyan-400/70">Size update</LegendItem>
      </ul>
    </section>
  );
};

const LegendItem: FC<{ className: string; children: string }> = ({ className, children }) => (
  <li className="flex flex-row items-center gap-1.5">
    <span className={cn('size-2.5 rounded-xs', className)} />
    {children}
  </li>
);
