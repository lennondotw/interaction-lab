import type { Meta, StoryObj } from '@storybook/react-vite';
import { SdfClipAndOutline } from './clip-and-outline.js';

/**
 * What a DOM consumer can actually *do* with the path, once `SvgPath` has established that
 * it survives leaving canvas: fill it, stroke an inner border along it, and clip live
 * content to it — all three off one traced `d`, sharing one `<defs>`.
 *
 * The inner border is the part worth the story. Two techniques disagree, and the `neck`
 * arrangement is here to show where: a clipped stroke is the outline pushed inward and
 * always returns one continuous band, while a second iso level is what "w px in from the
 * edge" actually means on a distance field and will break in two when the waist runs out.
 */
const meta: Meta = {
  title: 'Animations/SdfEdgeTrace/ClipAndOutline',
  id: 'sdf-edge-trace-clip-and-outline',
};

export default meta;

export const Default: StoryObj = {
  parameters: {
    layout: 'fullscreen',
  },
  render: () => <SdfClipAndOutline />,
};
