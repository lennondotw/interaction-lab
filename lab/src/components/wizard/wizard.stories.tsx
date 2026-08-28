import { cn } from '@monorepo/utils';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AnimatePresence, motion } from 'motion/react';
import { Fragment, useCallback, useEffect, useState, type CSSProperties, type FC, type ReactNode } from 'react';

import { STEP_SLIDE_TRANSITION } from '#src/components/step-transition/index.js';

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

/**
 * A frame's hairline and radius as inline style, for a box Motion morphs.
 *
 * A layout animation is a scale, and a scale distorts everything drawn in the box's own
 * coordinates: the 1px hairline of a card taken from 112×80 to 340×160 is painted a third
 * of a pixel wide across and half a pixel down, and the 8px corner comes out an ellipse.
 * Motion undoes both — it rewrites `borderRadius` as a per-axis percentage and divides the
 * shadow's spread by the scale it applied, on every frame — but only for values it owns,
 * which means values on `style`. An `outline` is not one of them at any price, so the
 * hairline is an inset shadow, and the colour is spelled out because a `color-mix()` would
 * put a number in the shadow for Motion to mistake for a length.
 */
const MORPH_STYLE: CSSProperties = { borderRadius: 8, boxShadow: 'inset 0 0 0 1px rgba(115, 115, 115, 0.2)' };

const Bar: FC<{ className?: string }> = ({ className }) => (
  <div className={cn('h-2 rounded-full bg-neutral-500/20', className)} />
);

const Caption: FC<{ children: ReactNode }> = ({ children }) => (
  <p className="max-w-100 text-center text-xs/relaxed opacity-40">{children}</p>
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

/* ------------------------------------------------------------------- arrow keys */

/**
 * Left and right arrows walk the run. This lives in the story rather than in `Wizard`
 * on purpose: the wizard is told which step to show and animates to it, so the keys
 * belong to whoever owns the step — and a wizard nested in another one would otherwise
 * bind the same keys twice and move both runs at once.
 *
 * A window listener, because there is nothing to focus: the run is walked from
 * wherever the reader's hands already are. `enabled` is how a closed wizard stops
 * listening — a run stepping along under a faded-out surface is not a demo of
 * anything. The default is swallowed so a held arrow doesn't scroll the page
 * mid-transition, and modified presses are left alone so browser shortcuts still work.
 */
const useArrowSteps = (steps: WizardStepsResult, enabled = true): void => {
  const { back, next } = steps;

  useEffect(() => {
    if (!enabled) return;

    const handler = (event: KeyboardEvent): void => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        next();
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        back();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [back, enabled, next]);
};

/* ------------------------------------------------------------------ safe areas */

/**
 * A step's safe area: the two bands the chrome occupies, taken as the step's own padding.
 *
 * The step host is the whole surface, so this is the step's decision to make rather than
 * the wizard's — and both answers are the same declaration. On a plain box the content
 * comes to rest clear of the chrome; on a **scroller** the padding scrolls away with the
 * content, so the list passes under the glass and still stops below it.
 */
const SafeArea: FC<{ children: ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn('pt-(--wizard-pad-top) pb-(--wizard-pad-bottom)', className)}>{children}</div>
);

/* --------------------------------------------------------------- wizard chrome */

/**
 * The card these stories put the wizard in. All of it is the story's: `Wizard` sets
 * `relative isolate overflow-hidden` and a height, and has no opinion about a background, a
 * radius or a hairline.
 *
 * The hairline is an `::after` ring rather than the surface's own outline, because the bands
 * below are frosted and a `backdrop-filter` samples the surface's paint *including* its
 * outline — a 1px line through a 20px blur is gone. Drawn above the bands at `z-20` it
 * survives, and `outline-inherit` takes its colour from the surface's own outline utilities,
 * left at zero width so they paint nothing themselves.
 */
const SURFACE_CLASS = `
  rounded-2xl bg-white outline-0 outline-black/10
  after:pointer-events-none after:absolute after:inset-0 after:z-20 after:rounded-[inherit] after:outline-1
  after:-outline-offset-1 after:outline-inherit after:content-[""]
  dark:bg-[#161616] dark:outline-white/15
`;

/**
 * The frosted glass for a band, also the story's: the surface's own two colours at 60%, so the
 * band is the card rather than a shade of its own, plus the 20px blur that makes content
 * passing underneath legible *as* content passing underneath rather than as noise.
 */
const GLASS_CLASS = 'bg-white/60 backdrop-blur-[20px] dark:bg-[#161616]/60';

/**
 * The header slot: a title that stays put while the steps cross over under it. Its
 * hairline is the seam between chrome and step, so it belongs to the header rather
 * than to the step — a step that carried it would slide its own top edge away.
 */
const Header: FC<{ subtitle?: string; title: string }> = ({ subtitle, title }) => (
  <div className={cn(GLASS_CLASS, 'flex items-baseline justify-between border-b border-neutral-500/15 px-5 py-3.5')}>
    <p className="text-sm font-medium">{title}</p>
    {subtitle !== undefined && <p className="text-xs opacity-40">{subtitle}</p>}
  </div>
);

/** The footer slot: where in the run the user is, plus the two ways out of it. */
const Footer: FC<{ count: number; steps: WizardStepsResult }> = ({ count, steps }) => (
  <div className={cn(GLASS_CLASS, 'flex items-center justify-between border-t border-neutral-500/15 px-5 py-3')}>
    <div className="flex items-center gap-1.5">
      {Array.from({ length: count }, (_, index) => (
        <span
          className={cn('size-1.5 rounded-full', index === steps.step ? 'bg-neutral-500/70' : 'bg-neutral-500/20')}
          key={index}
        />
      ))}

      {/* The keys are bound to the window, so the hint sits with the dots rather than
          on either button — it is about the run, not about one direction out of it. */}
      <span className="ml-1.5 text-xs opacity-25 select-none">← →</span>
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
 * A step for the fixed mode: it fills the surface, centres what it has, and scrolls when
 * that is more than fits. Both halves of the outer box are the step's own — `size-full`
 * because the wizard's step host is the box to fill, `overflow-y-auto` because a fixed
 * height is the one case where a step can have more content than room. The insets are here
 * too, not on the wizard: the surface clips, so padding out there would cut a sliding step
 * off short of the edge.
 *
 * The centring is `min-h-full` plus `justify-center`, and the two are one idea. **Min**
 * height, not height: a list that outgrows the room makes the box taller than the minimum,
 * and centring inside a box the content itself sized does nothing — which is what keeps the
 * first rows reachable. Centre a *fixed*-height flex box and the overflow goes out both
 * ends, with the top of the list above a scroll position that cannot be reached.
 */
const ScrollStep: FC<{ rows: number }> = ({ rows }) => (
  <SafeArea className="size-full overflow-y-auto">
    <div className="flex min-h-full flex-col justify-center gap-4 px-5 py-4">
      {Array.from({ length: rows }, (_, index) => (
        <Frame className="h-12 shrink-0" key={index}>
          {index + 1}
        </Frame>
      ))}
    </div>
  </SafeArea>
);

/** A step for the fit mode: it states its height by being that tall, and cannot scroll. */
const FitStep: FC<{ lines: number }> = ({ lines }) => (
  <SafeArea>
    <div className="flex flex-col gap-3 px-5 py-4">
      <Frame className="h-20 shrink-0">{lines} lines</Frame>
      {Array.from({ length: lines }, (_, index) => (
        <Bar className={index % 3 === 2 ? 'w-1/2' : 'w-full'} key={index} />
      ))}
    </div>
  </SafeArea>
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
 * `fit` too, and is not animating at all while this happens: its height has settled
 * back to `auto`, so it is CSS that keeps the outer surface exactly around this card,
 * on every frame of the card's own ease. Ease it out there as well and the outer
 * surface would trail this card, clipping it for the length of the lag.
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
      {/* Its own header's band, not the outer wizard's: the variables are redeclared on
          every surface, so a step reads the chrome it is actually under. */}
      <SafeArea>
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

          <div className="flex justify-end gap-2">
            <Action disabled={steps.isFirst} onClick={steps.back}>
              Back
            </Action>
            <Action disabled={answer === undefined || steps.isLast} onClick={steps.next}>
              {steps.isLast ? 'Done' : 'Next'}
            </Action>
          </div>
        </div>
      </SafeArea>
    </Wizard>
  );
};

/* ----------------------------------------------------------------------- demos */

const FixedHeightDemo: FC = () => {
  const steps = useWizardSteps({ count: 3 });
  const rows = [6, 14, 2][steps.step] ?? 6;

  useArrowSteps(steps);

  return (
    <div className="flex flex-col items-center gap-4">
      <Wizard
        className={SURFACE_CLASS}
        footer={<Footer count={3} steps={steps} />}
        header={<Header subtitle="320px" title="Fixed height" />}
        height={320}
        step={steps.step}
        width={380}
      >
        <ScrollStep rows={rows} />
      </Wizard>

      <Caption>
        The surface is the same height on every step, so a step with more content than room scrolls inside it — step two
        has fourteen rows and the surface does not notice. Step three has two, and they sit in the middle of the room
        rather than at the top of it: the step fills the surface and centres what it has, which is the same declaration
        that scrolls on step two.
      </Caption>
    </div>
  );
};

const FitContentDemo: FC = () => {
  const steps = useWizardSteps({ count: 3 });
  const lines = [2, 7, 4][steps.step] ?? 2;

  useArrowSteps(steps);

  return (
    <div className="flex flex-col items-center gap-4">
      <Wizard
        className={SURFACE_CLASS}
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

  useArrowSteps(steps);

  return (
    <div className="flex flex-col items-center gap-4">
      <Wizard
        className={SURFACE_CLASS}
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
        them, because Motion resolves both ends by laying them out. Resize the window on step one: the height retracks
        with the viewport, and it does so in CSS, because that is where the animation left it.
      </Caption>
    </div>
  );
};

const DECKS = ['Morning', 'Numbers', 'Weekly'];

const FlowDemo: FC = () => {
  const steps = useWizardSteps({ count: 3 });
  const [picked, setPicked] = useState(0);

  // Only the outer run is on the keys. The card on the last step has steps of its own,
  // and two runs answering one press is nobody's idea of a step.
  useArrowSteps(steps);

  // The height belongs to the step, so the mode changes as the run walks: a scrolling
  // list, then a composition that frames one card, then a page whose height is
  // whatever question is being asked.
  const height: WizardHeight = [300, 260, 'fit'][steps.step] ?? 'fit';

  return (
    <div className="flex flex-col items-center gap-4">
      <Wizard
        className={SURFACE_CLASS}
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
          <SafeArea className="size-full overflow-y-auto">
            <div className="flex flex-col gap-4 px-5 py-4">
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
          </SafeArea>
        )}

        {steps.step === 1 && (
          <SafeArea className="size-full">
            <div className="flex size-full flex-col items-center justify-center gap-4 px-5 py-4">
              {/* The deck, fanned out. Same three cards, side by side instead of stacked. */}
              <div className="flex w-full items-stretch gap-3">
                <Frame className="h-28 flex-1">1</Frame>
                <Frame className="h-28 flex-1">2</Frame>
                <Frame className="h-28 flex-1">3</Frame>
              </div>

              <Action onClick={() => steps.goTo(2)}>Use the first one</Action>
            </div>
          </SafeArea>
        )}

        {steps.step === 2 && (
          // Insets on the step. The card is pulled up over the frame above it and
          // carries the higher z-index, because overlap is what reads as depth —
          // and the frame is bottom-aligned so the overlap always lands on the card.
          <SafeArea>
            <div className="flex flex-col items-center p-5">
              <Frame className="h-36 w-52">the thing being set up</Frame>

              <div className="relative z-10 -mt-2 w-full">
                <QuestionCard />
              </div>
            </div>
          </SafeArea>
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

  useArrowSteps(steps);

  return (
    <div className="flex flex-col items-center gap-4">
      <Wizard
        className={SURFACE_CLASS}
        footer={<Footer count={2} steps={steps} />}
        header={<Header subtitle="fit · transition: none" title="A shared element" />}
        height="fit"
        step={steps.step}
        transition="none"
        width={380}
      >
        {/*
          No step transition, because the morph *is* the transition and the two do not
          compose: the wizard's own fade puts a `filter: blur()` on the wrapper the shared
          element sits inside, and a blurred ancestor blurs the one element that is supposed
          to be travelling cleanly.

          What is left is the pair of things a bare swap does not give a `layoutId` hand-off,
          which is why they are here rather than in the component:

          - `AnimatePresence` for the *presence edge*. The incoming element takes the
            outgoing one's box when it is promoted over it, and without a presence flip that
            hand-off measures the old element after the commit — in the layout that has
            already changed — so the morph starts wherever the new step put it.
          - `popLayout` to keep the leaving step out of the flow. In fit mode the surface is
            as tall as what is in flow, and a step on its way out that stays in it holds the
            surface open at the sum of both steps.

          The only thing animated by hand is the leaving step's opacity, on the morph's own
          envelope. The step arriving is given nothing at all: it is opaque from its first
          frame, and the card inside it is Motion's to carry across.
        */}
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            className="pt-(--wizard-pad-top) pb-(--wizard-pad-bottom)"
            exit={{ opacity: 0 }}
            key={steps.step}
            transition={STEP_SLIDE_TRANSITION}
          >
            {steps.step === 0 ? (
              <div className="flex flex-col gap-3 px-5 py-4">
                <p className="text-xs opacity-40">Press the left one.</p>
                <div className="flex gap-3">
                  <motion.button
                    className="h-20 w-28 cursor-pointer bg-neutral-500/5"
                    layoutId="wizard-shared-card"
                    onClick={() => steps.goTo(1)}
                    style={MORPH_STYLE}
                    transition={STEP_SLIDE_TRANSITION}
                    type="button"
                  />
                  <Frame className="h-20 w-28" />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 px-5 py-4">
                <motion.div
                  className="h-40 w-full bg-neutral-500/5"
                  layoutId="wizard-shared-card"
                  style={MORPH_STYLE}
                  transition={STEP_SLIDE_TRANSITION}
                />
                <p className="text-xs opacity-40">Same element, one box to another.</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </Wizard>

      <Caption>
        A layoutId pair across two steps, with the wizard contributing the surface and nothing else. The card travels on
        one uninterrupted transform — no step transition over the top of it, because a blur or a slide applied to the
        box it sits in is a second opinion about the same movement. Only the leaving step fades, and the surface travels
        with the card.
      </Caption>
    </div>
  );
};

const EXIT_MS = 300;

const ReopenDemo: FC = () => {
  const [open, setOpen] = useState(true);
  // `resetAfter` is this demo's own exit, handed back to the hook: the run is rewound
  // once the surface below has finished leaving, and not a moment before it.
  const steps = useWizardSteps({ count: 3, open, resetAfter: EXIT_MS });

  useArrowSteps(steps, open);

  return (
    <div className="flex flex-col items-center gap-4">
      {/*
        Kept mounted while closed, which is the case worth demonstrating: a wizard
        inside something that fades out is still on screen for the length of that
        fade, so a run rewound on the way *out* plays backwards underneath it.
      */}
      <div
        className={cn(
          'transition-all ease-out',
          open ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0'
        )}
        style={{ transitionDuration: `${EXIT_MS}ms` }}
      >
        <Wizard
          className={SURFACE_CLASS}
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
        Walk to step three, close, reopen. The run is back at step one, and you never saw it get there: the rewind waits
        out the 300ms exit and then lands in one commit, with the surface already out of sight. Reopen inside those
        300ms and it is cancelled — the run resumes on the step you left it on.
      </Caption>
    </div>
  );
};

/* -------------------------------------------------------------------- branching */

/**
 * The nodes, and *only* the nodes: what each one asks and what it offers. Where an answer
 * leads is not in here — see `nextNode`.
 */
const NODES: Record<string, { options: string[]; question: string }> = {
  start: { options: ['A page', 'A number'], question: 'What should it keep an eye on?' },
  page: { options: ['Any edit at all', 'Only the headline'], question: 'Which changes count?' },
  number: { options: ['When it goes above', 'When it drops below'], question: 'Which direction matters?' },
  threshold: { options: ['Ten per cent', 'Any movement'], question: 'By how much?' },
  tell: { options: ['A push', 'An email', 'Nothing, just record it'], question: 'How should it tell you?' },
  done: { options: ['Start over'], question: 'That is the lot.' },
};

/**
 * The edges — a function of *where you are* and *what you answered*, which is the whole
 * point: `Wizard` is told which step to show, so what counts as the next step is entirely
 * the caller's arithmetic. A number in an array is the degenerate case of this, not the
 * shape of it.
 *
 * The graph this one describes is not a tree. `page` and `threshold` converge on the same
 * `tell` node, so two different runs share a tail, and `done` leads back to `start`, so it
 * has a cycle. Neither is expressible as "step + 1" and neither needs anything of the
 * wizard's: the run is a walk, and the wizard is told how deep the walk currently is.
 */
const nextNode = (id: string, option: string): string => {
  if (id === 'start') return option === 'A page' ? 'page' : 'number';
  if (id === 'number') return 'threshold';
  if (id === 'page' || id === 'threshold') return 'tell';
  if (id === 'tell') return 'done';

  return 'start';
};

interface Visit {
  /** Which node. */
  id: string;
  /** What was answered here, once it has been. */
  answer?: string;
}

/**
 * The walk so far, and the two ways to move along it.
 *
 * A stack rather than a cursor, because a graph has no "previous" of its own: going back is
 * only meaningful as *the node I came from*, which is the entry below this one. It also means
 * the depth is `length - 1`, and that is the number the wizard is given — walking deeper
 * counts up, going back counts down, so the step transition gets its direction for free even
 * though the run is not a sequence.
 */
const useWalk = (
  initial: string,
  resolve: (id: string, answer: string) => string
): {
  answer: (option: string) => void;
  back: () => void;
  trail: Visit[];
  visit: Visit;
} => {
  const [trail, setTrail] = useState<Visit[]>([{ id: initial }]);

  const answer = useCallback(
    (option: string) =>
      setTrail((previous) => {
        const current = previous.at(-1);

        if (current === undefined) return previous;

        return [...previous.slice(0, -1), { ...current, answer: option }, { id: resolve(current.id, option) }];
      }),
    [resolve]
  );

  const back = useCallback(() => setTrail((previous) => (previous.length > 1 ? previous.slice(0, -1) : previous)), []);

  return { answer, back, trail, visit: trail.at(-1) ?? { id: initial } };
};

/** The walk, drawn: one box per answer given, in the order they were given. */
const Trail: FC<{ trail: Visit[] }> = ({ trail }) => (
  <div className="flex flex-col items-stretch">
    {trail.map(({ answer, id }, index) =>
      answer === undefined ? null : (
        <Fragment key={`${id}-${index}`}>
          {index > 0 && <div className="mx-auto h-3 w-px bg-neutral-500/25" />}
          <Frame className="justify-start px-3 py-2">{answer}</Frame>
        </Fragment>
      )
    )}
  </div>
);

const BranchingDemo: FC = () => {
  const { answer, back, trail, visit } = useWalk('start', nextNode);
  const node = NODES[visit.id];
  const isDone = visit.id === 'done';

  return (
    <div className="flex flex-col items-center gap-4">
      <Wizard
        className={SURFACE_CLASS}
        footer={
          <div
            className={cn(
              GLASS_CLASS,
              'flex items-center justify-between gap-4 border-t border-neutral-500/15 px-5 py-3'
            )}
          >
            {/* One line however long the walk gets. `min-w-0` is the half people forget: a
                flex item will not shrink below its own text without it, so the ellipsis
                never gets a chance — and `shrink-0` keeps the button at its own size. */}
            <p className="min-w-0 flex-1 truncate text-xs opacity-40">{trail.map(({ id }) => id).join(' → ')}</p>

            <div className="shrink-0">
              <Action disabled={trail.length === 1} onClick={back}>
                Back
              </Action>
            </div>
          </div>
        }
        header={<Header subtitle={`${trail.length} deep`} title="Branching" />}
        height="fit"
        step={trail.length - 1}
        width={380}
      >
        <SafeArea>
          <div className="flex flex-col gap-3 px-5 py-4">
            <p className="text-sm font-medium">{node?.question}</p>

            {isDone && <Trail trail={trail} />}

            <div className="flex flex-col gap-2">
              {node?.options.map((option) => (
                <OptionRow
                  key={option}
                  label={option}
                  onSelect={() => answer(option)}
                  selected={visit.answer === option}
                />
              ))}
            </div>
          </div>
        </SafeArea>
      </Wizard>

      <Caption>
        Same wizard, no sequence. Each answer is handed to a function that says which node comes next, so two paths can
        converge on one question and the last node can lead back to the first. The wizard is only told how deep the walk
        is — which is what keeps the transition pointing the right way.
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

export const SharedLayout: Story = { name: 'Shared element', args, render: () => <SharedLayoutDemo /> };

export const Reopen: Story = { name: 'Open and close', args, render: () => <ReopenDemo /> };

export const Branching: Story = { name: 'Branching graph', args, render: () => <BranchingDemo /> };
