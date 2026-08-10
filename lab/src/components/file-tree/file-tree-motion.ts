import type { Transition } from 'motion/react';

/**
 * The one curve a disclosure travels on.
 *
 * Three things move when a folder opens — the group's height, the chevron's
 * rotation, and the folder icon's front flap — and they are one gesture, so they
 * get one transition. Two curves over the same 100ms read as two events, and the
 * flap arriving after the rows have settled is exactly what makes a tree feel
 * loose.
 *
 * Critically damped, on purpose: `damping = 2√(stiffness · mass)` is `2√1225 = 70`,
 * so the damping ratio is exactly 1 — the fastest approach to the target that does
 * not overshoot it. A height that overshoots is a list of rows that visibly
 * bounces past where it belongs and comes back, and every row below the folder
 * bounces with it. The undamped frequency is √1225 = 35 rad/s, which settles in
 * a little over 100ms: quick enough to feel like a direct response to the click,
 * slow enough to show where the rows came from.
 *
 * The numbers are carried as stiffness and damping rather than as a duration
 * because the spring is what makes an *interrupted* disclosure behave. Clicking
 * open-closed-open hands the animation a new target mid-flight and the spring
 * continues from the position and velocity it already had; a tween restarts from
 * wherever it was, at zero velocity, and stutters.
 */
export const DISCLOSURE_SPRING: Transition = {
  damping: 70,
  mass: 1,
  stiffness: 1225,
  type: 'spring',
};

/** Reduced motion takes the same end state, instantly. */
export const NO_TRANSITION: Transition = { duration: 0 };

export const disclosureTransition = (prefersReducedMotion: boolean | null): Transition =>
  prefersReducedMotion === true ? NO_TRANSITION : DISCLOSURE_SPRING;
