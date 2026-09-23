import { cn } from '@monorepo/utils';
import { useIntervalEffect } from '@react-hookz/web';
import { useCallback, useLayoutEffect, useRef, useState, type FC } from 'react';
import { flushSync } from 'react-dom';

import { Button } from '#src/components/button/button.js';
import { ResizableWindow } from '#src/instruments/resizable-window/resizable-window.js';

import type { VirtualItem, VirtualRange } from '../virtual-core.js';
import { minimapScale } from './minimap-view.js';
import { PlaygroundDriver } from './playground-driver.js';
import {
  flashDuration,
  flashEasing,
  maxLines,
  minLines,
  PlaygroundModel,
  pulseHeight,
  toOverscan,
  type PlaygroundLayout,
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
  /**
   * `flow`: mounted rows in normal flow between spacers sized from the core. `absolute`: each
   * row positioned at the core's offset for it.
   */
  layout: PlaygroundLayout;
  /** Hold the reading position still across layout changes. */
  anchoring: boolean;
  /** Where the reference line sits in the viewport: 0 is the top, 0.5 the middle, 1 the bottom. */
  anchorRatio: number;
}

const formatPx = (value: number) => `${Number(value.toFixed(2))}px`;

export const VirtualCorePlayground: FC<VirtualCorePlaygroundProps> = ({
  initialCount,
  estimateSize,
  overscanKind,
  overscanBefore,
  overscanAfter,
  seed,
  layout,
  anchoring,
  anchorRatio,
}) => {
  const [, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((version) => version + 1), []);
  const [model] = useState(() => new PlaygroundModel(initialCount, estimateSize, seed));
  const [jittering, setJittering] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const rowElements = useRef(new Map<Element, string>());
  const driverRef = useRef<PlaygroundDriver>(null);

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

  // One observer for the scroller and every row, so all size changes in a frame are delivered
  // together and handled as one change. Created during render so rows can register in their own
  // layout effects, which run before this component's; its callbacks run after layout, by which
  // time the driver exists. StrictMode's simulated remount disconnects it; rows observe again.
  const [resizeObserver] = useState(() => new ResizeObserver((entries) => driverRef.current!.onResize(entries)));

  const registerRow = useCallback(
    (element: HTMLElement, key: string) => {
      rowElements.current.set(element, key);
      resizeObserver.observe(element);
      return () => {
        resizeObserver.unobserve(element);
        rowElements.current.delete(element);
      };
    },
    [resizeObserver]
  );

  const mountedCount = useCallback(() => rowElements.current.size, []);

  useLayoutEffect(() => () => resizeObserver.disconnect(), [resizeObserver]);
  useLayoutEffect(() => () => model.dispose(), [model]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current!;
    const driver = new PlaygroundDriver(model, {
      scroller,
      spacer: spacerRef.current!,
      rows: rowElements.current,
      commit: () => flushSync(refresh),
      flash: flashRows,
    });
    driverRef.current = driver;
    model.setViewport({ offset: scroller.scrollTop - model.presentation.spacer, size: scroller.clientHeight });
    const onScroll = () => driver.onScroll();
    resizeObserver.observe(scroller);
    scroller.addEventListener('scroll', onScroll, { passive: true });

    // The step `scrollTop` is kept on depends on the device pixel ratio, which browser zoom or a
    // move to another screen changes. A resolution query matches only the current ratio, so it
    // fires once when the ratio changes and is then replaced by one for the new ratio.
    let resolution = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const onResolution = () => {
      driver.measureStep();
      driver.transact('pixel ratio');
      resolution.removeEventListener('change', onResolution);
      resolution = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      resolution.addEventListener('change', onResolution);
    };
    resolution.addEventListener('change', onResolution);
    return () => {
      resizeObserver.unobserve(scroller);
      scroller.removeEventListener('scroll', onScroll);
      resolution.removeEventListener('change', onResolution);
    };
  }, [model, refresh, flashRows, resizeObserver]);

  useLayoutEffect(() => {
    model.anchoring = { enabled: anchoring, ratio: anchorRatio };
    model.invalidate();
  }, [model, anchoring, anchorRatio]);

  // Props arrive during React's commit, where a transaction cannot render synchronously
  // (flushSync is ignored inside lifecycle methods). A microtask runs right after the commit
  // and still before the frame paints.
  const transactAfterCommit = useCallback((reason: string, change?: () => void) => {
    queueMicrotask(() => driverRef.current!.transact(reason, change));
  }, []);

  useLayoutEffect(() => {
    transactAfterCommit('overscan', () =>
      model.core.setOverscan(toOverscan(overscanKind, overscanBefore, overscanAfter, model))
    );
  }, [model, overscanKind, overscanBefore, overscanAfter, transactAfterCommit]);

  // The new layout already rendered; the transaction measures it and holds the anchor.
  useLayoutEffect(() => transactAfterCommit('layout'), [layout, transactAfterCommit]);

  const mountedKeys = () => new Set(rowElements.current.values());

  const act = (reason: string, change: () => void) => () => driverRef.current!.transact(reason, change);

  useIntervalEffect(
    act('jitter', () => model.jitter([...mountedKeys()])),
    jittering ? 350 : undefined
  );

  const forgetSizes = act('forget', () => {
    // Mounted rows did not change size, so the observer stays silent; the transaction
    // measures them again.
    for (const key of model.core.measuredKeys()) model.core.forget(key);
  });

  const seek = useCallback((offset: number) => {
    const scroller = scrollerRef.current!;
    scroller.scrollTop = offset - scroller.clientHeight / 2;
  }, []);

  const { core } = model;
  const renderRange = core.renderRange();
  const rendered = renderRange ? core.items(renderRange) : [];
  const rows = rendered.map((item) => (
    <PlaygroundRow
      key={item.key}
      item={item}
      positioned={layout === 'absolute'}
      pulseSince={model.pulses.get(item.key) ?? null}
      lines={model.lines.get(item.key)!}
      register={registerRow}
      onGrow={act('row content', () => model.resize(item.key, 1))}
      onShrink={act('row content', () => model.resize(item.key, -1))}
      onRemove={act('remove', () => model.remove(item.key))}
    />
  ));

  return (
    <div className="flex min-h-svh flex-col items-start gap-3 p-8">
      <div className="flex max-w-3xl flex-row flex-wrap gap-2">
        <Button size="sm" onClick={act('prepend', () => model.prepend(10))}>
          Prepend 10
        </Button>
        <Button size="sm" onClick={act('append', () => model.append(10))}>
          Append 10
        </Button>
        <Button size="sm" color="red" onClick={act('remove', () => model.removeFirst(10))}>
          Remove 10 from top
        </Button>
        <Button size="sm" color="red" onClick={act('remove', () => model.removeLast(10))}>
          Remove 10 from bottom
        </Button>
        <Button size="sm" onClick={act('resize all', () => model.resizeAll(mountedKeys()))}>
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
        <Button
          size="sm"
          color="blue"
          onClick={act('insert pulsing', () => {
            const visible = core.visibleRange();
            if (visible) model.insertPulsing(core.item(visible.startIndex).key, performance.now());
          })}
        >
          Insert pulsing row above
        </Button>
        <Button size="sm" color="yellow" onClick={act('stop pulsing', () => model.pulses.clear())}>
          Stop pulsing
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
            {/* Carries the fraction of the reading offset that scrollTop cannot; the driver sets its height. */}
            <div ref={spacerRef} aria-hidden="true" />
            {layout === 'absolute' ? (
              <div className="relative" style={{ height: core.totalSize() }}>
                {rows}
              </div>
            ) : (
              // Rows in normal flow; the padding stands for the rows above and below the render
              // range, at the core's sizes for them.
              <div
                style={{
                  paddingTop: rendered[0]?.start ?? 0,
                  paddingBottom: core.totalSize() - (rendered.at(-1)?.end ?? 0),
                }}
              >
                {rows}
              </div>
            )}
          </div>
        </ResizableWindow>

        <VirtualCoreMinimap model={model} onSeek={seek} />
      </div>

      <StatePanel model={model} layout={layout} mountedCount={mountedCount} />

      {anchoring ? (
        <section
          aria-label="How anchoring works"
          className="flex w-[480px] shrink-0 flex-col gap-2 text-xs text-neutral-500"
        >
          <h2 className="font-medium text-neutral-700 dark:text-neutral-300">
            The row at the reference line holds still
          </h2>
          <p>
            The purple line in the minimap is the reference line, at {anchorRatio} of the viewport height, and the
            purple row is the one it holds. Before every layout change (a measurement, new content, prepended or removed
            rows, a new window size) the playground records the rows near the line from the core. After the change,
            before the frame paints, it scrolls so the best of them that still exists keeps its distance from the line.
            Rows below the line can grow without moving anything above it; at ratio 1 the bottom edge holds, as a chat
            list does.
          </p>
          <p>
            Positions come from the core, not the DOM, so the {layout === 'flow' ? 'flow' : 'absolute'} layout only has
            to match the core. The state panel shows the DOM residual: where the anchor row&apos;s element is minus
            where the core says it is. It should stay at zero in both layouts.
          </p>
        </section>
      ) : (
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
            Anchoring is off, and this playground turns off the browser&apos;s <code>overflow-anchor</code>, so what you
            see is the core&apos;s raw layout. The core only computes positions and never writes the scroll position;
            turn anchoring on to hold the reading position still.
          </p>
        </section>
      )}
    </div>
  );
};

const PlaygroundRow: FC<{
  item: VirtualItem;
  /** Placed at the core's offset rather than in normal flow. */
  positioned: boolean;
  /** When the row started pulsing, or null for a row whose height changes only with its lines. */
  pulseSince: number | null;
  lines: number;
  register: (element: HTMLElement, key: string) => () => void;
  onGrow: () => void;
  onShrink: () => void;
  onRemove: () => void;
}> = ({ item, positioned, pulseSince, lines, register, onGrow, onShrink, onRemove }) => {
  const ref = useRef<HTMLDivElement>(null);
  const pulseRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => register(ref.current!, item.key), [register, item.key]);

  // Sized from the clock in an animation callback, before layout, so the shared ResizeObserver
  // reports the new size in the same frame and the anchor is held before it paints. The height
  // is a function of time, so a row that unmounts and mounts again resumes where it would be.
  useLayoutEffect(() => {
    if (pulseSince === null) return;
    const pulse = pulseRef.current!;
    let frame = 0;
    const tick = (now: number) => {
      pulse.style.height = `${pulseHeight(now - pulseSince)}px`;
      frame = requestAnimationFrame(tick);
    };
    pulse.style.height = `${pulseHeight(performance.now() - pulseSince)}px`;
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [pulseSince]);

  return (
    <div
      ref={ref}
      className={cn('px-2 pt-2', positioned && 'absolute inset-x-0')}
      style={positioned ? { top: item.start } : undefined}
    >
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
        {pulseSince !== null && (
          <div
            ref={pulseRef}
            className={`
              flex items-end overflow-hidden rounded-sm bg-[repeating-linear-gradient(135deg,rgb(244_63_94/0.18)_0_6px,transparent_6px_12px)]
              text-[10px] text-rose-600
              dark:text-rose-300
            `}
          >
            pulsing
          </div>
        )}
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

const signedPx = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatPx(Math.abs(value))}`;

const describeRange = (range: VirtualRange | null) =>
  range ? `${range.startIndex}…${range.endIndex} (${range.endIndex - range.startIndex + 1})` : '—';

/** Text written by a painter, so the numbers follow every frame without React. */
const StatePanel: FC<{ model: PlaygroundModel; layout: PlaygroundLayout; mountedCount: () => number }> = ({
  model,
  layout,
  mountedCount,
}) => {
  const panelRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current!;
    const field = (name: string) => panel.querySelector<HTMLElement>(`[data-field="${name}"]`)!;
    const outputs = new Map(
      [...stateFields.map(([name]) => name), 'viewport', 'minimap', 'anchor', 'change', 'residual', 'scroll'].map(
        (name) => [name, field(name)]
      )
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
      const anchor = model.currentAnchor();
      write(
        'anchor',
        model.anchoring.enabled
          ? `${anchor ? `${anchor.key}, ${signedPx(anchor.fromLine)} from the line` : '—'} at ratio ${model.anchoring.ratio} (${layout} layout)`
          : `off (${layout} layout)`
      );
      const last = model.lastChange;
      write(
        'change',
        last ? `${last.reason}: ${last.key ? `held ${last.key}, ` : ''}scrolled ${signedPx(last.delta)}` : '—'
      );
      write(
        'residual',
        `${last && last.domResidual !== null ? signedPx(last.domResidual) : '—'}, largest ${signedPx(model.maxDomResidual)}`
      );
      const { scrollTop, spacer, step, scrollStep, quantization } = model.presentation;
      write(
        'scroll',
        `scrollTop ${formatPx(scrollTop)} + spacer ${formatPx(spacer)} on a ${formatPx(step)} step (browser ${formatPx(scrollStep)}), quantization ${signedPx(quantization)}, largest ${signedPx(model.maxQuantization)}`
      );
      write(
        'viewport',
        `${viewport ? `reading offset ${formatPx(viewport.offset)}, size ${formatPx(viewport.size)}` : '—'}, scrolling ${model.scroll.direction}`
      );
    });
  }, [model, layout, mountedCount]);

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
      <span className="tabular-nums">
        Anchor: <span data-field="anchor" />
      </span>
      <span className="tabular-nums">
        Last change: <span data-field="change" />
      </span>
      <span className="tabular-nums">
        DOM residual: <span data-field="residual" />
      </span>
      <span className="tabular-nums">
        Presentation: <span data-field="scroll" />
      </span>
      <ul className="flex flex-row flex-wrap gap-x-3 gap-y-1 text-neutral-500">
        <LegendItem className="bg-neutral-500/40">Measured</LegendItem>
        <LegendItem className="bg-amber-500/50">Estimated</LegendItem>
        <LegendItem className="bg-blue-500/60">Render range</LegendItem>
        <LegendItem className="bg-green-500/70">Visible range</LegendItem>
        <LegendItem className="border border-red-500">Viewport</LegendItem>
        <LegendItem className="bg-slate-300/60">Scroll start and end</LegendItem>
        <LegendItem className="bg-cyan-400/70">Size update</LegendItem>
        <LegendItem className="bg-purple-500/75">Anchor row and reference line</LegendItem>
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
