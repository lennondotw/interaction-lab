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
