import { STEP_TRANSITION_EASE } from '#src/animations/step-transition/index.js';
import { animate, useReducedMotion } from 'motion/react';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * How tall a wizard is while a given step is showing.
 *
 * - `'fit'` — the surface is as tall as the step, and travels when that changes.
 * - a number — px.
 * - a string — any CSS length, including one that cannot be evaluated in JS:
 *   `'60vh'`, `'min(80svh, 640px)'`, `'clamp(20rem, 50vh, 32rem)'`.
 *
 * The two modes are not variants of one number, they are opposite directions of the
 * same relationship: a fixed height is divided up by the step inside it (which is what
 * lets that step scroll), a fit height is added up from it (which is what lets the step
 * be whatever it needs). Which one applies can change per step, and the surface
 * animates across the change like any other.
 *
 * `string & Record<never, never>` rather than plain `string`, so `'fit'` survives in
 * autocomplete instead of being swallowed by the wider constituent.
 */
export type WizardHeight = 'fit' | number | (string & Record<never, never>);

/**
 * Where the resolved height is *declared*, and the utility that applies it.
 *
 * Two names for one value, because the indirection is the point. Which height applies
 * is decided in JS, so it would naturally arrive as an inline `height` — and an inline
 * style outranks every class and every media query, which would make the height the one
 * thing about this component a caller cannot override responsively. Parked in a
 * variable and applied *as a utility*, it is back on the cascade's terms: a
 * `max-md:h-dvh!` from the caller simply wins.
 *
 * Always declared, `auto` included, and that is not for tidiness: custom properties
 * inherit, so a fit-mode wizard that left this one unset would resolve it against the
 * *enclosing* wizard's surface and come out 320px tall because its parent is.
 */
export const WIZARD_HEIGHT_VAR = '--wizard-height';

export const WIZARD_HEIGHT_CLASS = 'h-(--wizard-height)';

/**
 * How tall the chrome is, published to the step as two lengths it can pad by.
 *
 * The header and the footer sit *over* the step rather than beside it — the step host is
 * the whole surface — so the room they need is the step's to reserve:
 * `pt-(--wizard-pad-top) pb-(--wizard-pad-bottom)` on whichever box of the step's own
 * should stay clear of them, which is the scroller when there is one.
 *
 * Padding and not a smaller box, because the two things a step wants are then the same
 * declaration: content that comes to rest clear of the chrome, and content that *scrolls
 * under* it — a scroll container's padding scrolls away, so the list passes beneath the
 * glass and still stops below it.
 *
 * Measured rather than declared, because the chrome is the caller's markup and its height
 * is whatever their title, their row of dots or their two lines of small print come to.
 *
 * `0px` and never unset, for the same reason the height is always declared: these inherit,
 * and a wizard nested in another one whose footer it does not have would otherwise reserve
 * the *outer* footer's band. Declared on every surface, a step of the inner wizard pads by
 * the inner chrome and a step of the outer one by the outer chrome, with no arithmetic on
 * either side.
 */
export const WIZARD_PAD_TOP_VAR = '--wizard-pad-top';

export const WIZARD_PAD_BOTTOM_VAR = '--wizard-pad-bottom';

export interface UseWizardHeightOptions {
  height: WizardHeight;
  /** Which step is showing. A change to it is what makes the next height a *transition*. */
  step: number;
  /** A closed wizard resizes instantly: it is not on screen to be seen travelling. */
  open: boolean;
  /** The step transition's own duration, in seconds, so the two read as one gesture. */
  duration: number;
}

export interface WizardHeightResult {
  /** For the element the height is animated on. */
  setSurface: (node: HTMLElement | null) => (() => void) | undefined;
  /** For the header band, whose height becomes `WIZARD_PAD_TOP_VAR`. */
  setHeader: (node: HTMLElement | null) => (() => void) | undefined;
  /** For the footer band, whose height becomes `WIZARD_PAD_BOTTOM_VAR`. */
  setFooter: (node: HTMLElement | null) => (() => void) | undefined;
  isFit: boolean;
  /** The CSS length for `WIZARD_HEIGHT_VAR`, which is `auto` in `fit` mode. */
  declared: string;
  /** The CSS length for `WIZARD_PAD_TOP_VAR`, `0px` until a header is measured. */
  padTop: string;
  /** The CSS length for `WIZARD_PAD_BOTTOM_VAR`, `0px` until a footer is measured. */
  padBottom: string;
}

/**
 * Moves the surface onto the height the showing step asks for.
 *
 * # Motion measures, we do not
 *
 * Interpolation needs two numbers and none of what a height can be here is one: `'fit'`
 * is a measurement, and a CSS length may be `60vh` or a `min()` over one. Motion resolves
 * exactly that class of value by *laying it out* — it applies the target, measures the box
 * it produces, animates between the two numbers, and then puts the declaration back as the
 * final keyframe.
 *
 * That last part is worth the whole hook. When the animation ends the surface is left at
 * `height: auto` (or at `min(50vh, 420px)`), not at the number it happened to reach, so
 * from then on it is CSS that owns the height: a step that grows afterwards — a nested
 * wizard landing a step, an image arriving, a line of copy wrapping — simply takes the
 * surface with it, on the same frame, with nothing observing anything. Every measurement
 * problem this component used to solve with a probe and a `ResizeObserver` is the layout
 * engine's again.
 *
 * # The one thing Motion cannot know
 *
 * Where the surface was standing. Keyframes are resolved a beat *after* the commit that
 * asked for them, and by then React has swapped the step host — so a surface sitting on
 * `auto` has already been resized by the new step's content, and the origin Motion would
 * read is the destination. Nothing has been painted yet, so this is not a flash; it is a
 * missing number.
 *
 * The surface's own box is therefore observed into a ref, and put back on the element as an
 * explicit px height before the animation is handed over. Deliberately not state and not a
 * measurement pass: the observer's callback lands after layout and before paint of the
 * frame the change arrived in, which is one frame later than the effect that reads it —
 * exactly the lag that makes it the *previous* height. Everything else about the animation,
 * including what `auto` and `min(50vh, 420px)` come to, stays Motion's to work out.
 *
 * # Ease a step change, take everything else outright
 *
 * A step change is a transition: the surface travels alongside the content crossing over
 * inside it, on the same duration and curve, because it is one gesture and two curves read
 * as two events.
 *
 * Any other change of the declared height is not. A wizard that mounts is not a wizard
 * changing height; a closed one is not on screen to be watched travelling; and a length
 * that retracks because the viewport changed is a new fact about the layout rather than a
 * step of the run. All of those go through by *taking the inline height off* and leaving the
 * element on the variable — which is also the only way to be sure nothing of a previous
 * animation is left on it.
 *
 * # A real height, not a scale
 *
 * The `height` property is animated, so every frame is a layout: the box really is that
 * tall, and everything positioned against its edges is where it belongs for free. That is
 * what makes the bottom-anchored footer ride the surface as it grows and shrinks, and why
 * neither band needs an animation of its own.
 *
 * A FLIP — measure both ends, hold the box at its new size and scale it back — would be
 * the cheaper frame and the wrong picture. A scaled surface is a scaled *everything*: the
 * footer's text, its hairline and the corner radius all stretch with the box, and the
 * chrome would have to be counter-scaled the whole way down to look still. Height is one
 * of the few properties where the layout cost buys something a transform cannot fake.
 */
export const useWizardHeight = ({ duration, height, open, step }: UseWizardHeightOptions): WizardHeightResult => {
  const prefersReducedMotion = useReducedMotion();
  const surface = useRef<HTMLElement | null>(null);
  const header = useBandHeight();
  const footer = useBandHeight();

  const isFit = height === 'fit';
  // Both the declaration and what Motion is asked to reach: one value, so the height the
  // element is left on when nothing is animating and the height it animates to cannot
  // disagree.
  const declared = isFit ? 'auto' : typeof height === 'number' ? `${height}px` : height;

  const previousStep = useRef(step);
  // The surface's height as it was last laid out, which is where a step change has to
  // travel from. A ref and not state: nothing renders from it, and it is written by an
  // observer that would otherwise fire a re-render on every frame of the animation.
  const laidOut = useRef<number | null>(null);
  // Nothing to travel from on the first commit, and nothing to write either: the
  // declaration is already on the element, from the variable.
  const hasStyled = useRef(false);

  const setSurface = useCallback((node: HTMLElement | null) => {
    surface.current = node;

    if (node === null || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver((entries) => {
      const box = entries.at(-1)?.borderBoxSize[0];

      if (box !== undefined) laidOut.current = box.blockSize;
    });

    observer.observe(node, { box: 'border-box' });

    return () => {
      observer.disconnect();
      laidOut.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const stepped = previousStep.current !== step;
    previousStep.current = step;

    const node = surface.current;
    const first = !hasStyled.current;
    hasStyled.current = true;

    if (node === null || first) return;

    const from = laidOut.current;

    if (!(stepped && open && !prefersReducedMotion) || from === null) {
      // Nothing to travel, so nothing inline: the element goes back on its declaration,
      // which is the variable. Cleared rather than animated with a zero duration, because a
      // target Motion considers already reached is a call that returns without touching the
      // element at all — and what a finished animation left inline would stay on it.
      node.style.removeProperty('height');

      return;
    }

    // Back where the surface was standing. Both halves of this are needed: the element,
    // because Motion re-measures the origin off the box no matter what it was handed, and
    // the explicit first keyframe, because without one Motion takes the origin from the
    // value it cached last time — `auto`, and an `auto` to `auto` animation is one it
    // rightly declines to run at all.
    node.style.height = `${from}px`;

    const animation = animate(node, { height: [`${from}px`, declared] }, { duration, ease: STEP_TRANSITION_EASE });

    return () => {
      // Only stopped, never reset: a stop leaves the height where it had reached, and the
      // observer has been recording that all along, so the next run starts from there.
      animation.stop();
    };
  }, [declared, duration, open, prefersReducedMotion, step]);

  return {
    declared,
    isFit,
    padBottom: footer.pad ?? '0px',
    padTop: header.pad ?? '0px',
    setFooter: footer.setNode,
    setHeader: header.setNode,
    setSurface,
  };
};

/**
 * A chrome band's height as a px length, kept current.
 *
 * A `ResizeObserver`, because the event that matters is *the band's own content changing
 * at a fixed width* — a title that wraps, a font that arrives, a row of dots that gains
 * one — and it has to keep arriving for a wizard that is laid out while closed.
 *
 * Observed from the ref callback rather than an effect, so the observer belongs to the
 * exact node it was handed and detaches with it. The attach also reads the height itself
 * instead of waiting to be told: an observer's first delivery lands after the paint that
 * follows this commit, and that is one painted frame a step would spend padded by nothing,
 * sitting under the header. A ref callback runs against a mutated DOM, so the read forces
 * layout and gets a real answer, and a state update from one is flushed before the browser
 * paints.
 *
 * `offsetHeight` for that first read and `borderBoxSize` after: a rect is scaled by any
 * ancestor transform and a wizard is often inside one on the way in, while whole px is
 * close enough for a band that is only ever paid in padding. The observer refines it to
 * the fraction immediately after.
 */
const useBandHeight = (): {
  pad: string | undefined;
  setNode: (node: HTMLElement | null) => (() => void) | undefined;
} => {
  const [height, setHeight] = useState<number | null>(null);

  const setNode = useCallback((node: HTMLElement | null) => {
    if (node === null) return undefined;

    setHeight(node.offsetHeight);

    // Dropped rather than kept on the way out, so a band that comes back cannot pad by
    // the height it had the last time it was mounted.
    const forget = (): void => setHeight(null);

    if (typeof ResizeObserver === 'undefined') return forget;

    const observer = new ResizeObserver((entries) => {
      const entry = entries.at(-1);

      if (entry === undefined) return;

      const box = entry.borderBoxSize[0];
      const next = box === undefined ? entry.contentRect.height : box.blockSize;

      // Deduped at half a pixel, so sub-pixel churn cannot re-lay out the step every
      // frame it reports.
      setHeight((current) => (current !== null && Math.abs(current - next) < 0.5 ? current : next));
    });

    observer.observe(node, { box: 'border-box' });

    return () => {
      observer.disconnect();
      forget();
    };
  }, []);

  return { pad: height === null ? undefined : `${height}px`, setNode };
};
