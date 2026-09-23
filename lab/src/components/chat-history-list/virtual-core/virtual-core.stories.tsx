import type { Meta, StoryObj } from '@storybook/react-vite';

import { VirtualCorePlayground } from './debug/virtual-core-playground.js';

/**
 * A wireframe view of the headless virtual core and the anchoring on top of it. The list
 * scrolls natively with the browser's `overflow-anchor` turned off; with `anchoring` on, every
 * layout change holds the row at the reference line still, using positions from the core. Rows
 * report their size through one ResizeObserver shared with the scroller; the minimap shows
 * every row the core knows, measured or estimated, with the render range, the visible range,
 * the viewport, and the anchor row. Drag on the minimap to scroll, and drag the window's edges
 * or corner to resize the viewport.
 *
 * `layout` switches in place between rows in normal flow between spacers and rows positioned
 * absolutely; anchoring works the same in both, and the state panel's DOM residual shows
 * whether the DOM agrees with the core.
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
    layout: 'flow',
    anchoring: true,
    anchorRatio: 0,
  },
  argTypes: {
    initialCount: { control: { type: 'range', min: 0, max: 2000, step: 10 } },
    estimateSize: { control: { type: 'range', min: 10, max: 400, step: 5 } },
    overscanKind: { control: 'inline-radio', options: ['none', 'pixels', 'items', 'directional'] },
    overscanBefore: { control: { type: 'range', min: 0, max: 4000, step: 10 } },
    overscanAfter: { control: { type: 'range', min: 0, max: 4000, step: 10 } },
    seed: { control: { type: 'range', min: 1, max: 100, step: 1 } },
    layout: { control: 'inline-radio', options: ['flow', 'absolute'] },
    anchorRatio: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
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

/** Rows positioned at the core's offsets instead of in normal flow. */
export const Absolute: Story = {
  args: { layout: 'absolute' },
};

/** The reference line at the middle of the viewport. */
export const CenterAnchor: Story = {
  args: { anchorRatio: 0.5 },
};

/** The reference line at the bottom: the bottom edge holds, as in a chat list. */
export const BottomAnchor: Story = {
  args: { anchorRatio: 1 },
};

/** The core's raw layout: rows above the viewport that change size move what you see. */
export const Unanchored: Story = {
  args: { anchoring: false },
};

/** A poor estimate makes unmeasured space visibly wrong until each row is mounted once. */
export const PoorEstimate: Story = {
  args: { estimateSize: 20, initialCount: 1000 },
};
