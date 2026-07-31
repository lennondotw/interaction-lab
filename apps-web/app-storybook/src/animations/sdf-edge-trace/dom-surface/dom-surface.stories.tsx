import type { Meta, StoryObj } from '@storybook/react-vite';
import { SdfDomSurface } from './dom-surface.js';

/**
 * The contour as a DOM citizen: one `d` feeding a fill, an inner border, and a
 * `clip-path` over live content. Nothing here touches layout, so the story is
 * really about the two things that are left — which technique an inner border
 * should use, and what a clip that moves every frame costs the subtree under it.
 */
const meta: Meta = {
  title: 'Animations/SdfEdgeTrace/DomSurface',
  id: 'sdf-edge-trace-dom-surface',
};

export default meta;

export const Default: StoryObj = {
  parameters: {
    layout: 'fullscreen',
  },
  render: () => <SdfDomSurface />,
};
