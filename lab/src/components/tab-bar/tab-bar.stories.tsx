import type { Meta, StoryObj } from '@storybook/react-vite';
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

import { ResizableWindow } from '#src/instruments/resizable-window/resizable-window.js';

import { TabBar, type TabBarHoldState, type TabBarItem } from './index.js';

interface DemoProps {
  initialCount: number;
}

// Storybook instrumentation only: classify destinations, not transient animation footprints.
function useLayoutDisplay(root: RefObject<HTMLDivElement | null>, tabCount: number) {
  const [layout, setLayout] = useState<{ compressed: boolean; hasSpace: boolean } | null>(null);
  useLayoutEffect(() => {
    const target = root.current!.querySelector<HTMLElement>('[data-tab-target-layout]')!;
    const measure = () => {
      const tabs = Array.from(target.querySelectorAll('[data-tab-target]'));
      const widths = tabs.map((tab) => parseFloat(tab.getAttribute('data-tab-width-target')!));
      // A CSS pixel of tolerance absorbs fractional flex layout rounding.
      const compressed = tabs.some((tab, index) => widths[index]! < parseFloat(getComputedStyle(tab).flexBasis) - 1);
      const gap = parseFloat(getComputedStyle(target).columnGap);
      const addWidth = parseFloat(getComputedStyle(target.lastElementChild!).width);
      const occupied = widths.reduce((sum, width) => sum + width, 0) + tabs.length * gap + addWidth;
      const hasSpace = occupied < target.getBoundingClientRect().width - 1;
      setLayout((previous) =>
        previous?.compressed === compressed && previous.hasSpace === hasSpace ? previous : { compressed, hasSpace }
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    const mutations = new MutationObserver(measure);
    mutations.observe(target, { subtree: true, attributes: true, attributeFilter: ['data-tab-width-target'] });
    measure();
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [root, tabCount]);
  return layout;
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      className={`inline-flex h-5 items-center rounded border border-neutral-300 bg-neutral-100
      px-1.5 font-mono text-[11px] dark:border-neutral-700 dark:bg-neutral-800`}
    >
      <span>{children}</span>
    </kbd>
  );
}

function ShortcutCaption() {
  return (
    <div className="max-w-160 space-y-2 text-center text-sm/6 text-neutral-600 dark:text-neutral-400">
      <p>
        <Kbd>Shift T</Kbd> adds a tab. <Kbd>Shift W</Kbd> closes the current tab.
      </p>
      <p>
        <Kbd>
          Shift <span className="inline-block font-sans">←</span>
        </Kbd>{' '}
        /{' '}
        <Kbd>
          Shift <span className="inline-block font-sans">→</span>
        </Kbd>{' '}
        switches tabs. Stops at either end. Option also works.
      </p>
      <p>
        Hold to repeat switching or closing. <Kbd>Shift T</Kbd> adds once per press.
      </p>
    </div>
  );
}

function Demo({ initialCount }: DemoProps) {
  const root = useRef<HTMLDivElement>(null);
  const [holdState, setHoldState] = useState<TabBarHoldState>('natural');
  const [state, setState] = useState(() => ({
    tabs: Array.from({ length: initialCount }, (_, index): TabBarItem => ({
      id: String(index + 1),
      title: `New tab ${index + 1}`,
    })),
    activeId: initialCount === 0 ? null : '1',
    nextId: initialCount + 1,
  }));
  const layout = useLayoutDisplay(root, state.tabs.length);

  return (
    <div ref={root} className="w-full">
      <TabBar
        onHoldStateChange={setHoldState}
        tabs={state.tabs}
        activeId={state.activeId}
        onSelect={(activeId) => setState((previous) => ({ ...previous, activeId }))}
        onAdd={() =>
          setState((previous) => ({
            tabs: [...previous.tabs, { id: String(previous.nextId), title: `New tab ${previous.nextId}` }],
            activeId: String(previous.nextId),
            nextId: previous.nextId + 1,
          }))
        }
        onClose={(id) =>
          setState((previous) => {
            const index = previous.tabs.findIndex((tab) => tab.id === id);
            const tabs = previous.tabs.filter((tab) => tab.id !== id);
            const activeId =
              previous.activeId === id
                ? tabs.length === 0
                  ? null
                  : tabs[Math.min(index, tabs.length - 1)]!.id
                : previous.activeId;
            return { ...previous, tabs, activeId };
          })
        }
      />
      <div className="mt-3 font-mono text-xs text-neutral-700 dark:text-neutral-300" data-testid="tab-hold-status">
        <p>
          status: <strong>{holdState}</strong>
          {layout !== null && (
            <>
              {' · '}size: <strong>{layout.compressed ? 'compressed' : 'natural'}</strong>
              {' · '}space: <strong>{layout.hasSpace ? 'available' : 'full'}</strong>
            </>
          )}
        </p>
        <p className="text-neutral-500 dark:text-neutral-400">
          {holdState === 'holding'
            ? 'Pointer is in the tab strip. Closing holds the tab widths.'
            : holdState === 'waiting'
              ? 'Pointer left. Natural widths resume after the hold is released.'
              : 'Tabs use their natural widths, up to their base size.'}
        </p>
      </div>
    </div>
  );
}

const meta: Meta<typeof Demo> = {
  title: 'Components/Tab bar',
  component: Demo,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    initialCount: {
      control: { type: 'range', min: 0, max: 12, step: 1 },
      description: 'Starting tab count. Changing this resets the demo.',
    },
  },
  args: { initialCount: 3 },
  render: (args) => (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center gap-4 px-4 py-8">
      <Demo key={args.initialCount} {...args} />
      <ShortcutCaption />
    </div>
  ),
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Compressed: Story = {
  args: { initialCount: 8 },
};

export const Empty: Story = {
  args: { initialCount: 0 },
};

export const Resizable: Story = {
  render: (args) => (
    <div className="flex min-h-screen flex-col items-start gap-4 p-8">
      <ResizableWindow
        title="Tab bar"
        label="Resizable tab bar container"
        resizeAxis="width"
        initialSize={{ width: 640, height: 'auto' }}
        minimumSize={{ width: 320, height: 0 }}
      >
        <Demo key={args.initialCount} {...args} />
      </ResizableWindow>
      <ShortcutCaption />
    </div>
  ),
};

export const HoverHolds: Story = {
  ...Resizable,
  args: { initialCount: 8 },
};
