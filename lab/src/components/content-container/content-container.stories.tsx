import { cn } from '@monorepo/utils';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FC, ReactNode } from 'react';

import { ContentContainer } from './index.js';

/**
 * Muted fills, one hue per role, so the eye tracks *which band is which*
 * rather than the colour itself. Saturated blocks read as the subject of
 * the story; here the subject is where the edges land, which is also why
 * definition comes from {@link CARD}'s hairline border rather than from
 * turning the fills up.
 */
const TONES = {
  contained: `
    bg-sky-100 text-sky-900
    dark:bg-sky-400/15 dark:text-sky-100
  `,
  bleed: `
    bg-rose-100 text-rose-900
    dark:bg-rose-400/15 dark:text-rose-100
  `,
  section: `
    bg-emerald-100 text-emerald-900
    dark:bg-emerald-400/15 dark:text-emerald-100
  `,
  article: `
    bg-amber-100 text-amber-900
    dark:bg-amber-400/15 dark:text-amber-100
  `,
  grid: `
    bg-teal-100 text-teal-900
    dark:bg-teal-400/15 dark:text-teal-100
  `,
} satisfies Record<string, string>;

/** Shared card shell. Straight vertical edges — they are what the guides mark. */
const CARD = `
  flex h-24 items-center justify-center rounded-xl border border-black/5 text-sm font-medium
  dark:border-white/10
`;

/** Background for a `bleed` band — the thing whose edges escape the container. */
const BAND = `
  bg-neutral-200
  dark:bg-white/5
`;

const Block: FC<{ children: ReactNode; tone: keyof typeof TONES; className?: string }> = ({
  children,
  tone,
  className,
}) => <div className={cn(CARD, TONES[tone], className)}>{children}</div>;

/**
 * Dashed rules at the container's own edges — `max-w-300`, matching the
 * component's default cap. Below that width they sit on the viewport
 * edges, which is the honest picture: a container only *does* anything
 * once the page is wider than its cap.
 */
const ContainerGuides: FC = () => (
  <div
    aria-hidden
    className={`
      pointer-events-none fixed inset-y-0 left-1/2 w-full max-w-300 -translate-x-1/2 border-x border-dashed
      border-neutral-400/60
      dark:border-white/15
    `}
  />
);

const Stage: FC<{ children: ReactNode }> = ({ children }) => (
  <div
    className={`
      relative min-h-screen bg-neutral-100 py-8
      dark:bg-neutral-950
    `}
  >
    <ContainerGuides />
    {children}
  </div>
);

const meta = {
  title: 'Components/ContentContainer',
  component: ContentContainer,
  decorators: [
    (Story) => (
      <Stage>
        <Story />
      </Stage>
    ),
  ],
  tags: ['autodocs'],
  argTypes: {
    children: { control: false },
  },
} satisfies Meta<typeof ContentContainer>;

export default meta;

/** Args-driven, so the `asChild` / `bleed` controls do something. */
type Story = StoryObj<typeof meta>;

/** Compositions of several containers — nothing for the controls to drive. */
type Composition = StoryObj;

export const Default: Story = {
  args: {
    children: <Block tone="contained">Centered, capped, gutter on the inside</Block>,
  },
  parameters: {
    docs: {
      description: {
        story:
          'The dashed rules mark the container edges. Toggle `bleed` in the controls to watch the block cross them, and note that the gutter goes with it — page-level padding could not do that. Widen the preview past 1200px first: below the cap the rules sit on the viewport edges and there is nothing for the block to cross.',
      },
    },
  },
};

export const Bleed: Composition = {
  render: () => (
    <div className="space-y-4">
      <ContentContainer>
        <Block tone="contained">Contained</Block>
      </ContentContainer>
      <ContentContainer bleed>
        {/* Square, because two of its four corners are off-screen anyway. */}
        <Block tone="bleed" className="rounded-none border-x-0">
          Bleed — past the rules, to the viewport edge
        </Block>
      </ContentContainer>
      <ContentContainer>
        <Block tone="contained">Contained</Block>
      </ContentContainer>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          '`bleed` drops the cap and the gutter, so the band runs the full width of its parent while its neighbours stay aligned. The element itself still renders — that is what gives the band something to hang a background off.',
      },
    },
  },
};

export const AsChild: Composition = {
  render: () => (
    <div className="space-y-4">
      <ContentContainer asChild>
        <section className={cn(CARD, TONES.section)}>&lt;section&gt; — no wrapper div</section>
      </ContentContainer>
      <ContentContainer asChild>
        <article className={cn(CARD, TONES.article)}>&lt;article&gt; — classes merged onto the child</article>
      </ContentContainer>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "With `asChild` the container's classes land on the child instead of a wrapper, so a band that already has a semantic element keeps it — and the DOM stays one node shallower per band. Note where the fills reach: the gutter is now the child's own padding, so a child with a background of its own runs out to the guides rather than sitting inset from them.",
      },
    },
  },
};

export const MixedLayout: Composition = {
  render: () => (
    <div className="space-y-4">
      <ContentContainer bleed className={cn('py-6', BAND)}>
        <ContentContainer>
          <Block tone="contained">Bleed background, contained content</Block>
        </ContentContainer>
      </ContentContainer>
      <ContentContainer>
        <Block tone="contained">Plain band</Block>
      </ContentContainer>
      <ContentContainer bleed className={cn('py-6', BAND)}>
        <ContentContainer>
          <div className="grid grid-cols-3 gap-4">
            <Block tone="grid">Column</Block>
            <Block tone="grid">Column</Block>
            <Block tone="grid">Column</Block>
          </div>
        </ContentContainer>
      </ContentContainer>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The pattern the component exists for: a `bleed` band carries the full-width background, a nested container re-centers its content, and a multi-column grid inside that still lines up with the plain bands above and below.',
      },
    },
  },
};
