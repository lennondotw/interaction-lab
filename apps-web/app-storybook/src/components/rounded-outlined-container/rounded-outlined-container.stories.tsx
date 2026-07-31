import { Faker, en } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FC, ReactNode } from 'react';
import { RoundedOutlinedContainer } from './index.js';

type Story = StoryObj<typeof RoundedOutlinedContainer>;

const meta: Meta<typeof RoundedOutlinedContainer> = {
  title: 'Components/RoundedOutlinedContainer',
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

export const Circle: Story = {
  // 50% is deliberately left unscaled by `cornerSmoothing` — it already means
  // "half of this box", so the unsmoothed variant stays a true circle.
  args: { radius: '50%', className: 'size-40' },
};

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
            flex flex-col gap-4 text-sm leading-relaxed text-neutral-600
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
