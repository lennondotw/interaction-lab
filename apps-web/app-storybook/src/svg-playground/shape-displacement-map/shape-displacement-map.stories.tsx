import type { Meta, StoryObj } from '@storybook/react-vite';
import { ShapeDisplacementMap } from './shape-displacement-map.js';

/**
 * A displacement map drawn for an arbitrary shape, one static frame each.
 *
 * The older `SvgDisplacementMap` story builds its map from a radial falloff, which only
 * works for a circle: it assumes the surface normal is the radial direction. This one
 * reads the normal off a signed distance field, so the same code path handles a triangle,
 * a five-point star, an irregular curve, and every member of the repo's own continuous
 * corner family — including the asymmetric radii and the max-radius case that is why
 * `ContinuousCircle` exists as a separate component.
 *
 * The clip comes from the field too, not from a stated path, because a p-norm corner has
 * no closed form to state — which also means the clip cannot disagree with the refraction
 * inside it.
 *
 * Dispersion is out of scope on purpose. See `archive/2026-08-liquid-glass-internals` for
 * what Apple does with the other two channels: six taps with overlapping triangular
 * weights, not three RGB point samples.
 */
const meta: Meta = {
  title: 'SVG Playground/ShapeDisplacementMap',
  id: 'svg-playground-shape-displacement-map',
};

export default meta;

export const Default: StoryObj = {
  parameters: {
    layout: 'fullscreen',
  },
  render: () => <ShapeDisplacementMap />,
};
