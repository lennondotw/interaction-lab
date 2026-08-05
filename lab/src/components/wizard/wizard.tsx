import { cn } from '@monorepo/utils';
import { useState, type CSSProperties, type FC, type ReactNode } from 'react';

import { STEP_FADE_DURATION, STEP_SLIDE_DURATION, StepTransition } from '#src/animations/step-transition/index.js';

import {
  useWizardHeight,
  WIZARD_HEIGHT_CLASS,
  WIZARD_HEIGHT_VAR,
  WIZARD_PAD_BOTTOM_VAR,
  WIZARD_PAD_TOP_VAR,
  type WizardHeight,
} from './use-wizard-height.js';

/**
 * How one step gives way to the next.
 *
 * `'none'` is not "no animation available" — the step is swapped with nothing of ours
 * wrapped around it, for a caller who is bringing their own transition, view transition
 * included.
 *
 * A `layoutId` morph is the case it exists for, and it wants `'none'` for a reason: the
 * other two modes wrap the step in a box they animate — `'fade'`'s is blurred on the way in
 * and out — and a shared element inside a blurred, fading ancestor is not travelling
 * cleanly. The morph should be the only thing moving.
 *
 * Two things then become the caller's, and neither is optional. **`AnimatePresence`**,
 * because a shared element hands over on the *presence* edge: `NodeStack.promote` gives the
 * incoming node the outgoing one's box by calling `prevLead.updateSnapshot()`, and with a
 * bare swap that call lands *after* React has committed — so the box it records is the
 * outgoing element measured in the layout that already changed, and the morph starts
 * wherever the new step put it. And **`mode="popLayout"`**, because in `fit` mode this
 * surface is as tall as what is in flow: a step on its way out that stays in the flow holds
 * the surface open at the sum of both steps.
 */
export type WizardTransition = 'slide' | 'fade' | 'none';

const DURATIONS: Record<WizardTransition, number> = {
  slide: STEP_SLIDE_DURATION,
  fade: STEP_FADE_DURATION,
  // Nothing crosses over, but the surface still resizes — and it is the only thing
  // moving, so it takes the slide's envelope rather than none.
  none: STEP_SLIDE_DURATION,
};

/**
 * A chrome band: where one edge's chrome is put, and nothing about how it looks.
 *
 * Position and paint order only — pinned across the edge, over the step, `z-10` because the
 * step host is the whole surface and is painted first. A fill, a blur, a hairline, a radius:
 * all of that belongs to the node the caller passed, which is this box's only child and is
 * as wide as it.
 *
 * A caller who frosts their chrome should know one thing about the arrangement: the surface's
 * own hairline, if it has one, is *in* the backdrop a `backdrop-filter` samples, and a 1px
 * line put through a 20px blur is gone. Draw the hairline above the bands instead — an
 * `::after` ring at `z-20` on the surface is the whole fix.
 */
const BAND_CLASS = 'absolute inset-x-0 z-10';

export interface WizardProps {
  /** Which step is showing. See `useWizardSteps` for the state that goes with it. */
  step: number;
  /** The showing step. Only ever one — the wizard does not hold the others. */
  children: ReactNode;
  /**
   * Chrome pinned to the top of the surface, over the step, which does **not** transition.
   *
   * That is the point of it rather than a limitation: a title and a step counter are
   * what make a sequence of steps read as one flow, and sliding them out with the
   * step they happen to sit above breaks exactly that.
   */
  header?: ReactNode;
  /** Chrome pinned to the bottom. Does not transition, for the same reason. */
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
 * **How any of it looks.** Not a background, not a radius, not a hairline, not the glass
 * behind the chrome — the four classes it sets are `relative isolate overflow-hidden` and the
 * height, and every one of those is load-bearing rather than decorative. A caller's
 * `className` is the whole appearance of the surface, and the header and footer nodes are the
 * whole appearance of the chrome: this component renders them into a box that is pinned
 * across an edge and painted above the step, and contributes nothing else to them. That is
 * also why there is no default: a bordered card, a bare panel and a sheet with only a
 * top-left radius are all *correct*, and a default would make two of them wrong.
 *
 * Which step is showing (`useWizardSteps`), what a step collected, and how the wizard itself
 * appears on screen. A wizard is one surface inside a dialog, a popover, a page or a story;
 * owning its own entrance would make it wrong in three of those four.
 *
 * # The chrome is over the step, not beside it
 *
 * The step host is the whole surface, and the header and footer are laid over it —
 * anchored to the top and bottom edges, so the surface's height animation carries them
 * with it and neither band needs an animation of its own. It also means a step slides
 * across the full surface: were the host the band between the two pieces of chrome, a
 * step would be cut off at that seam instead of at the visible edge.
 *
 * What the chrome costs is published as two lengths — `--wizard-pad-top` and
 * `--wizard-pad-bottom`, the measured height of each band — for the step to reserve as
 * its own padding: `pt-(--wizard-pad-top) pb-(--wizard-pad-bottom)`, on the scroller
 * when there is one. The step decides, because only the step knows whether its content
 * should stop at the chrome or pass under it.
 *
 * # Two more things to know when filling it
 *
 * The surface clips, so **a step's own insets belong to the step**, not to the
 * wizard. Padding out here would put the clip boundary that far inside the visual
 * edge, and a step sliding out would be cut off short of it with a bare strip left
 * over.
 *
 * In fixed mode the step fills the surface, so a scroller is `size-full
 * overflow-y-auto` on the step's own root. In fit mode there is nothing to fill and
 * nothing to scroll — the step states its height by being that tall, chrome included,
 * because the bands it reserved are inside its own box.
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
  const { declared, isFit, padBottom, padTop, setFooter, setHeader, setSurface } = useWizardHeight({
    duration,
    height,
    open,
    step,
  });

  // Bumped every time the wizard opens, and used as the step host's key.
  //
  // This is the half of the open/close discipline that lives here. `useWizardSteps`
  // rewinds the step once the wizard is closed and out of sight, and a wizard reopened
  // before that lands still has the last run's step to get rid of — either way the step
  // the user is shown first must *arrive*, and a transition asked to travel there would
  // play the run backwards in front of them at the worst possible moment. Remounting the
  // host makes the step it reopens on its *first*, and a first step is not a transition.
  // It also drops any exit still in flight from before the close, which would otherwise
  // resume mid-slide.
  const [session, setSession] = useState(0);
  const [lastOpen, setLastOpen] = useState(open);

  if (open !== lastOpen) {
    setLastOpen(open);

    if (open) setSession((current) => current + 1);
  }

  return (
    <div
      className={cn('relative isolate overflow-hidden', WIZARD_HEIGHT_CLASS, className)}
      data-height-mode={isFit ? 'fit' : 'fixed'}
      data-open={open}
      data-slot="wizard"
      ref={setSurface}
      style={
        {
          width,
          [WIZARD_HEIGHT_VAR]: declared,
          [WIZARD_PAD_TOP_VAR]: padTop,
          [WIZARD_PAD_BOTTOM_VAR]: padBottom,
          ...style,
        } as CSSProperties
      }
    >
      {header != null && (
        <div className={cn(BAND_CLASS, 'top-0')} data-slot="wizard-header" ref={setHeader}>
          {header}
        </div>
      )}

      {/*
        The step host is the surface. In fixed mode it is pinned to all four edges; in
        fit mode it is the one thing in flow, so the surface is as tall as it is — which
        includes the two chrome bands, because the step reserved them as its own padding.
      */}
      <div className={isFit ? 'relative' : 'absolute inset-0'} data-slot="wizard-steps">
        {transition === 'none' ? (
          // No wrapper of our own around the step, and no key: pairing the old
          // element with the new one is the caller's to do, and it needs both ends
          // to be theirs. In fixed mode the step still has to be told to fill.
          <div className={isFit ? undefined : 'size-full'}>{children}</div>
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
        <div className={cn(BAND_CLASS, 'bottom-0')} data-slot="wizard-footer" ref={setFooter}>
          {footer}
        </div>
      )}
    </div>
  );
};
