import type { Meta, StoryObj } from '@storybook/react-vite';
import type { MotionValue } from 'motion/react';

import { StickyScrollScene } from './sticky-scroll-scene.js';
import { TextRevealSpecimen } from './text-reveal-specimen.js';

const meta: Meta<typeof StickyScrollScene> = {
  title: 'Animations/StickyScrollRemapping',
  component: StickyScrollScene,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof StickyScrollScene>;

const renderSpecimen = (progress: MotionValue<number>) => (
  <TextRevealSpecimen
    className={`
      text-[28px]/[1.38] font-normal tracking-normal
      sm:text-[42px]/[1.32]
    `}
    progress={progress}
  />
);

const renderColoredSpecimen = (progress: MotionValue<number>) => (
  <div
    className={`
      text-[var(--progressive-text-inactive)]
      [--progressive-text-active-1:#0ea5e9]
      [--progressive-text-active-2:#10b981]
      [--progressive-text-active-3:#8b5cf6]
      [--progressive-text-active-4:#f43f5e]
      [--progressive-text-inactive:#171717]
      dark:[--progressive-text-active-1:#7dd3fc] dark:[--progressive-text-active-2:#6ee7b7]
      dark:[--progressive-text-active-3:#c4b5fd] dark:[--progressive-text-active-4:#fda4af]
      dark:[--progressive-text-inactive:#e5e5e5]
    `}
  >
    <TextRevealSpecimen
      className={`
        text-[28px]/[1.38] font-normal tracking-normal
        sm:text-[42px]/[1.32]
      `}
      progress={progress}
      colorHighlights={[
        { color: 'var(--progressive-text-active-1)', paragraphIndex: 0, text: 'adipiscing elit' },
        { color: 'var(--progressive-text-active-2)', paragraphIndex: 0, text: 'facilisis posuere' },
        { color: 'var(--progressive-text-active-3)', paragraphIndex: 1, text: 'tristique velit' },
        { color: 'var(--progressive-text-active-4)', paragraphIndex: 1, text: 'sapien in cursus' },
      ]}
      textProps={{
        colorGradientWidth: 1,
        gradientWidth: 6,
        inactiveColor: 'var(--progressive-text-inactive)',
      }}
    />
  </div>
);

export const NativeSticky: Story = {
  args: {
    children: renderSpecimen,
    remap: false,
  },
};

export const SmoothRemap: Story = {
  args: {
    children: renderSpecimen,
    remap: true,
  },
};

export const SmoothRemapWithColor: Story = {
  args: {
    children: renderColoredSpecimen,
    remap: true,
  },
};
