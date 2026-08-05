import type { Meta, StoryObj } from '@storybook/react-vite';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';

import { StepTransition, type StepTransitionMode } from './step-transition.js';

const TOTAL = 5;

// Soft tinted cards rather than saturated blocks — the point of the
// story is the motion envelope, so the colour should stay quiet enough
// that a slide or a blur is the thing you notice. Light mode leans on a
// pale wash; dark mode uses a low-alpha tint so the card reads as a lit
// surface instead of a painted rectangle.
const STEP_CARD_CLASSES = [
  'bg-indigo-100/80 text-indigo-900/70 dark:bg-indigo-400/10 dark:text-indigo-200/70',
  'bg-rose-100/80 text-rose-900/70 dark:bg-rose-400/10 dark:text-rose-200/70',
  'bg-amber-100/80 text-amber-900/70 dark:bg-amber-400/10 dark:text-amber-200/70',
  'bg-emerald-100/80 text-emerald-900/70 dark:bg-emerald-400/10 dark:text-emerald-200/70',
  'bg-sky-100/80 text-sky-900/70 dark:bg-sky-400/10 dark:text-sky-200/70',
];

const BUTTON_CLASS = `
  cursor-pointer rounded-lg bg-neutral-500/8 px-4 py-2 text-sm font-medium
  transition-opacity
  hover:bg-neutral-500/14
  disabled:cursor-default disabled:opacity-30 disabled:hover:bg-neutral-500/8
`;

const StepCard: FC<{ step: number }> = ({ step }) => (
  <div
    className={`
      flex size-full items-center justify-center rounded-2xl font-medium tabular-nums select-none
      ${STEP_CARD_CLASSES[step % STEP_CARD_CLASSES.length] ?? ''}
    `}
  >
    <span className="text-[200px] leading-none">{step + 1}</span>
  </div>
);

const Demo: FC<{ mode?: StepTransitionMode; prefetch?: boolean }> = ({ mode = 'slide', prefetch = true }) => {
  const [current, setCurrent] = useState(0);

  const steps = useMemo(() => Array.from({ length: TOTAL }, (_, i) => <StepCard key={i} step={i} />), []);

  const goNext = useCallback(() => setCurrent((s) => Math.min(s + 1, TOTAL - 1)), []);
  const goPrev = useCallback(() => setCurrent((s) => Math.max(s - 1, 0)), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      // Swallow the default scroll so held arrows don't drag the page
      // while the transition is mid-flight.
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev]);

  return (
    <div className="flex size-full flex-col items-center justify-center gap-6">
      {/* Wrapper exists only to give the archive probe a stable handle on the
          stage — see archive/2026-07-step-transition-direction. */}
      <div data-testid="step-stage">
        <StepTransition
          step={current}
          mode={mode}
          prev={prefetch ? steps[current - 1] : undefined}
          next={prefetch ? steps[current + 1] : undefined}
          className="overflow-hidden rounded-2xl bg-neutral-500/5"
          style={{ width: 600, height: 400 }}
        >
          {steps[current]}
        </StepTransition>
      </div>

      <div className="flex items-center gap-4">
        <button type="button" onClick={goPrev} disabled={current === 0} className={BUTTON_CLASS}>
          ← Prev
        </button>
        <span className="min-w-15 text-center text-sm tabular-nums opacity-50">
          {current + 1} / {TOTAL}
        </span>
        <button type="button" onClick={goNext} disabled={current === TOTAL - 1} className={BUTTON_CLASS}>
          Next →
        </button>
      </div>

      <p className="text-xs opacity-40">Press ← / → to navigate. Rapid presses test interruptibility.</p>
    </div>
  );
};

const meta = {
  title: 'Animations/StepTransition',
  component: StepTransition,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof StepTransition>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SlideMode: Story = {
  name: 'Slide',
  args: { step: 0, children: '' },
  render: () => <Demo mode="slide" />,
};

export const FadeMode: Story = {
  name: 'Fade',
  args: { step: 0, children: '' },
  render: () => <Demo mode="fade" />,
};

export const NoPrefetch: Story = {
  name: 'Slide (no prefetch)',
  args: { step: 0, children: '' },
  render: () => <Demo mode="slide" prefetch={false} />,
};
