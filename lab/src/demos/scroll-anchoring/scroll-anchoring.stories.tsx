import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScrollAnchoring } from './scroll-anchoring.js';

const meta: Meta = {
  title: 'Demos/ScrollAnchoring',
  id: 'scroll-anchoring',
};

export default meta;

export const Default: StoryObj = {
  render: () => <ScrollAnchoring />,
};
