import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ReactNode } from 'react';

import { ResizableWindow } from '#src/instruments/resizable-window/resizable-window.js';

import { TabBar, type TabBarItem } from './index.js';

interface DemoProps {
  initialCount: number;
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
          Shift Option <span className="inline-block font-sans">←</span>
        </Kbd>{' '}
        /{' '}
        <Kbd>
          Shift Option <span className="inline-block font-sans">→</span>
        </Kbd>{' '}
        switches tabs. Stops at either end.
      </p>
    </div>
  );
}

function Demo({ initialCount }: DemoProps) {
  const [state, setState] = useState(() => ({
    tabs: Array.from({ length: initialCount }, (_, index): TabBarItem => ({
      id: String(index + 1),
      title: `New tab ${index + 1}`,
    })),
    activeId: initialCount === 0 ? null : '1',
    nextId: initialCount + 1,
  }));

  return (
    <TabBar
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
