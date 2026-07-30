import type { Meta, StoryObj } from '@storybook/react-vite';
import { SdfEdgeTrace } from './sdf-edge-trace.js';

const meta: Meta = {
  title: 'Animations/SdfEdgeTrace',
  id: 'sdf-edge-trace',
};

export default meta;

export const Default: StoryObj = {
  parameters: {
    layout: 'fullscreen',
  },
  render: () => <SdfEdgeTrace />,
};
