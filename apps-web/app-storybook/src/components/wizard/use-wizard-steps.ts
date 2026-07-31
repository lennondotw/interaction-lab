import { useCallback, useState } from 'react';

export interface UseWizardStepsOptions {
  /** How many steps there are. The step is clamped into it, so shrinking is safe. */
  count: number;
  /**
   * Whether the wizard is on screen. Leave it out for a wizard that is always up.
   *
   * The step is rewound when this goes **true**, never when it goes false — see the
   * hook's own note for why the obvious side is the wrong one.
   */
  open?: boolean;
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
 * # The rewind happens on the way in
 *
 * Clearing the step when the wizard closes is the obvious choice and it is visible:
 * a surface that fades, scales or slides out is still on screen for the length of
 * that animation, so rewinding there plays the whole wizard backwards underneath
 * the exit — you watch it return to step one as it leaves. Rewinding on the way in
 * cannot race anything, because there is nothing on screen yet to race.
 *
 * The other half of it belongs to `Wizard`: the step that changes while the wizard
 * is closed must *arrive* rather than slide, so the surface restarts its step
 * transition on the same edge. Both halves are needed — this one alone still walks
 * backwards through the steps, just at the moment the wizard reappears.
 *
 * Nothing else about a run is reset here, deliberately. Whatever a step *collected*
 * is the caller's state, and a caller that wants it dropped per run keys it on the
 * same `open` edge.
 *
 * @example
 * ```tsx
 * const steps = useWizardSteps({ count: 3, open });
 *
 * <Wizard step={steps.step} open={open} height="fit">
 *   {STEPS[steps.step]}
 * </Wizard>
 * ```
 */
export const useWizardSteps = ({ count, open = true, initialStep = 0 }: UseWizardStepsOptions): WizardStepsResult => {
  const [step, setStep] = useState(initialStep);
  const [lastOpen, setLastOpen] = useState(open);

  // Derived during render rather than in an effect: an effect lands a commit later,
  // so the first painted frame of a reopened wizard would be the step the last run
  // ended on.
  if (open !== lastOpen) {
    setLastOpen(open);

    if (open && step !== initialStep) setStep(initialStep);
  }

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
