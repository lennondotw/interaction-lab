import type { Meta, StoryObj } from '@storybook/react-vite';
import { OrbitTrack, OrbitTrackScrollScene } from './orbit-track.js';

const meta: Meta<typeof OrbitTrack> = {
  title: 'Animations/OrbitTrack',
  component: OrbitTrack,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof OrbitTrack>;

export const SelfDisplay: Story = {
  args: {
    debugShowBorder: true,
    debugShowFullCircle: false,
  },
  argTypes: {
    debugShowBorder: {
      control: 'boolean',
    },
    debugShowFullCircle: {
      control: 'boolean',
    },
  },
  render: (args) => (
    <div
      className={`
        w-full bg-neutral-50 py-20 text-neutral-950
        dark:bg-neutral-950 dark:text-neutral-50
      `}
    >
      <OrbitTrack {...args} scrollLinked={false} />
    </div>
  ),
};

export const ScrollLinked: Story = {
  args: {
    debugShowBorder: true,
    debugShowFullCircle: false,
  },
  argTypes: {
    debugShowBorder: {
      control: 'boolean',
    },
    debugShowFullCircle: {
      control: 'boolean',
    },
  },
  render: (args) => <OrbitTrackScrollScene {...args} />,
};
