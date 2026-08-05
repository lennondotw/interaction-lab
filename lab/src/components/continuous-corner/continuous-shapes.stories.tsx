import type { Meta, StoryObj } from '@storybook/react-vite';
import { FC, ReactNode } from 'react';
import { ContinuousCapsule, ContinuousCircle, ContinuousCorner } from './index.js';

const HAIRLINE = { width: 1, color: 'rgb(0 0 0 / 0.14)', align: 'inner' } as const;
const SURFACE = 'bg-white dark:bg-white/10';

/**
 * The three entry points, mirroring SwiftUI's split. They are not one shape with three
 * wrappers: `ContinuousCapsule` is the generator at the clamp, and `ContinuousCircle`
 * is a different curve entirely — see `SPEC.md`.
 */
const meta: Meta = {
  title: 'Components/ContinuousShapes',
  parameters: { layout: 'fullscreen' },
};

export default meta;

const Stage: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="flex min-h-screen w-full items-center justify-center px-2">{children}</div>
);

const Caption: FC<{ children: ReactNode }> = ({ children }) => (
  <span className="font-mono text-xs text-neutral-500">{children}</span>
);

/**
 * A pill. Takes no radius, because a capsule's radius is not a free parameter — it is
 * half the short side by definition. Exactly SwiftUI's `Capsule(.continuous)`, and it
 * refuses `mode="css"` because `corner-shape` cannot degrade and would leave the end
 * caps 12.5% wrong.
 */
export const Capsule: StoryObj = {
  render: () => (
    <Stage>
      <div className="flex flex-col items-center gap-6">
        {[
          { label: '240 x 56', className: 'h-14 w-60' },
          { label: '160 x 40', className: 'h-10 w-40' },
          { label: '96 x 96 — a capsule on a square is a circle', className: 'size-24' },
        ].map(({ label, className }) => (
          <div key={label} className="flex flex-col items-center gap-2">
            <ContinuousCapsule border={HAIRLINE} className={className} surfaceClassName={SURFACE} />
            <Caption>{label}</Caption>
          </div>
        ))}
      </div>
    </Stage>
  ),
};

/**
 * A true circle, and the one shape that does **not** use the generator. At maximum
 * radius the continuous rounded rectangle undulates 0.62%, bulging toward the four
 * diagonals, which is why a large one reads faintly squarish. This draws
 * `border-radius: 50%` instead — exact, and free of measurement, SVG and any path.
 */
export const Circle: StoryObj = {
  render: () => (
    <Stage>
      <div className="flex flex-row flex-wrap items-center justify-center gap-8">
        {['size-12', 'size-24', 'size-40'].map((className) => (
          <div key={className} className="flex flex-col items-center gap-2">
            <ContinuousCircle border={HAIRLINE} className={className} surfaceClassName={SURFACE} />
            <Caption>{className}</Caption>
          </div>
        ))}
      </div>
    </Stage>
  ),
};

/**
 * `ContinuousCircle` enforces `aspect-ratio: 1`, so a non-square box still renders a
 * circle rather than silently becoming an ellipse. `allowEllipse` opts out.
 */
export const CircleInANonSquareBox: StoryObj = {
  render: () => (
    <Stage>
      <div className="flex flex-row flex-wrap items-center justify-center gap-8">
        {[
          { label: 'default — stays a circle', allowEllipse: false },
          { label: 'allowEllipse', allowEllipse: true },
        ].map(({ label, allowEllipse }) => (
          <div key={label} className="flex flex-col items-center gap-2">
            <ContinuousCircle
              allowEllipse={allowEllipse}
              border={HAIRLINE}
              className="h-24 w-48"
              surfaceClassName={SURFACE}
            />
            <Caption>{label}</Caption>
          </div>
        ))}
      </div>
    </Stage>
  ),
};

/**
 * Composed, and the reason all three exist. A circle drawn by the generator at maximum
 * radius bulges 0.62% toward its diagonals; `ContinuousCircle` does not. Side by side
 * at this size the difference is about a pixel — subtle, but it is the difference
 * between round and faintly squarish, and it is why SwiftUI ships `Circle()`
 * separately.
 */
export const CircleVersusClampedCorner: StoryObj = {
  render: () => (
    <Stage>
      <div className="flex flex-row flex-wrap items-center justify-center gap-10">
        {[
          {
            label: 'ContinuousCircle — exact',
            node: <ContinuousCircle border={HAIRLINE} className="size-56" surfaceClassName={SURFACE} />,
          },
          {
            label: 'ContinuousCorner r=9999 — 0.62% undulation',
            node: <ContinuousCorner radius={9999} border={HAIRLINE} className="size-56" surfaceClassName={SURFACE} />,
          },
          {
            label: 'ContinuousCapsule on a square',
            node: <ContinuousCapsule border={HAIRLINE} className="size-56" surfaceClassName={SURFACE} />,
          },
        ].map(({ label, node }) => (
          <div key={label} className="flex max-w-56 flex-col items-center gap-2">
            {node}
            <Caption>{label}</Caption>
          </div>
        ))}
      </div>
    </Stage>
  ),
};

/** All three carry the same border, surface and content API. */
export const SharedApi: StoryObj = {
  render: () => (
    <Stage>
      <div className="flex flex-row flex-wrap items-center justify-center gap-8">
        <ContinuousCorner
          radius={20}
          border={{ width: 6, color: 'rgb(59 130 246 / 0.85)', align: 'outer' }}
          className="h-24 w-40"
          contentClassName="flex items-center justify-center"
          surfaceClassName={SURFACE}
        >
          <Caption>corner</Caption>
        </ContinuousCorner>
        <ContinuousCapsule
          border={{ width: 6, color: 'rgb(16 185 129 / 0.85)', align: 'center' }}
          className="h-24 w-40"
          contentClassName="flex items-center justify-center"
          surfaceClassName={SURFACE}
        >
          <Caption>capsule</Caption>
        </ContinuousCapsule>
        <ContinuousCircle
          border={{ width: 6, color: 'rgb(244 63 94 / 0.85)', align: 'inner' }}
          className="size-24"
          contentClassName="flex items-center justify-center"
          surfaceClassName={SURFACE}
        >
          <Caption>circle</Caption>
        </ContinuousCircle>
      </div>
    </Stage>
  ),
};
