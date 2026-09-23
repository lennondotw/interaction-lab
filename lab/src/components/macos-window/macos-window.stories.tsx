import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FC, ReactNode } from 'react';

import { MACOS_WINDOW_SIZES, MacOSWindow, type MacOSWindowVariant } from './index.js';

/** Centers the window on the page with room for its drop shadow. */
const Desktop: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="flex min-h-screen items-center justify-center p-12">{children}</div>
);

const Label: FC<{ children: ReactNode }> = ({ children }) => (
  <div
    className={`
      flex h-full items-center justify-center text-sm text-neutral-500
      dark:text-neutral-400
    `}
  >
    {children}
  </div>
);

const meta = {
  title: 'Components/macOS window',
  component: MacOSWindow,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <Desktop>
        <Story />
      </Desktop>
    ),
  ],
  argTypes: {
    variant: { control: 'inline-radio', options: ['basic', 'rounded'] satisfies MacOSWindowVariant[] },
    children: { control: false },
  },
  args: {
    className: 'max-w-full',
    style: MACOS_WINDOW_SIZES.small,
  },
} satisfies Meta<typeof MacOSWindow>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Radius 16, lights at (9, 9) in a 32px title strip. */
export const Basic: Story = {
  args: {
    variant: 'basic',
    children: <Label>basic · radius 16</Label>,
  },
};

/** Radius 26, lights pushed in to (19, 19) in a 52px title strip. */
export const Rounded: Story = {
  args: {
    variant: 'rounded',
    children: <Label>rounded · radius 26</Label>,
  },
};

/** An opaque 32px title bar behind the lights, with a hairline under it; content starts below. */
export const WithTitleBar: Story = {
  args: {
    variant: 'basic',
    titleBar: true,
    children: <Label>basic · title bar</Label>,
  },
};
