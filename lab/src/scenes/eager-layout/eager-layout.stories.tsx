import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  EagerLayout,
  EagerLayoutSideBySide,
  EagerLayoutWithoutAnimation,
  EagerLayoutWithoutEager,
} from './eager-layout.js';

const meta: Meta = {
  title: 'Scenes/Eager layout',
  id: 'eager-layout',
};

export default meta;

export const Eager: StoryObj = {
  parameters: {
    layout: 'fullscreen',
  },
  render: () => <EagerLayout />,
};

export const WithoutEager: StoryObj = {
  render: () => <EagerLayoutWithoutEager />,
};

export const WithoutAnimation: StoryObj = {
  render: () => <EagerLayoutWithoutAnimation />,
};

export const SideBySide: StoryObj = {
  render: () => <EagerLayoutSideBySide />,
};
