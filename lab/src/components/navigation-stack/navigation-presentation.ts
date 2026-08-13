import type { Transition } from 'motion/react';

/**
 * How a view arrives, and how it leaves.
 *
 * - `slide` — in from the trailing edge, the view below parking back for
 *   parallax. The iOS push, and the default.
 * - `cover` — up from the bottom edge, full-bleed, the view below staying
 *   put and dimming. iOS `fullScreenCover` rather than a partial sheet.
 * - `fade` — cross-dissolve in place. Nothing moves.
 * - `instant` — no transition at all.
 *
 * Declared per view rather than per stack, because it describes *this*
 * level's relationship to the one below it: a settings screen slides, the
 * media viewer it opens covers, and the sign-in wall it hits fades.
 */
export type NavigationPresentation = 'slide' | 'cover' | 'fade' | 'instant';

export const DEFAULT_PRESENTATION: NavigationPresentation = 'slide';

/** Fill in the presentation a view left unspecified. */
export function resolvePresentation(presentation: NavigationPresentation | undefined): NavigationPresentation {
  return presentation ?? DEFAULT_PRESENTATION;
}

export function isInstant(presentation: NavigationPresentation | undefined): boolean {
  return resolvePresentation(presentation) === 'instant';
}

/** How far a view covered by a `slide` parks back, as a fraction of the container. */
const PARALLAX_OFFSET = '-30%';

/** Dimming over a view that an opaque presentation has covered. */
const COVERED_DIM = 0.1;

/**
 * Everything about one view's visual state at one moment.
 *
 * Total on purpose — every axis is written even by a presentation that
 * leaves it alone. A key that *disappears* from motion's `animate` target
 * is not reset to its resting value, it is abandoned at whatever it last
 * held, so a stack that mixes a `cover` (which moves `y`) with a `slide`
 * (which would not mention `y` at all) would strand the covered view a
 * full container height down the screen, permanently.
 */
export interface ViewPose {
  x: string;
  y: string;
  opacity: number;
  /** Opacity of the scrim painted over this view. */
  dim: number;
}

/** On top, undimmed, at the origin: the pose every presentation resolves to. */
export const AT_REST: ViewPose = { x: '0%', y: '0%', opacity: 1, dim: 0 };

/**
 * The part of a pose that belongs on the view wrapper. `dim` is deliberately
 * not among them: dimming is a scrim painted over the view, never the view's
 * own opacity, or the container would show through the whole stack.
 */
export function wrapperTarget(pose: ViewPose): Pick<ViewPose, 'opacity' | 'x' | 'y'> {
  return { x: pose.x, y: pose.y, opacity: pose.opacity };
}

/**
 * Where a view sits before it has arrived — and, unchanged, where it goes
 * when it leaves. A view leaves the way it came in, so one function
 * serves both ends and they cannot drift apart.
 */
export function offscreenPose(presentation: NavigationPresentation | undefined): ViewPose {
  switch (resolvePresentation(presentation)) {
    case 'slide':
      return { x: '100%', y: '0%', opacity: 1, dim: 0 };
    case 'cover':
      return { x: '0%', y: '100%', opacity: 1, dim: 0 };
    case 'fade':
      return { x: '0%', y: '0%', opacity: 0, dim: 0 };
    case 'instant':
      // Never animated to or from; still total, so a presentation switched
      // to `instant` mid-stack cannot leave an axis behind.
      return AT_REST;
  }
}

/**
 * Where a view sits while it is covered — determined by the presentation
 * of the view directly *above* it, not its own.
 *
 * This is the half of a presentation that is easy to miss. Parallax is
 * not decoration on the incoming view, it is the pair of that specific
 * gesture: the same backward park that reads as depth under a `slide`
 * reads as a glitch under a `fade`, where the covered view is still
 * visible through the one dissolving over it.
 */
export function coveredPose(presentationAbove: NavigationPresentation | undefined): ViewPose {
  switch (resolvePresentation(presentationAbove)) {
    case 'slide':
      return { x: PARALLAX_OFFSET, y: '0%', opacity: 1, dim: COVERED_DIM };
    case 'cover':
      // A cover rises over a stationary backdrop — moving it too would
      // read as two gestures at once.
      return { x: '0%', y: '0%', opacity: 1, dim: COVERED_DIM };
    case 'fade':
      // Visible *through* the arriving view for the whole cross-dissolve,
      // so dimming it would show up as the background darkening mid-fade.
      return { x: '0%', y: '0%', opacity: 1, dim: 0 };
    case 'instant':
      return { x: '0%', y: '0%', opacity: 1, dim: COVERED_DIM };
  }
}

/**
 * The one curve a `slide` or a `cover` travels on.
 *
 * Critically damped: `damping = 2√(stiffness · mass)` is `2√400 = 40`, a
 * damping ratio of exactly 1 — the fastest approach to the target that
 * does not pass it. A view that overshoots is a screen that visibly
 * arrives, bounces past its edge and comes back, and the parallax layer
 * behind it bounces too. The undamped frequency is √400 = 20 rad/s, so
 * it settles in about 200ms.
 *
 * Carried as stiffness and damping rather than a duration because the
 * spring is what makes an *interrupted* navigation behave: popping
 * mid-push hands the animation a new target and the spring continues
 * from the position and velocity it already had, where a tween would
 * restart from wherever it was at zero velocity, and stutter.
 */
export const NAVIGATION_SPRING: Transition = { type: 'spring', stiffness: 400, damping: 40, mass: 1 };

/**
 * A cross-dissolve wants a fixed, symmetric window rather than a spring:
 * the arriving view rises 0 → 1 while the one below holds at 1, so the
 * pair never dips toward the background, and a spring's long tail would
 * leave the top view imperceptibly transparent for most of it.
 */
export const FADE_TRANSITION: Transition = { duration: 0.2, ease: 'easeInOut' };

/** Reduced to the end state, with no frame in between. */
export const NO_TRANSITION: Transition = { duration: 0 };

export function presentationTransition(presentation: NavigationPresentation | undefined): Transition {
  switch (resolvePresentation(presentation)) {
    case 'slide':
    case 'cover':
      return NAVIGATION_SPRING;
    case 'fade':
      return FADE_TRANSITION;
    case 'instant':
      return NO_TRANSITION;
  }
}
