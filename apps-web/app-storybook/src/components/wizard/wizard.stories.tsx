import { cn } from '@monorepo/utils';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { motion } from 'motion/react';
import { useState, type FC, type ReactNode } from 'react';
import type { WizardHeight } from './use-wizard-height.js';
import { useWizardSteps, type WizardStepsResult } from './use-wizard-steps.js';
import { Wizard } from './wizard.js';

/* ------------------------------------------------------------------ wireframe */

/**
 * Everything in these stories is drawn as a hairline box on a barely-tinted fill,
 * in one alpha pair that reads on both themes. The point of the stories is where the
 * edges of the *surface* end up, so anything with a colour of its own would be the
 * loudest thing on screen.
 */
const FRAME_CLASS = 'rounded-lg bg-neutral-500/5 outline-1 -outline-offset-1 outline-neutral-500/20';

const Frame: FC<{ children?: ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn(FRAME_CLASS, 'flex items-center justify-center text-xs opacity-40', className)}>{children}</div>
);

const Bar: FC<{ className?: string }> = ({ className }) => (
  <div className={cn('h-2 rounded-full bg-neutral-500/20', className)} />
);

const Caption: FC<{ children: ReactNode }> = ({ children }) => (
  <p className="max-w-100 text-center text-xs leading-relaxed opacity-40">{children}</p>
);

const ACTION_CLASS = `
  cursor-pointer rounded-lg bg-neutral-500/8 px-3 py-1.5 text-xs font-medium
  transition-colors
  hover:bg-neutral-500/14
  disabled:cursor-default disabled:opacity-30 disabled:hover:bg-neutral-500/8
`;

const Action: FC<{ children: ReactNode; disabled?: boolean; onClick: () => void }> = ({
  children,
  disabled = false,
  onClick,
}) => (
  <button className={ACTION_CLASS} disabled={disabled} onClick={onClick} type="button">
    {children}
  </button>
);

/* --------------------------------------------------------------- wizard chrome */

/**
 * The header slot: a title that stays put while the steps cross over under it. Its
 * hairline is the seam between chrome and step, so it belongs to the header rather
 * than to the step — a step that carried it would slide its own top edge away.
 */
const Header: FC<{ subtitle?: string; title: string }> = ({ subtitle, title }) => (
  <div className="flex items-baseline justify-between border-b border-neutral-500/15 px-5 py-3.5">
    <p className="text-sm font-medium">{title}</p>
    {subtitle !== undefined && <p className="text-xs opacity-40">{subtitle}</p>}
  </div>
);

/** The footer slot: where in the run the user is, plus the two ways out of it. */
const Footer: FC<{ count: number; steps: WizardStepsResult }> = ({ count, steps }) => (
  <div className="flex items-center justify-between border-t border-neutral-500/15 px-5 py-3">
    <div className="flex items-center gap-1.5">
      {Array.from({ length: count }, (_, index) => (
        <span
          className={cn('size-1.5 rounded-full', index === steps.step ? 'bg-neutral-500/70' : 'bg-neutral-500/20')}
          key={index}
        />
      ))}
    </div>

    <div className="flex items-center gap-2">
      <Action disabled={steps.isFirst} onClick={steps.back}>
        Back
      </Action>
      <Action disabled={steps.isLast} onClick={steps.next}>
        Next
      </Action>
    </div>
  </div>
);

/* ----------------------------------------------------------------- fixed steps */

/**
 * A step for the fixed mode: it fills the surface and scrolls inside it. Both halves
 * are on the step's own root — `size-full` because the wizard's step host is the box
 * to fill, `overflow-y-auto` because a fixed height is the one case where a step can
 * have more content than room. The insets are here too, not on the wizard: the
 * surface clips, so padding out there would cut a sliding step off short of the edge.
 */
const ScrollStep: FC<{ rows: number }> = ({ rows }) => (
  <div className="size-full overflow-y-auto px-5 py-4">
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, index) => (
        <Frame className="h-12 shrink-0" key={index}>
          {index + 1}
        </Frame>
      ))}
    </div>
  </div>
);

/** A step for the fit mode: it states its height by being that tall, and cannot scroll. */
const FitStep: FC<{ lines: number }> = ({ lines }) => (
  <div className="flex flex-col gap-3 px-5 py-4">
    <Frame className="h-20 shrink-0">{lines} lines</Frame>
    {Array.from({ length: lines }, (_, index) => (
      <Bar className={index % 3 === 2 ? 'w-1/2' : 'w-full'} key={index} />
    ))}
  </div>
);

/* ------------------------------------------------------------------- the stack */

const DECK_PEEK = 8;
const DECK_SCALE_STEP = 0.94;

/**
 * A deck: one card in flow with a second peeking out from behind its bottom edge.
 *
 * Only the front card is in flow, so the deck is exactly as tall as one card and the
 * row below it never moves. The card behind is **clipped to the band it peeks into**
 * rather than laid out full height behind the front one — with a translucent card in
 * front, anything left underneath shows *through* it, so the only thing ever painted
 * is the sliver the eye is supposed to see. That also makes a back card taller than
 * the front one a non-issue.
 *
 * The band's room is paid in `padding-bottom`, which is why `bottom: 0` lands on it:
 * an absolute child resolves against the padding box. And the card inside is scaled
 * about `bottom center`, so it stays bottom-aligned with the deck however tall it is.
 */
const Deck: FC<{ label: string; onOpen: () => void }> = ({ label, onOpen }) => (
  <button
    className="relative block w-full cursor-pointer text-left"
    onClick={onOpen}
    style={{ paddingBottom: DECK_PEEK }}
    type="button"
  >
    <div aria-hidden className="absolute inset-x-0 bottom-0 overflow-hidden" style={{ height: DECK_PEEK }}>
      <div
        className="absolute inset-x-0 bottom-0"
        style={{ transform: `scale(${DECK_SCALE_STEP})`, transformOrigin: 'bottom center' }}
      >
        <Frame className="h-20" />
      </div>
    </div>

    <Frame className="relative z-10 h-20">{label}</Frame>
  </button>
);

/* --------------------------------------------------------------- question card */

const QUESTIONS = [
  { options: ['Every hour', 'Twice a day'], question: 'How often should it look?' },
  { options: ['A summary', 'A chart', 'The raw numbers'], question: 'What should it show first?' },
  { options: ['Always', 'Only on a change', 'Only on a failure', 'Never'], question: 'When should it tell you?' },
];

const OptionRow: FC<{ label: string; onSelect: () => void; selected: boolean }> = ({ label, onSelect, selected }) => (
  <button
    className={cn(
      `
        flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-xs outline-1
        -outline-offset-1 transition-colors
      `,
      selected
        ? 'bg-neutral-500/10 outline-neutral-500/40'
        : `
          outline-neutral-500/20
          hover:bg-neutral-500/5
        `
    )}
    onClick={onSelect}
    type="button"
  >
    {label}
    <span
      className={cn(
        'size-3 rounded-full outline-1 -outline-offset-1 outline-neutral-500/40',
        selected && 'bg-neutral-500/60'
      )}
    />
  </button>
);

/**
 * A wizard inside a wizard, and the reason the height mode has to be able to nest.
 *
 * Its questions have two, three and four options, so its own height is different on
 * every step — and it is `fit`, so it eases onto each one. The wizard *around* it is
 * `fit` too, and takes that as a stream of fresh measurements rather than as steps of
 * its own: this card eases, and the surface outside is simply always exactly around
 * it. Ease it out there as well and the outer surface would trail this card, clipping
 * it for the length of the lag.
 */
const QuestionCard: FC = () => {
  const steps = useWizardSteps({ count: QUESTIONS.length });
  const [answers, setAnswers] = useState<Record<number, string>>({});

  const current = QUESTIONS[steps.step];
  const answer = answers[steps.step];

  return (
    <Wizard
      className={`
        w-full rounded-xl bg-white shadow-[0_8px_40px_rgba(0,0,0,0.10)] outline-black/5
        dark:bg-neutral-900 dark:outline-white/10
      `}
      header={<p className="px-4 pt-4 text-xs tabular-nums opacity-40">{`${steps.step + 1} / ${QUESTIONS.length}`}</p>}
      height="fit"
      step={steps.step}
    >
      <div className="flex flex-col gap-3 px-4 pt-3 pb-4">
        <p className="text-sm font-medium">{current?.question}</p>

        <div className="flex flex-col gap-2">
          {current?.options.map((option) => (
            <OptionRow
              key={option}
              label={option}
              onSelect={() => setAnswers((previous) => ({ ...previous, [steps.step]: option }))}
              selected={answer === option}
            />
          ))}
        </div>

        <div className="flex justify-end">
          <Action disabled={answer === undefined || steps.isLast} onClick={steps.next}>
            {steps.isLast ? 'Done' : 'Next'}
          </Action>
        </div>
      </div>
    </Wizard>
  );
};

/* ----------------------------------------------------------------------- demos */

const FixedHeightDemo: FC = () => {
  const steps = useWizardSteps({ count: 3 });
  const rows = [6, 14, 3][steps.step] ?? 6;

  return (
    <div className="flex flex-col items-center gap-4">
      <Wizard
        footer={<Footer count={3} steps={steps} />}
        header={<Header subtitle="320px" title="Fixed height" />}
        height={320}
        step={steps.step}
        width={380}
      >
        <ScrollStep rows={rows} />
      </Wizard>

      <Caption>
        The surface is the same height on every step, so a step with more content than room scrolls inside it. Step two
        has fourteen rows; the surface does not notice.
      </Caption>
    </div>
  );
};

const FitContentDemo: FC = () => {
  const steps = useWizardSteps({ count: 3 });
  const lines = [2, 7, 4][steps.step] ?? 2;

  return (
    <div className="flex flex-col items-center gap-4">
      <Wizard
        footer={<Footer count={3} steps={steps} />}
        header={<Header subtitle="fit" title="Fit content" />}
        height="fit"
        step={steps.step}
        width={380}
      >
        <FitStep lines={lines} />
      </Wizard>

      <Caption>
        Now the step states the height and the surface follows it, on the same duration and curve as the content
        crossing over inside — one gesture rather than two that nearly agree.
      </Caption>
    </div>
  );
};

const CSS_HEIGHT = 'min(50vh, 420px)';

const CssHeightDemo: FC = () => {
  const steps = useWizardSteps({ count: 2 });
  const height: WizardHeight = steps.step === 0 ? CSS_HEIGHT : 'fit';

  return (
    <div className="flex flex-col items-center gap-4">
      <Wizard
        footer={<Footer count={2} steps={steps} />}
        header={<Header subtitle={steps.step === 0 ? CSS_HEIGHT : 'fit'} title="Across the two modes" />}
        height={height}
        step={steps.step}
        width={380}
      >
        {steps.step === 0 ? <ScrollStep rows={12} /> : <FitStep lines={3} />}
      </Wizard>

      <Caption>
        Step one is a CSS length nothing in JS can read, step two fits its content — and the surface travels between
        them. Resize the window on step one: the height retracks, and that is a new measurement rather than a step, so
        it is taken outright instead of eased.
      </Caption>
    </div>
  );
};

const DECKS = ['Morning', 'Numbers', 'Weekly'];

const FlowDemo: FC = () => {
  const steps = useWizardSteps({ count: 3 });
  const [picked, setPicked] = useState(0);

  // The height belongs to the step, so the mode changes as the run walks: a scrolling
  // list, then a composition that frames one card, then a page whose height is
  // whatever question is being asked.
  const height: WizardHeight = [300, 260, 'fit'][steps.step] ?? 'fit';

  return (
    <div className="flex flex-col items-center gap-4">
      <Wizard
        footer={<Footer count={3} steps={steps} />}
        header={
          <Header
            subtitle={`${steps.step + 1} / 3`}
            title={['Pick a set', DECKS[picked] ?? '', 'Set it up'][steps.step] ?? ''}
          />
        }
        height={height}
        step={steps.step}
        width={400}
      >
        {steps.step === 0 && (
          <div className="size-full overflow-y-auto px-5 py-4">
            <div className="flex flex-col gap-4">
              {DECKS.map((label, index) => (
                <Deck
                  key={label}
                  label={label}
                  onOpen={() => {
                    setPicked(index);
                    steps.goTo(1);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {steps.step === 1 && (
          <div className="flex size-full flex-col items-center justify-center gap-4 px-5">
            {/* The deck, fanned out. Same three cards, side by side instead of stacked. */}
            <div className="flex w-full items-stretch gap-3">
              <Frame className="h-28 flex-1">1</Frame>
              <Frame className="h-28 flex-1">2</Frame>
              <Frame className="h-28 flex-1">3</Frame>
            </div>

            <Action onClick={() => steps.goTo(2)}>Use the first one</Action>
          </div>
        )}

        {steps.step === 2 && (
          // Insets on the step. The card is pulled up over the frame above it and
          // carries the higher z-index, because overlap is what reads as depth —
          // and the frame is bottom-aligned so the overlap always lands on the card.
          <div className="flex flex-col items-center px-5 pt-5 pb-5">
            <Frame className="h-36 w-52">the thing being set up</Frame>

            <div className="relative z-10 -mt-2 w-full">
              <QuestionCard />
            </div>
          </div>
        )}
      </Wizard>

      <Caption>
        One run across both height modes: a scrolling list, a fixed composition, then a page that fits a card whose own
        steps have two, three and four options. Watch the surface on the last step — the card eases its height and the
        surface is always exactly around it, never behind it.
      </Caption>
    </div>
  );
};

const SharedLayoutDemo: FC = () => {
  const steps = useWizardSteps({ count: 2 });

  return (
    <div className="flex flex-col items-center gap-4">
      <Wizard
        footer={<Footer count={2} steps={steps} />}
        header={<Header subtitle="transition: none" title="Your own transition" />}
        height={260}
        step={steps.step}
        transition="none"
        width={380}
      >
        {steps.step === 0 ? (
          <div className="flex size-full flex-col gap-3 p-5">
            <p className="text-xs opacity-40">Press the left one.</p>
            <div className="flex gap-3">
              <motion.button
                className={cn(FRAME_CLASS, 'h-20 w-28 cursor-pointer')}
                layoutId="wizard-shared-card"
                onClick={() => steps.goTo(1)}
                type="button"
              />
              <Frame className="h-20 w-28" />
            </div>
          </div>
        ) : (
          <div className="flex size-full flex-col gap-3 p-5">
            <motion.div className={cn(FRAME_CLASS, 'h-40 w-full')} layoutId="wizard-shared-card" />
            <p className="text-xs opacity-40">Same element, one box to another.</p>
          </div>
        )}
      </Wizard>

      <Caption>
        With the transition set to none, the wizard contributes the surface and nothing else: the step is swapped with
        nothing wrapped around it, so the two ends of a layoutId pair meet in one commit and Motion morphs one into the
        other. A slide here would be a second opinion about the same movement.
      </Caption>
    </div>
  );
};

const ReopenDemo: FC = () => {
  const [open, setOpen] = useState(true);
  const steps = useWizardSteps({ count: 3, open });

  return (
    <div className="flex flex-col items-center gap-4">
      {/*
        Kept mounted while closed, which is the case worth demonstrating: a wizard
        inside something that fades out is still on screen for the length of that
        fade, so a run rewound on the way *out* plays backwards underneath it.
      */}
      <div
        className={cn(
          'transition-all duration-300 ease-out',
          open ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0'
        )}
      >
        <Wizard
          footer={<Footer count={3} steps={steps} />}
          header={<Header subtitle={open ? 'open' : 'closed'} title="Open and close" />}
          height="fit"
          open={open}
          step={steps.step}
          width={380}
        >
          <FitStep lines={[2, 6, 3][steps.step] ?? 2} />
        </Wizard>
      </div>

      <Action onClick={() => setOpen((current) => !current)}>{open ? 'Close' : 'Open'}</Action>

      <Caption>
        Walk to step three, close, reopen. The run is back at step one, and you never saw it get there: the rewind
        happens on the way in, and the step transition restarts with it — so the first step of a run arrives rather than
        sliding in from wherever the last one ended.
      </Caption>
    </div>
  );
};

/* --------------------------------------------------------------------- stories */

const meta = {
  title: 'Components/Wizard',
  component: Wizard,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Wizard>;

export default meta;
type Story = StoryObj<typeof meta>;

const args = { step: 0, children: null };

export const FixedHeight: Story = { args, render: () => <FixedHeightDemo /> };

export const FitContent: Story = { args, render: () => <FitContentDemo /> };

export const AcrossModes: Story = { name: 'Across modes', args, render: () => <CssHeightDemo /> };

export const Flow: Story = { args, render: () => <FlowDemo /> };

export const SharedLayout: Story = { name: 'Shared layout (no transition)', args, render: () => <SharedLayoutDemo /> };

export const Reopen: Story = { name: 'Open and close', args, render: () => <ReopenDemo /> };
