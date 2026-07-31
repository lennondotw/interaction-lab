import type { Meta, StoryObj } from '@storybook/react-vite';
import { SdfRectField } from './rect-field.js';

/**
 * The last panel of the arc. The other three vary where the contour goes and keep the
 * sources fixed as draggable balls; this one varies the sources — they are ordinary flex
 * children, and the field's primitives are the rects the layout gave them.
 *
 * The tracer's instrumentation stays exposed, which is what `Components/MetaSurface`
 * deliberately hides: the quadtree overlay over real rects, and a `fit domain` toggle that
 * reproduces the domain-sizing cliff live.
 */
const meta: Meta = {
  title: 'Animations/SdfEdgeTrace/RectField',
  id: 'sdf-edge-trace-rect-field',
};

export default meta;

export const Default: StoryObj = {
  parameters: {
    layout: 'fullscreen',
  },
  render: () => <SdfRectField />,
};
