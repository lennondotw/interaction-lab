import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentProps, FC } from 'react';
import type { GlassLook } from './glass-look.js';
import { SHAPE_IDS, shapeById, type ShapeId } from './shape-catalogue.js';
import { ShapeGallery } from './shape-gallery.js';
import { ShapeGlass } from './shape-glass.js';

type Story = StoryObj<typeof ShapeGlass>;

/** Keeps a single card from stretching to the canvas width. */
const StagedGlass: FC<ComponentProps<typeof ShapeGlass>> = (props) => (
  <div className="flex w-full items-center justify-center p-4">
    <div className="w-[19rem]">
      <ShapeGlass {...props} />
    </div>
  </div>
);

/**
 * A displacement map drawn from a signed distance field, one shape at a time.
 *
 * The older `SvgDisplacementMap` builds its map as a radial falloff, which only ever worked for a
 * circle: it assumes the surface normal is the radial direction, and it has no scale to it, so
 * changing an element's size changes the look. Reading the normal off a field instead puts a
 * triangle, a five-point star, an irregular curve and every member of the repo's own continuous
 * corner family on one code path.
 *
 * The chain is SDF → bevel height → normal → Snell → landing offset → R/G, so every arg below is
 * a physical quantity rather than a tuning constant. Push `ior` to 1 and the refraction vanishes;
 * push `depth` and it scales; `bevel` is the only one that changes *where* around the rim the
 * effect lives rather than how strong it is.
 *
 * Dispersion is out of scope on purpose. `archive/2026-08-liquid-glass-internals` has what Apple
 * does with the other two channels — six taps with overlapping triangular weights, not three RGB
 * point samples — and `archive/2026-08-displacement-map-reuse` covers when a map like this can be
 * cached instead of rebuilt.
 */
const meta: Meta<typeof ShapeGlass> = {
  title: 'SVG Playground/ShapeDisplacementMap',
  id: 'svg-playground-shape-displacement-map',
  component: ShapeGlass,
  parameters: { layout: 'centered' },
  // Set once here so a single-shape story is nothing but its args and its reason for existing.
  render: (args) => <StagedGlass {...args} />,
  argTypes: {
    shape: { control: 'select', options: SHAPE_IDS },
    size: { control: { type: 'range', min: 120, max: 420, step: 20 } },
    bevel: { control: { type: 'range', min: 2, max: 70, step: 1 } },
    thickness: { control: { type: 'range', min: 1, max: 70, step: 1 } },
    depth: { control: { type: 'range', min: 0, max: 240, step: 5 } },
    ior: { control: { type: 'range', min: 1, max: 2.4, step: 0.01 } },
    showOutline: { control: 'boolean' },
    showChannels: { control: 'boolean' },
    showStats: { control: 'boolean' },
    showCaption: { control: 'boolean' },
  },
  args: {
    shape: 'continuous-corner',
    size: 260,
    bevel: 26,
    thickness: 26,
    depth: 70,
    ior: 1.5,
    showOutline: false,
    showChannels: true,
    showStats: true,
    showCaption: true,
  },
};

export default meta;

/** Every arg live, on Apple's corner. Start here and drag things. */
export const Default: Story = {};

/**
 * The one case a radial falloff also gets right, because a circle's normal *is* its radial
 * direction. It is the control: whatever the field-based map does here, the old approach agreed.
 */
export const Circle: Story = { args: { shape: 'circle' } };

/** Plain `border-radius`. Straight edges refract uniformly, so the corners are the only story. */
export const RoundedRect: Story = { args: { shape: 'rounded-rect' } };

/**
 * The p-norm corner at n = 4 — CSS `corner-shape: squircle`. Compare its rim band against
 * `RoundedRect`: curvature is carried further along the edge, and the band shows it.
 *
 * This is also the shape with no stated outline, because a p-norm corner has no closed form in
 * this repo. `showOutline` therefore does nothing here, and the clip still fits, because the clip
 * comes from the field rather than from a path.
 */
export const Superellipse: Story = { args: { shape: 'superellipse' } };

/**
 * Apple's curve: three cubics per corner reaching 1.528665r along each edge, flattened out of the
 * same `squircleCorners` the shipping component calls.
 */
export const ContinuousCorner: Story = { args: { shape: 'continuous-corner' } };

/**
 * The same curve with 12 and 68 on opposite corners. Nothing in the pipeline knows the corners
 * differ — the field does, so the map does, with no per-corner code anywhere.
 */
export const ContinuousMixedRadii: Story = { args: { shape: 'continuous-mixed' } };

/** `ContinuousCapsule`: Apple's corner at the maximum radius a wide box allows. */
export const ContinuousCapsule: Story = { args: { shape: 'continuous-capsule' } };

/**
 * The same maximum radius in a *square* box, which is why `ContinuousCircle` exists as its own
 * component: Apple's curve here is not quite round, it undulates. Turn `showOutline` on and the
 * rim band visibly breathes where a circle's would be constant.
 */
export const ContinuousAtMaxRadius: Story = {
  args: { shape: 'continuous-max-square', showOutline: true },
};

/**
 * Sharp 60° corners, where the normal swings by 120° across a vertex. The gradient is a central
 * difference, so it averages the two faces instead of picking one — which is why the corner reads
 * as a crease rather than as a tear.
 */
export const Triangle: Story = { args: { shape: 'triangle' } };

/**
 * Five reflex vertices. A notch sits outside the polygon while being inside its hull, so this only
 * comes out right because inside-ness is a crossing count and not a nearest-edge side test.
 */
export const Star: Story = { args: { shape: 'star5' } };

/**
 * 48 vertices on two seeded sinusoids, dense enough that no straight edge survives. An arbitrary
 * smooth outline needs nothing the others did not: the field is the whole interface.
 */
export const IrregularCurve: Story = { args: { shape: 'blob' } };

/**
 * `ior` at 1.0 — air. Snell's law degenerates, the ray goes straight through, and the map is flat
 * grey. The control that shows the refraction really is coming from the physics and not from the
 * bevel's shape.
 */
export const NoRefraction: Story = {
  args: { ior: 1, showOutline: true },
};

/**
 * A rim narrow against the shape. The refraction is confined to a hairline and the interior is
 * untouched, which is the regime a UI-sized glass actually sits in.
 */
export const NarrowBevel: Story = { args: { bevel: 6, thickness: 10 } };

/**
 * The opposite: a bevel wide enough that there is barely a flat top left, so nearly every pixel
 * is refracting. Watch `step` in the readout — the encoding's quantisation floor grows with the
 * peak, and this is where banding starts to show.
 */
export const WideBevel: Story = { args: { bevel: 64, thickness: 48, depth: 140 } };

/**
 * Fixed parameters for the two aggregate views.
 *
 * Stated here rather than taken from args because those views are references, and a reference
 * that moves is not one: the numbers under every card are only comparable across shapes if the
 * glass is identical, and they are only comparable across *sessions* if nobody has been dragging
 * a slider.
 */
const GALLERY_LOOK: GlassLook = {
  size: 200,
  bevel: 26,
  thickness: 26,
  depth: 70,
  ior: 1.5,
  showOutline: false,
  showChannels: true,
  showStats: true,
  showCaption: true,
};

/**
 * Every shape at once, at fixed parameters.
 *
 * Deliberately not args-driven. `shape` is this component's main arg and means nothing to a
 * gallery, so a controls panel here would offer one knob that does nothing and nine that quietly
 * apply to ten cards at once. Exploring parameters is what the single-shape stories are for; this
 * is the reference they get compared against, and it is more useful for holding still.
 */
export const AllShapes: Story = {
  parameters: { layout: 'fullscreen', controls: { disable: true } },
  render: () => (
    <div className="p-4">
      <ShapeGallery {...GALLERY_LOOK} />
    </div>
  ),
};

/**
 * The catalogue as a table: what each shape is for, next to the map it produces.
 *
 * Deliberately not the gallery — that one is for comparing the *effect* at a glance, this one is
 * for reading why a shape is in the list at all.
 */
export const Catalogue: Story = {
  parameters: { layout: 'fullscreen', controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-3 p-4">
      {SHAPE_IDS.map((id: ShapeId) => (
        <div key={id} className="flex flex-row items-start gap-4">
          <div className="w-40 shrink-0">
            <ShapeGlass
              {...GALLERY_LOOK}
              shape={id}
              size={150}
              showChannels={false}
              showStats={false}
              showCaption={false}
            />
          </div>
          <div className="flex flex-col gap-1 pt-1">
            <span className="text-sm font-medium">{shapeById(id).label}</span>
            <span className="font-mono text-[10px] text-neutral-400">{id}</span>
            <p
              className={`
                max-w-2xl text-[11px] leading-snug text-neutral-500
                dark:text-neutral-400
              `}
            >
              {shapeById(id).note}
            </p>
          </div>
        </div>
      ))}
    </div>
  ),
};
