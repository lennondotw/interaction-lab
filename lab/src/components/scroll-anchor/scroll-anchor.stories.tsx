import { cn, toSpringPhysics } from '@monorepo/utils';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { animate, motionValue, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Segmented, Toggle } from '#src/instruments/controls/controls.js';

import { Button } from '../button/index.js';
import { registerLayoutTransition } from './pending-layout.js';
import type { ScrollAnchorState } from './scroll-anchor-controller.js';
import { ScrollAnchor, ScrollAnchorContent, ScrollAnchorViewport } from './scroll-anchor.js';
import { useScrollAnchor, type ScrollAnchorHandle } from './use-scroll-anchor.js';

const meta = {
  title: 'Components/Scroll anchor',
  component: ScrollAnchor,
  parameters: { layout: 'fullscreen', controls: { disable: true } },
  decorators: [
    (Story) => (
      <div className="flex min-h-svh items-center justify-center px-4 py-8">
        <div className="h-[min(640px,calc(100svh-64px))] w-full max-w-md">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof ScrollAnchor>;

export default meta;
type Story = StoryObj<typeof meta>;

interface WireRow {
  id: string;
  height: number;
}

/** A fixed pitch cycle keeps the wireframe deterministic across reloads and playback speeds. */
const pitch = [40, 64, 48, 88, 56, 72, 44, 96] as const;
const heightFor = (sequence: number) => pitch[sequence % pitch.length]!;

/** The same 28/1 layout spring the chat list uses for slot expansion. */
const rowSpring = {
  type: 'spring',
  ...toSpringPhysics({ angularFrequency: 28, dampingRatio: 1 }),
  restDelta: 0.1,
  restSpeed: 1,
} as const;

interface RowEntrance {
  stop: () => void;
  setSpeed: (speed: number) => void;
}

/**
 * A demo-side layout slot: the row's footprint grows from zero while its
 * remaining height is published as pending layout, so catch-up can target the
 * final bottom and a settled follower can track each tick without a second spring.
 */
function enterRow(
  viewport: HTMLElement,
  row: HTMLElement,
  target: number,
  speed: number,
  tick: () => void,
  done: () => void
): RowEntrance {
  // React owns the row's declared `height` style and does not rewrite it while the
  // prop is unchanged, so the slot always ends by writing that height back.
  const entry = { row, remaining: target };
  const unregister = registerLayoutTransition(viewport, entry);
  const badge = row.querySelector<HTMLElement>('[data-row-slot]');
  row.dataset.entering = '';
  row.style.height = '0px';
  const size = motionValue(0);
  const animation = animate(size, target, {
    ...rowSpring,
    onUpdate: (height) => {
      row.style.height = `${height}px`;
      entry.remaining = target - height;
      if (badge) badge.textContent = `slot ${height.toFixed(0)} → ${target}`;
      tick();
    },
    onComplete: () => {
      unregister();
      row.style.height = `${target}px`;
      delete row.dataset.entering;
      if (badge) badge.textContent = '';
      size.destroy();
      tick();
      done();
    },
  });
  animation.speed = speed;
  return {
    stop: () => {
      animation.stop();
      unregister();
      row.style.height = `${target}px`;
      delete row.dataset.entering;
      if (badge) badge.textContent = '';
      size.destroy();
    },
    setSpeed: (next) => {
      animation.speed = next;
    },
  };
}

const initialRows: WireRow[] = Array.from({ length: 60 }, (_, index) => ({
  id: `row-${index + 1}`,
  height: heightFor(index),
}));

function WireframeDemo({ interruptOnMouseDown = false }: { interruptOnMouseDown?: boolean }) {
  const [rows, setRows] = useState<WireRow[]>(initialRows);
  const [threshold, setThreshold] = useState(2);
  const [animationSpeed, setAnimationSpeed] = useState(1);
  const [animateRows, setAnimateRows] = useState(true);
  const [clearance, setClearance] = useState(0);
  const [scrollState, setScrollState] = useState<ScrollAnchorState>();
  const [anchorLabel, setAnchorLabel] = useState('none');
  const reducedMotion = useReducedMotion() === true;
  const handle = useRef<ScrollAnchorHandle>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const entrances = useRef(new Set<RowEntrance>());
  const previousRows = useRef(rows);
  const pendingFollow = useRef(false);
  const sequence = useRef(initialRows.length);
  const anchorRow = useRef<HTMLElement | null>(null);

  const registerRow = useCallback((row: HTMLDivElement | null) => {
    if (!row) return;
    const id = row.dataset.rowId!;
    rowRefs.current.set(id, row);
    return () => {
      rowRefs.current.delete(id);
    };
  }, []);

  useEffect(() => {
    const active = entrances.current;
    return () => {
      for (const entrance of active) entrance.stop();
      active.clear();
    };
  }, []);

  useEffect(() => {
    for (const entrance of entrances.current) entrance.setSpeed(Math.max(0.01, animationSpeed));
  }, [animationSpeed]);

  // Commit-time wiring: the DOM has the new rows; start their slots, then tell the
  // controller about the change with the intent recorded when the change was requested.
  useLayoutEffect(() => {
    if (previousRows.current === rows) return;
    const previousIds = new Set(previousRows.current.map((row) => row.id));
    previousRows.current = rows;
    const added = rows.filter((row) => !previousIds.has(row.id));
    const follow = pendingFollow.current;
    pendingFollow.current = false;
    const animated = animateRows && !reducedMotion && added.length > 0;
    if (animated) {
      for (const { id, height } of added) {
        const entrance: RowEntrance = enterRow(
          viewportRef.current!,
          rowRefs.current.get(id)!,
          height,
          Math.max(0.01, animationSpeed),
          () => handle.current?.layoutChanged({ animated: true }),
          () => entrances.current.delete(entrance)
        );
        entrances.current.add(entrance);
      }
    }
    handle.current?.layoutChanged({ follow, animated });
  }, [rows, animateRows, reducedMotion, animationSpeed]);

  useLayoutEffect(() => {
    handle.current?.layoutChanged({ clearance: true, animated: true });
  }, [clearance]);

  function nextRow(): WireRow {
    const index = sequence.current++;
    return { id: `row-${index + 1}`, height: heightFor(index) };
  }

  function append(follow: boolean) {
    pendingFollow.current = follow;
    setRows((previous) => [...previous, nextRow()]);
  }

  function prepend(count: number) {
    const inserted = Array.from({ length: count }, nextRow);
    setRows((previous) => [...inserted, ...previous]);
  }

  function insertBeforeLast() {
    setRows((previous) => [...previous.slice(0, -1), nextRow(), ...previous.slice(-1)]);
  }

  function resizeAnchorRow() {
    const id = anchorRow.current?.dataset.rowId;
    if (!id) return;
    setRows((previous) =>
      previous.map((row) => (row.id === id ? { ...row, height: row.height > 80 ? heightFor(0) : row.height * 2 } : row))
    );
  }

  return (
    <div className="flex size-full flex-col gap-3">
      <ScrollAnchor
        ref={handle}
        threshold={threshold}
        animationSpeed={animationSpeed}
        interruptOnMouseDown={interruptOnMouseDown}
        skipRow={(row) => 'entering' in row.dataset || row.dataset.slot === 'clearance'}
        onStateChange={(state) => {
          setScrollState(state);
          const anchor = handle.current?.captureAnchor();
          const row = anchor?.element ?? null;
          if (row !== anchorRow.current) {
            delete anchorRow.current?.dataset.anchor;
            if (row) row.dataset.anchor = '';
            anchorRow.current = row;
          }
          setAnchorLabel(anchor ? `#${row?.dataset.rowId ?? '?'} ↧ ${anchor.bottom.toFixed(1)} px` : 'none');
        }}
      >
        <div className="relative grid min-h-0 flex-1">
          <ScrollAnchorViewport
            ref={viewportRef}
            aria-label="Wireframe rows"
            className="col-start-1 row-start-1 size-full rounded-lg border border-dashed border-neutral-400 outline-none has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-1 has-[:focus-visible]:outline-neutral-400 data-[scroll-anchor-mode=animating]:border-sky-500 data-[scroll-anchor-mode=detached]:border-amber-500 dark:border-neutral-600"
          >
            <ScrollAnchorContent className="flex flex-col gap-2 p-3">
              {rows.map((row, index) => (
                <div
                  key={row.id}
                  ref={registerRow}
                  data-row-id={row.id}
                  className="box-border flex shrink-0 items-start justify-between gap-2 overflow-clip rounded-md border border-dashed border-neutral-400/80 px-2 py-1 font-mono text-[10px] leading-4 text-neutral-500 data-anchor:border-solid data-anchor:border-indigo-500 data-anchor:text-indigo-600 data-entering:border-sky-500 dark:border-neutral-600 dark:data-anchor:text-indigo-300"
                  style={{ height: row.height }}
                >
                  <span>
                    #{row.id.replace('row-', '')} · {index + 1}/{rows.length}
                  </span>
                  <span className="text-right">
                    <span data-row-slot="" className="block text-sky-600 dark:text-sky-400" />
                    {row.height}px
                  </span>
                </div>
              ))}
              {/* Stands in for a composer's clearance. At zero it also gives back its flex gap. */}
              <div
                data-slot="clearance"
                aria-hidden="true"
                className={cn('shrink-0 rounded-md', clearance > 0 && 'border border-dotted border-neutral-400/60')}
                style={{ height: clearance, marginTop: clearance ? undefined : -8 }}
              />
            </ScrollAnchorContent>
          </ScrollAnchorViewport>
          {scrollState?.mode === 'detached' && (
            <div className="pointer-events-none col-start-1 row-start-1 flex items-end justify-center p-3">
              <Button type="button" className="pointer-events-auto" onClick={() => handle.current?.scrollToBottom()}>
                Jump to latest
              </Button>
            </div>
          )}
        </div>
      </ScrollAnchor>
      <div className="flex shrink-0 flex-col items-center gap-2">
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={() => append(true)}>
            Append and follow
          </Button>
          <Button type="button" onClick={() => append(false)}>
            Append, keep reading
          </Button>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={() => prepend(5)}>
            Prepend 5 rows
          </Button>
          <Button type="button" onClick={insertBeforeLast}>
            Insert before last
          </Button>
          <Button type="button" onClick={resizeAnchorRow}>
            Resize anchor row
          </Button>
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-2 rounded-lg border border-neutral-500/20 p-3 text-xs leading-5 text-neutral-600 tabular-nums dark:text-neutral-400">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            State:{' '}
            <strong className="text-neutral-900 dark:text-neutral-100">{scrollState?.mode ?? 'following'}</strong>
          </span>
          <fieldset aria-label="Bottom zone" className="m-0 flex min-w-0 items-center gap-2 border-0 p-0">
            <span>Bottom zone</span>
            <Segmented
              options={[
                { value: 2, label: '2 px' },
                { value: 20, label: '20 px · debug' },
              ]}
              value={threshold}
              onChange={setThreshold}
            />
          </fieldset>
        </div>
        <fieldset
          aria-label="Animation speed"
          className="m-0 flex min-w-0 flex-wrap items-center justify-between gap-2 border-0 p-0"
        >
          <span>Animation speed</span>
          <Segmented
            options={[0.1, 0.25, 0.5, 0.75, 1].map((speed) => ({ value: speed, label: `${speed}×` }))}
            value={animationSpeed}
            onChange={setAnimationSpeed}
          />
        </fieldset>
        <fieldset
          aria-label="Trailing clearance"
          className="m-0 flex min-w-0 flex-wrap items-center justify-between gap-2 border-0 p-0"
        >
          <span>Trailing clearance</span>
          <Segmented
            options={[0, 56, 112].map((value) => ({ value, label: `${value} px` }))}
            value={clearance}
            onChange={setClearance}
          />
        </fieldset>
        <Toggle label="Animate row slots" checked={animateRows} onChange={setAnimateRows} />
        <div className="grid grid-cols-2 gap-x-4">
          <span>Following: {scrollState?.mode === 'detached' ? 'No' : 'Yes'}</span>
          <span>Near bottom: {scrollState?.nearBottom ? 'Yes' : 'No'}</span>
          <span>Distance: {scrollState?.distance.toFixed(2) ?? '0.00'} px</span>
          <span>Velocity: {scrollState?.velocity.toFixed(0) ?? '0'} px/s</span>
          <span>Position: {scrollState?.scrollTop.toFixed(2) ?? '0.00'} px</span>
          <span>Target: {scrollState?.target.toFixed(2) ?? '0.00'} px</span>
        </div>
        <span>Reading anchor: {anchorLabel}</span>
        <span>Last transition: {scrollState?.reason ?? 'Initial position'}</span>
      </div>
    </div>
  );
}

/** Dashed rows stand in for messages; every scroll, anchor and follow decision is the component's. */
export const Wireframe: Story = {
  render: () => <WireframeDemo />,
};

/** Opt-in policy: a mouse press on the viewport immediately yields following. Touch already interrupts catch-up. */
export const InterruptOnMouseDown: Story = {
  name: 'Detach Following State On Mouse Down',
  render: () => <WireframeDemo interruptOnMouseDown />,
};

function BareHookDemo() {
  const [count, setCount] = useState(40);
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [content, setContent] = useState<HTMLOListElement | null>(null);
  const previousCount = useRef(count);
  const anchor = useScrollAnchor(viewport, content);
  useLayoutEffect(() => {
    if (previousCount.current === count) return;
    previousCount.current = count;
    anchor.layoutChanged({ follow: true });
  }, [anchor, count]);
  return (
    <div className="flex size-full flex-col gap-3">
      <div
        ref={setViewport}
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- The scroll region needs keyboard access.
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-dashed border-neutral-400 [overflow-anchor:none] data-[scroll-anchor-mode=detached]:border-amber-500 dark:border-neutral-600"
      >
        <ol ref={setContent} className="m-0 flex list-none flex-col gap-2 p-3">
          {Array.from({ length: count }, (_, index) => (
            <li
              key={index}
              className="rounded-md border border-dashed border-neutral-400/80 px-2 py-1 font-mono text-[10px] leading-4 text-neutral-500 dark:border-neutral-600"
              style={{ height: heightFor(index) }}
            >
              #{index + 1}
            </li>
          ))}
        </ol>
      </div>
      <div className="flex justify-center gap-2">
        <Button type="button" onClick={() => setCount((previous) => previous + 1)}>
          Append and follow
        </Button>
        <Button type="button" onClick={() => anchor.scrollToBottom()}>
          Scroll to bottom
        </Button>
      </div>
    </div>
  );
}

/** The hook alone, on host-owned markup: an `ol` viewport with no compound parts. */
export const BareHook: Story = {
  render: () => <BareHookDemo />,
};
