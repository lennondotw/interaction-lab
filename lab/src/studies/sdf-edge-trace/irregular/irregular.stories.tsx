import type { Meta, StoryObj } from '@storybook/react-vite';

import { SdfIrregularShapes } from './irregular-trace.js';

/**
 * Triangles, stars, irregular polygons and curved blobs — the shapes the box family cannot
 * reach at any exponent.
 *
 * All seven come from one primitive, `FieldShape.points`: a polygon with an outward offset.
 * The offset is what unifies them — a coarse polygon with a large one is a curved blob, and
 * pushed far enough it closes a star's notches over entirely, which changes the contour's
 * topology rather than just smoothing it.
 *
 * `verify` measures every traced vertex against an independent reading of the same field, so
 * the concave sign test and the quadtree's cull are checked rather than asserted.
 */
const meta: Meta = {
  title: 'Studies/SDF edge trace/Irregular shapes',
  id: 'sdf-edge-trace-irregular-shapes',
};

export default meta;

export const Default: StoryObj = {
  parameters: {
    layout: 'fullscreen',
  },
  render: () => <SdfIrregularShapes />,
};
