import type { Meta, StoryObj } from '@storybook/react-vite';
import { useRef, useState, type FC, type ReactNode } from 'react';
import { useArgs } from 'storybook/preview-api';

import { Segmented, Toggle } from '#src/instruments/controls/controls.js';
import { ResizableWindow } from '#src/instruments/resizable-window/resizable-window.js';

import { TabBar, type TabBarHoldState, type TabBarItem } from './index.js';
import { useTabLayoutDisplay } from './use-tab-layout-display.js';

interface DemoProps {
  initialCount: number;
  animationSpeed?: number;
  showInteractionLayer?: boolean;
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

const LayerExplanation: FC = () => (
  <p className="max-w-160 text-sm/6 text-neutral-600 dark:text-neutral-400">
    <strong>Presentation layer</strong> draws the animated tabs and detects visual hover feedback.{' '}
    <strong>Interaction layer</strong> stays at the final layout and handles clicks, keyboard activation, and focus, so
    the next close target is ready before the animation finishes. A moving visible X is also clickable. Turn on the
    overlay to see{' '}
    <span className="text-[oklch(0.439_0.06_230)] dark:text-[oklch(0.708_0.06_230)]">blue selection targets</span> and{' '}
    <span className="text-[oklch(0.439_0.06_75)] dark:text-[oklch(0.708_0.06_75)]">amber close and add targets</span>.
  </p>
);

function Demo({ initialCount, animationSpeed = 1, showInteractionLayer = false }: DemoProps) {
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
  const layout = useTabLayoutDisplay(root, state.tabs.length);

  return (
    <div
      ref={root}
      data-show-interaction={showInteractionLayer || undefined}
      className={`w-full
        data-show-interaction:[&_[data-tab-interaction-row]]:opacity-100
        data-show-interaction:[&_[data-tab-action]]:outline-1
        data-show-interaction:[&_[data-tab-action]]:-outline-offset-1
        data-show-interaction:[&_[data-tab-action]]:outline-dashed
        data-show-interaction:[&_[data-tab-action=select]]:bg-sky-500/10
        data-show-interaction:[&_[data-tab-action=select]]:outline-sky-500/60
        data-show-interaction:[&_[data-tab-action=close]]:bg-amber-500/20
        data-show-interaction:[&_[data-tab-action=close]]:outline-amber-500/70
        data-show-interaction:[&_[data-tab-action=add]]:bg-amber-500/20
        data-show-interaction:[&_[data-tab-action=add]]:outline-amber-500/70`}
    >
      <TabBar
        animationSpeed={animationSpeed}
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
    showInteractionLayer: {
      control: 'boolean',
      description: 'Reveal final-layout interaction rectangles over the animated presentation. Display only.',
    },
    animationSpeed: {
      control: { type: 'select' },
      options: [0.1, 0.25, 0.5, 1],
      description: 'Playback multiplier for tab motion. Hover and keyboard timers use real time.',
    },
  },
  args: { initialCount: 3, animationSpeed: 1, showInteractionLayer: false },
  render: (args) => {
    const [, updateArgs] = useArgs();
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center gap-4 px-4 py-8">
        <Demo key={args.initialCount} {...args} />
        <Toggle
          label="Show interaction layer"
          checked={args.showInteractionLayer ?? false}
          onChange={(showInteractionLayer) => updateArgs({ showInteractionLayer })}
        />
        <LayerExplanation />
        <ShortcutCaption />
      </div>
    );
  },
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

const ResizableDemo: FC<
  DemoProps & {
    onAnimationSpeedChange: (speed: number) => void;
    onShowInteractionLayerChange: (show: boolean) => void;
  }
> = ({
  initialCount,
  animationSpeed = 1,
  onAnimationSpeedChange,
  showInteractionLayer = false,
  onShowInteractionLayerChange,
}) => {
  return (
    <div className="flex min-h-screen flex-col items-start gap-4 p-8">
      <ResizableWindow
        title="Tab bar"
        label="Resizable tab bar container"
        resizeAxis="width"
        initialSize={{ width: 640, height: 'auto' }}
        minimumSize={{ width: 320, height: 0 }}
      >
        <Demo
          key={initialCount}
          initialCount={initialCount}
          animationSpeed={animationSpeed}
          showInteractionLayer={showInteractionLayer}
        />
      </ResizableWindow>
      <div className="flex flex-wrap items-center gap-4">
        <fieldset aria-label="Animation speed" className="m-0 flex flex-wrap items-center gap-3 border-0 p-0">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">Animation speed</span>
          <Segmented
            options={[0.1, 0.25, 0.5, 1].map((speed) => ({
              value: speed,
              label: speed === 1 ? '1.0×' : `${speed}×`,
            }))}
            value={animationSpeed}
            onChange={onAnimationSpeedChange}
          />
        </fieldset>
        <Toggle label="Show interaction layer" checked={showInteractionLayer} onChange={onShowInteractionLayerChange} />
      </div>
      <LayerExplanation />
      <ShortcutCaption />
    </div>
  );
};

export const Resizable: Story = {
  render: (args) => {
    const [, updateArgs] = useArgs();
    return (
      <ResizableDemo
        {...args}
        onAnimationSpeedChange={(animationSpeed) => updateArgs({ animationSpeed })}
        onShowInteractionLayerChange={(showInteractionLayer) => updateArgs({ showInteractionLayer })}
      />
    );
  },
};

export const HoverHolds: Story = {
  ...Resizable,
  args: { initialCount: 8 },
};
