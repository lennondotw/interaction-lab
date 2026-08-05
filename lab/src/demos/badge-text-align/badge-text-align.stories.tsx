import type { Meta, StoryObj } from '@storybook/react-vite';
import { BadgeTextAlign } from './badge-text-align.js';

const meta: Meta = {
  title: 'Demos/BadgeTextAlign',
};

export default meta;

export const Default: StoryObj = {
  render: () => <BadgeTextAlign />,
};
