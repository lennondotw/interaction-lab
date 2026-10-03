import type { Meta, StoryObj } from '@storybook/react-vite';

import { ResizableWindow } from './resizable-window.js';

/**
 * A window frame whose width and height are dragged from its right edge, bottom edge or
 * corner, for stories whose subject has to be seen at many sizes. Arrow keys resize a focused
 * handle (Shift for 10px steps) and Escape cancels a drag. The header shows the current size.
 */
const meta: Meta<typeof ResizableWindow> = {
  title: 'Instruments/Resizable window',
  component: ResizableWindow,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    children: { control: false },
    resizeAxis: { control: 'select', options: ['width', 'height', 'both'] },
  },
  args: { resizeAxis: 'both' },
  // The sizes are read once on mount; remount when they change so Controls take effect.
  render: (args) => (
    <div className="flex min-h-svh items-start p-8">
      <ResizableWindow key={JSON.stringify([args.initialSize, args.minimumSize])} {...args}>
        <div
          className={`
            flex size-full items-center justify-center rounded-sm border border-dashed border-neutral-500/40
            text-xs text-neutral-500
          `}
        >
          Content fills the window body
        </div>
      </ResizableWindow>
    </div>
  ),
};

export default meta;

type Story = StoryObj<typeof ResizableWindow>;

/** The defaults the chat stories use. */
export const Default: Story = {};

export const Horizontal: Story = {
  args: { resizeAxis: 'width' },
};

export const Vertical: Story = {
  args: { resizeAxis: 'height' },
};

export const AutoHeight: Story = {
  args: { initialSize: { width: 560, height: 'auto' }, resizeAxis: 'width' },
  render: (args) => (
    <div className="flex min-h-svh items-start p-8">
      <ResizableWindow key={JSON.stringify([args.initialSize, args.minimumSize])} {...args}>
        <p className="text-sm/6 text-neutral-600 dark:text-neutral-400">
          Drag the right edge to change the width. The window follows the height of its content as this text wraps,
          without a fixed height or a vertical resize handle.
        </p>
      </ResizableWindow>
    </div>
  ),
};

/** A custom title, accessible name, starting size and minimum size. */
export const Custom: Story = {
  args: {
    title: 'Virtual core · Resizable window',
    label: 'Resizable list window',
    initialSize: { width: 380, height: 560 },
    minimumSize: { width: 340, height: 200 },
  },
};
