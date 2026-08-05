import { useCallback, useEffect, useState } from 'react';

export interface UseWizardStepsOptions {
  /** How many steps there are. The step is clamped into it, so shrinking is safe. */
  count: number;
  /**
   * Whether the wizard is on screen. Leave it out for a wizard that is always up.
   *
   * The run is rewound once this has been false for `resetAfter` — see the hook's own
   * note for why it is not the moment it goes false, and not the next time it goes true.
   */
  open?: boolean;
  /**
   * How long the wizard takes to leave, in ms. The rewind waits it out.
   *
   * The length of *your* exit — the fade, the scale, the slide off the bottom of the
   * screen that the thing around this wizard plays. It is not knowable from here, and
   * the default assumes the honest worst case for a caller who has not said: that the
   * wizard vanishes at once and the rewind can happen immediately.
   *
   * @default 0
   */
  resetAfter?: number;
  /** Where a run starts, and where it is rewound to. @default 0 */
  initialStep?: number;
}

export interface WizardStepsResult {
  step: number;
  isFirst: boolean;
  isLast: boolean;
  next: () => void;
  back: () => void;
  goTo: (step: number) => void;
}

/**
 * Which step of a wizard is showing, with the open/close discipline built in.
 *
 * # The rewind waits for the exit, then happens at once
 *
 * Rewinding the instant the wizard closes is the obvious choice and it is visible: a
 * surface that fades, scales or slides out is still on screen for the length of that
 * animation, so the run plays backwards underneath the exit — you watch it return to
 * step one as it leaves. So the rewind waits `resetAfter` out, and by then there is
 * nothing on screen to see it: the step changes in one commit, with no transition to
 * play, because a wizard nobody can see does not need to travel anywhere.
 *
 * Deferring it to the *next opening* instead is the other tempting answer, and it has a
 * worse problem: the rewind and the wizard becoming visible then land in the same
 * commit, so every consumer of the step — the surface's height, the step transition,
 * anything of the caller's keyed on it — has to be taught to suppress that one change
 * or it plays the run backwards in front of the user at the worst possible moment. Doing
 * it while closed means the wizard reopens with nothing to undo.
 *
 * Reopening *during* `resetAfter` cancels the rewind, and the run picks up where it was
 * left. That is the right answer for a mis-tap — and it is the case `Wizard` still
 * remounts its step host on the way in for: the step is unchanged but the run resumed,
 * and resuming is not something to slide into.
 *
 * Nothing else about a run is reset here, deliberately. Whatever a step *collected* is
 * the caller's state, and a caller that wants it dropped per run keys it on the same
 * `open` edge.
 *
 * @example
 * ```tsx
 * const steps = useWizardSteps({ count: 3, open, resetAfter: 300 });
 *
 * <Wizard step={steps.step} open={open} height="fit">
 *   {STEPS[steps.step]}
 * </Wizard>
 * ```
 */
export const useWizardSteps = ({
  count,
  open = true,
  resetAfter = 0,
  initialStep = 0,
}: UseWizardStepsOptions): WizardStepsResult => {
  const [step, setStep] = useState(initialStep);

  useEffect(() => {
    if (open || step === initialStep) return;

    const timer = setTimeout(() => setStep(initialStep), resetAfter);

    // Cleared on reopen, which is what makes the exit's length the whole of the grace
    // period: a wizard that comes back before the timer lands keeps its step.
    return () => {
      clearTimeout(timer);
    };
  }, [initialStep, open, resetAfter, step]);

  const lastIndex = Math.max(count - 1, 0);
  // Clamped on the way out rather than written back: a count that shrank under the
  // current step is the caller's data changing, and correcting their state from here
  // would be a second writer for it.
  const clamped = Math.min(Math.max(step, 0), lastIndex);

  const goTo = useCallback((next: number) => setStep(next), []);
  const next = useCallback(() => setStep((current) => Math.min(current + 1, lastIndex)), [lastIndex]);
  const back = useCallback(() => setStep((current) => Math.max(current - 1, 0)), []);

  return { step: clamped, isFirst: clamped === 0, isLast: clamped === lastIndex, next, back, goTo };
};
