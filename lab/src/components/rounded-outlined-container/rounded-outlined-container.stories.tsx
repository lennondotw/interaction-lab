import { Faker, en } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FC, ReactNode } from 'react';

import { RoundedOutlinedContainer } from './index.js';

type Story = StoryObj<typeof RoundedOutlinedContainer>;

const meta: Meta<typeof RoundedOutlinedContainer> = {
  title: 'Components/Rounded outlined container',
  // Naming the component is what makes the Controls panel exist: Storybook reads
  // the prop types off it to build the args table.
  component: RoundedOutlinedContainer,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    radius: {
      control: 'text',
      description: 'Any `border-radius`: `24`, `50%`, `9999px`, `48px 8px 32px 4px`.',
    },
    cornerSmoothing: { control: 'boolean' },
    asChild: { control: 'boolean' },
    className: { control: 'text' },
  },
  args: {
    asChild: false,
    cornerSmoothing: false,
    className: 'h-40 w-72',
    // A string, not `24`: a text control cannot render a number, so a numeric
    // default shows as an empty field that lies about what is applied.
    radius: '24px',
  },
};

export default meta;

/** One container, centered, every prop live in Controls. */
export const Default: Story = {};

/**
 * A true circle — but only with `cornerSmoothing` off. Turn it on and this is the
 * clearest place to watch the superellipse degenerate, which is why the knob is
 * left on the story rather than removed from it.
 *
 * At `50%` there is no straight edge left anywhere on the box, so the whole outline
 * *is* the corner curve — and `|x|ⁿ + |y|ⁿ = 1` at `n ≈ 3.03` is a squircle by
 * definition, not a circle with nicer corners. Measured radially from the centre,
 * the arc holds its nominal radius to within 0.01px all the way round; the
 * superellipse holds it at 0° and 90° and bulges 12.5% at 45°. No value of `radius`
 * makes smoothing produce a circle. Only `k = 1` does, and `k = 1` is the arc.
 *
 * The compensation correctly does nothing here: percentages are never scaled, since
 * `50%` already means "half of this box".
 */
export const Circle: Story = {
  args: { radius: '50%', className: 'size-40' },
};

/**
 * The same degeneration along one axis. `9999px` clamps to half the height, so the
 * end caps are corner curves spanning the full height: semicircular with smoothing
 * off — measured constant to 0.3% — and superelliptical with it on, 12.8% fatter on
 * the diagonal. That flattened cap is why the smoothed variant reads as a rounded
 * rectangle instead of a pill.
 *
 * Compensation is a no-op here too, for a different reason than the circle's:
 * `9999px` inflated by anything still clamps to the same half-height. On a pill,
 * smoothing changes the shape of the cap and can never change its size.
 */
export const Pill: Story = {
  args: { radius: '9999px', className: 'h-16 w-72' },
};

export const SquareCorners: Story = {
  // At radius 0 there is no corner to cut, so `cornerSmoothing` has nothing to do.
  args: { radius: '0px' },
};

export const RoundedRectangle: Story = {
  args: { radius: '24px' },
};

export const MixedCorners: Story = {
  args: { radius: '48px 8px 32px 4px' },
};

/**
 * The surface is white on a near-white canvas, so the composite stories sit on a
 * tinted plate — without one, shapes that render and shapes that collapse to
 * nothing look alike at a glance.
 */
const Plate: FC<{ children: ReactNode }> = ({ children }) => (
  <div
    className={`
      flex flex-row flex-wrap items-end justify-center gap-8 rounded-3xl bg-neutral-100 p-8
      dark:bg-neutral-900
    `}
  >
    {children}
  </div>
);

const SHAPES = [
  { label: '50%', radius: '50%', className: 'size-32' },
  { label: '9999px', radius: '9999px', className: 'h-14 w-56' },
  { label: '0', radius: 0, className: 'h-32 w-56' },
  { label: '24', radius: 24, className: 'h-32 w-56' },
  { label: '48/8/32/4', radius: '48px 8px 32px 4px', className: 'h-32 w-56' },
] as const;

/**
 * Every shape against both corner shapes. Smoothing is the half of the radius
 * handling that cannot be judged from a single instance — a superellipse only
 * reads as wrong next to the circular arc it replaced.
 *
 * Read left to right and the degeneration is the story: `50%` and `9999px` cannot
 * survive smoothing, because they leave no straight edge for the curve to be a
 * corner *of*, while `24` and the four-corner shorthand are the cases the
 * compensation is for. See `archive/2026-07-corner-shape-superellipse`.
 */
export const ShapeMatrix: Story = {
  parameters: {
    // The story hard-codes both values it would otherwise take from args, so a
    // live control here would be a knob that does nothing.
    controls: { disable: true },
  },
  render: () => (
    <div className="flex flex-col gap-4">
      {[false, true].map((cornerSmoothing) => (
        <div key={String(cornerSmoothing)} className="flex flex-col gap-2">
          <span className="font-mono text-xs text-neutral-500">{cornerSmoothing ? 'cornerSmoothing' : 'round'}</span>
          <Plate>
            {SHAPES.map((shape) => (
              <div key={shape.label} className="flex flex-col items-center gap-2">
                <RoundedOutlinedContainer
                  cornerSmoothing={cornerSmoothing}
                  radius={shape.radius}
                  className={shape.className}
                />
                <span className="font-mono text-xs text-neutral-500">{shape.label}</span>
              </div>
            ))}
          </Plate>
        </div>
      ))}
    </div>
  ),
};

const faker = new Faker({ locale: [en], seed: 20260731 });
const LOREM_PARAGRAPHS = Array.from({ length: 8 }, () => faker.lorem.paragraph({ min: 4, max: 7 }));

/**
 * The container owns the surface and the frame; a nested element owns the
 * scrolling. Putting `overflow` on the container itself works right up until an
 * overscroll bounce, where the whole box — background and outline with it — rubber
 * bands away from the frame it is supposed to be, and the fill it was hiding shows
 * at the edge. A child scroller bounces its own content against a container that
 * never moves.
 *
 * The padding belongs to the scroller, not the container. On the container it
 * would inset the scroll viewport itself: the prose would clip 24px short of the
 * frame with a band that can never be scrolled through, and the scrollbar would
 * float 24px in from the edge it belongs on. On the scroller the same 24px becomes
 * leading and trailing space inside the scroll range instead — content goes edge to
 * edge, the scrollbar sits flush against the frame, and the padding scrolls away
 * with the text rather than fencing it in.
 *
 * `size-full` is exact rather than approximate here because the scroller is the
 * container's only child, so full height is the container's content box and there
 * is nothing above it to leave room for.
 *
 * Everything inside is ordinary content, the heading included: it scrolls with the
 * prose and carries no fill. A fill is what would go wrong — a heading painting its
 * own surface on top of the container's is a band that has to be colour-matched in
 * both themes, and will not be.
 */
export const ScrollContainer: Story = {
  args: {
    cornerSmoothing: true,
    radius: '28px',
    className: 'h-96 w-md overflow-clip',
  },
  render: (args) => (
    <RoundedOutlinedContainer {...args}>
      <div className="flex size-full flex-col gap-4 overflow-y-auto overscroll-contain p-6">
        <h2
          className={`
            text-sm font-medium text-neutral-900
            dark:text-neutral-100
          `}
        >
          Scroll me
        </h2>
        <div
          className={`
            flex flex-col gap-4 text-sm/relaxed text-neutral-600
            dark:text-neutral-400
          `}
        >
          {LOREM_PARAGRAPHS.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </div>
    </RoundedOutlinedContainer>
  ),
};
