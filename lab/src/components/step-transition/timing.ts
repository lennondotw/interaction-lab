// Transition timings + easing for the step transition, kept in their own
// module so sibling animations that need to share the same envelope can
// import them without pulling the component in (and so the component
// file stays exports-only-components for Fast Refresh).

export const STEP_TRANSITION_EASE: [number, number, number, number] = [0.4, 0, 0.15, 1];

export const STEP_SLIDE_DURATION = 0.45;
export const STEP_FADE_DURATION = 0.35;

export const STEP_SLIDE_TRANSITION = {
  duration: STEP_SLIDE_DURATION,
  ease: STEP_TRANSITION_EASE,
} as const;

export const STEP_FADE_TRANSITION = {
  duration: STEP_FADE_DURATION,
  ease: STEP_TRANSITION_EASE,
} as const;
