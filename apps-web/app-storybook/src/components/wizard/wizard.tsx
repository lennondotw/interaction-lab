import { STEP_FADE_DURATION, STEP_SLIDE_DURATION, StepTransition } from '#src/animations/step-transition/index.js';
import { cn } from '@monorepo/utils';
import { useState, type CSSProperties, type FC, type ReactNode } from 'react';
import { useWizardHeight, WIZARD_HEIGHT_CLASS, WIZARD_HEIGHT_VAR, type WizardHeight } from './use-wizard-height.js';

/**
 * How one step gives way to the next.
 *
 * `'none'` is not "no animation available" — it is the hand-off. The step is swapped
 * with nothing wrapped around it, which is what a shared-element transition needs:
 * the outgoing element unmounts and the incoming one mounts in the same commit, so
 * Motion's `layoutId` (or a view transition) pairs them and morphs one into the
 * other. A slide would be a second opinion about the same movement.
 */
export type WizardTransition = 'slide' | 'fade' | 'none';

const DURATIONS: Record<WizardTransition, number> = {
  slide: STEP_SLIDE_DURATION,
  fade: STEP_FADE_DURATION,
  // Nothing crosses over, but the surface still resizes — and it is the only thing
  // moving, so it takes the slide's envelope rather than none.
  none: STEP_SLIDE_DURATION,
};

export interface WizardProps {
  /** Which step is showing. See `useWizardSteps` for the state that goes with it. */
  step: number;
  /** The showing step. Only ever one — the wizard does not hold the others. */
  children: ReactNode;
  /**
   * Chrome above the steps, which does **not** transition.
   *
   * That is the point of it rather than a limitation: a title and a step counter are
   * what make a sequence of steps read as one flow, and sliding them out with the
   * step they happen to sit above breaks exactly that.
   */
  header?: ReactNode;
  /** Chrome below the steps. Does not transition, for the same reason. */
  footer?: ReactNode;
  /** @default 'fit' */
  height?: WizardHeight;
  /** Omit to let CSS decide — a `className` of `w-full`, a `max-w-*`, a breakpoint. */
  width?: number | string;
  /** @default 'slide' */
  transition?: WizardTransition;
  /**
   * Whether the wizard is on screen.
   *
   * It does not hide anything — a wizard is closed by whatever mounts, fades or
   * unmounts it — it tells this component that what it does now cannot be seen. So a
   * closed wizard resizes instantly instead of travelling, and the step it is shown
   * with *arrives* rather than sliding in from wherever the last run ended: the step
   * transition restarts on the way in, which is what makes rewinding a run invisible.
   *
   * @default true
   */
  open?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * A surface that shows one step at a time and is the size of the step it is showing.
 *
 * Two things about it are worth more than the sum of their parts, and both are about
 * height. It has two modes and they are opposite directions of one relationship: a
 * **fixed** height is divided up by the step inside it, which is what lets that step
 * scroll; a **fit** height is added up from the step, which is what lets the step be
 * whatever it needs. And the mode may change *per step*, so a scrolling list and a
 * card that hugs its content are steps of the same wizard — the surface travels
 * between them on the same envelope as the content crossing over inside it.
 *
 * Everything a step needs to know about the surface is therefore one prop, `height`,
 * and everything the surface needs to know about the step is that same prop. Nothing
 * measures anything belonging to the other.
 *
 * # What it deliberately does not own
 *
 * Which step is showing (`useWizardSteps`), what a step collected, and how the wizard
 * itself appears. A wizard is one surface inside a dialog, a popover, a page or a
 * story; owning its own entrance would make it wrong in three of those four.
 *
 * # Two things to know when filling it
 *
 * The surface clips, so **a step's own insets belong to the step**, not to the
 * wizard. Padding out here would put the clip boundary that far inside the visual
 * edge, and a step sliding out would be cut off short of it with a bare strip left
 * over.
 *
 * In fixed mode the step fills the surface, so a scroller is `size-full
 * overflow-y-auto` on the step's own root. In fit mode there is nothing to fill and
 * nothing to scroll — the step states its height by being that tall.
 *
 * @example
 * ```tsx
 * const steps = useWizardSteps({ count: 3, open });
 *
 * <Wizard
 *   step={steps.step}
 *   open={open}
 *   width={420}
 *   height={steps.step === 2 ? 'fit' : 360}
 *   header={<Title>{TITLES[steps.step]}</Title>}
 * >
 *   {STEPS[steps.step]}
 * </Wizard>
 * ```
 */
export const Wizard: FC<WizardProps> = ({
  children,
  className,
  footer,
  header,
  height = 'fit',
  open = true,
  step,
  style,
  transition = 'slide',
  width,
}) => {
  const duration = DURATIONS[transition];
  const { declared, isFit, needsProbe, setColumn, setProbe, setSurface } = useWizardHeight({
    duration,
    height,
    open,
    step,
  });

  // Bumped every time the wizard opens, and used as the step host's key.
  //
  // This is the half of the open/close discipline that lives here. `useWizardSteps`
  // rewinds the step on the way in, which lands the rewind and the wizard becoming
  // visible in the same commit — and a step transition asked to travel there would
  // play the whole run backwards in front of the user, at the worst possible moment.
  // Remounting the host means the step it reopens on is its *first*, and a first step
  // is not a transition. It also drops any exit still in flight from before the
  // close, which would otherwise resume mid-slide.
  const [session, setSession] = useState(0);
  const [lastOpen, setLastOpen] = useState(open);

  if (open !== lastOpen) {
    setLastOpen(open);

    if (open) setSession((current) => current + 1);
  }

  return (
    <div
      className={cn(
        `
          relative isolate overflow-hidden rounded-2xl bg-white outline-1 -outline-offset-1 outline-black/10
          dark:bg-white/5 dark:outline-white/15
        `,
        WIZARD_HEIGHT_CLASS,
        className
      )}
      data-height-mode={isFit ? 'fit' : 'fixed'}
      data-open={open}
      data-slot="wizard"
      ref={setSurface}
      style={{ width, [WIZARD_HEIGHT_VAR]: declared, ...style } as CSSProperties}
    >
      {/*
        Not content: an empty box laid out at the declared height, so a length the
        animation cannot read — `60vh`, a `min()` over one — has a number behind it.
        Out of flow, zero-width and unpainted, so the only thing it contributes is the
        answer to that one question. `invisible` and not `hidden`, because a
        `display: none` box has no layout and would report nothing; and its height
        must stay an expression that does not depend on its parent, since a `%` would
        resolve against the box being animated and close the loop.
      */}
      {needsProbe && (
        <div
          aria-hidden
          className="pointer-events-none invisible absolute top-0 left-0 w-0"
          data-slot="wizard-height-probe"
          ref={setProbe}
          style={{ height: declared }}
        />
      )}

      {/*
        The content column, and the reason the fit height needs no arithmetic: a
        header and a footer are inside it, so they are already inside the measurement.

        `h-auto` in fit mode is what makes that measurement mean anything — it is the
        height the surface *should* be, independent of the height it currently is,
        which is what keeps the animation from reading back its own output. `h-full`
        in fixed mode hands the surface's height to the step instead, which is the
        other direction of the same relationship.
      */}
      <div className={cn('flex flex-col', isFit ? 'h-auto' : 'h-full')} data-slot="wizard-column" ref={setColumn}>
        {header != null && (
          <div className="shrink-0" data-slot="wizard-header">
            {header}
          </div>
        )}

        <div className={cn('relative', isFit ? 'shrink-0' : 'min-h-0 flex-1')} data-slot="wizard-steps">
          {transition === 'none' ? (
            // No wrapper of our own around the step, and no key: pairing the old
            // element with the new one is the caller's to do, and it needs both ends
            // to be theirs. In fixed mode the step still has to be told to fill.
            <div className={isFit ? undefined : 'absolute inset-0'}>{children}</div>
          ) : (
            <StepTransition
              className={isFit ? 'w-full' : 'size-full'}
              inFlow={isFit}
              key={session}
              mode={transition}
              step={step}
            >
              {children}
            </StepTransition>
          )}
        </div>

        {footer != null && (
          <div className="shrink-0" data-slot="wizard-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
