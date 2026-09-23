import type { Meta, StoryObj } from '@storybook/react-vite';

import { VirtualCorePlayground } from './debug/virtual-core-playground.js';

/**
 * A wireframe view of the headless virtual core. The list scrolls natively with
 * `overflow-anchor: none` and has no anchoring of its own, so what you see is the core's raw
 * layout: rows sit where the core puts them, and a row resized above the viewport moves the
 * content below it. Rows report their size through a ResizeObserver; the minimap shows every
 * row the core knows, measured or estimated, with the render range, the visible range and the
 * viewport. Drag on the minimap to scroll, and drag the window's edges or corner to resize the
 * viewport.
 */
const meta: Meta<typeof VirtualCorePlayground> = {
  title: 'Components/Chat history list/Virtual core',
  component: VirtualCorePlayground,
  parameters: { layout: 'fullscreen' },
  args: {
    initialCount: 200,
    estimateSize: 80,
    overscanKind: 'pixels',
    overscanBefore: 600,
    overscanAfter: 600,
    seed: 1,
  },
  argTypes: {
    initialCount: { control: { type: 'range', min: 0, max: 2000, step: 10 } },
    estimateSize: { control: { type: 'range', min: 10, max: 400, step: 5 } },
    overscanKind: { control: 'inline-radio', options: ['none', 'pixels', 'items', 'directional'] },
    overscanBefore: { control: { type: 'range', min: 0, max: 4000, step: 10 } },
    overscanAfter: { control: { type: 'range', min: 0, max: 4000, step: 10 } },
    seed: { control: { type: 'range', min: 1, max: 100, step: 1 } },
  },
  // Rows, estimate and seed are fixed for a core's lifetime; remount when they change.
  render: (args) => <VirtualCorePlayground key={`${args.initialCount}:${args.estimateSize}:${args.seed}`} {...args} />,
};

export default meta;

type Story = StoryObj<typeof VirtualCorePlayground>;

export const Pixels: Story = {};

/** Whole rows on each side, however tall they are. */
export const Items: Story = {
  args: { overscanKind: 'items', overscanBefore: 5, overscanAfter: 5 },
};

/**
 * A custom strategy: `after` pixels in the direction of the last scroll, `before` behind it.
 * Scroll up and down and watch the render range flip sides in the minimap.
 */
export const Directional: Story = {
  args: { overscanKind: 'directional', overscanBefore: 300, overscanAfter: 1800 },
};

/** No overscan: the render range is exactly the visible range. */
export const None: Story = {
  args: { overscanKind: 'none' },
};

/** A poor estimate makes unmeasured space visibly wrong until each row is mounted once. */
export const PoorEstimate: Story = {
  args: { estimateSize: 20, initialCount: 1000 },
};
