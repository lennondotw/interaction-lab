import type { Meta, StoryObj } from '@storybook/react-vite';
import { DigitalCrown } from './digital-crown.js';

const meta: Meta = {
  title: 'Animations/DigitalCrown',
};

export default meta;

export const Default: StoryObj = {
  render: () => <DigitalCrown />,
};
