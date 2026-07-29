import type { Meta, StoryObj } from '@storybook/react-vite';
import { DebugElasticScale } from './debug-elastic-scale.js';

const meta = {
  title: 'Animations/ElasticScale',
  component: DebugElasticScale,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    itemCount: { control: { type: 'range', min: 3, max: 40, step: 1 } },
    itemSize: {
      control: { type: 'range', min: 8, max: 48, step: 1 },
      description: 'Size of one slot along the axis — bar height plus its gap.',
    },
    maxScale: {
      control: { type: 'range', min: 1, max: 5, step: 0.1 },
      description: 'Scale factor applied to the item directly under the cursor.',
    },
    sigma: {
      control: { type: 'range', min: 5, max: 120, step: 1 },
      description: 'Spread of the Gaussian in pixels — how far the stretch reaches.',
    },
  },
} satisfies Meta<typeof DebugElasticScale>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story:
          'Defaults: `maxScale` 2.5 over a `sigma` of 35px. Hover the red dashed box — the dashed slots stay put so you can see how far each item has been carried from its resting position.',
      },
    },
  },
};

export const SubtleZoom: Story = {
  args: { itemCount: 15, maxScale: 1.5, sigma: 30 },
  parameters: {
    docs: {
      description: {
        story:
          'A restrained magnification. Neighbours barely move, so the effect reads as emphasis rather than motion.',
      },
    },
  },
};

export const WideInfluence: Story = {
  args: { itemCount: 15, maxScale: 2, sigma: 60 },
  parameters: {
    docs: {
      description: {
        story:
          'Doubling `sigma` spreads the stretch across many more items, so the whole column bows around the cursor instead of just the nearest few.',
      },
    },
  },
};
