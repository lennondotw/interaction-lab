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
 * It is also what keeps React and Motion off each other. The animation writes an inline
 * `height` in px and React only ever writes the variable, so a re-render mid-animation
 * cannot reset the height to its declaration. Fighting over one property is what an
 * inline declaration here would produce, and the symptom is a surface that snaps back
 * on every unrelated state change.
 *
 * An unset variable makes `height: var(--wizard-height)` invalid at computed-value
 * time, which resolves to `auto` — exactly the fit mode's declaration, so that mode
 * needs no second class.
 */
export const WIZARD_HEIGHT_VAR = '--wizard-height';

export const WIZARD_HEIGHT_CLASS = 'h-(--wizard-height)';

/** One frame past the transition, so a measurement landing with it is still part of it. */
const EASE_WINDOW_TAIL_MS = 60;

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
  /** For the element the px height is animated on. */
  setSurface: (node: HTMLElement | null) => void;
  /** For the content column, measured in `fit` mode and ignored in the other. */
  setColumn: (node: HTMLElement | null) => (() => void) | undefined;
  /** For the probe, which is rendered only when `needsProbe`. */
  setProbe: (node: HTMLElement | null) => (() => void) | undefined;
  isFit: boolean;
  /** The CSS length for `WIZARD_HEIGHT_VAR`, or `undefined` in `fit` mode. */
  declared: string | undefined;
  /** Whether the declared height has to be measured before it can be animated to. */
  needsProbe: boolean;
}

/**
 * Resolves a wizard's height to a number and moves the surface onto it.
 *
 * # Why a number at all, and why a probe
 *
 * Interpolation needs two numbers, and most of what a height can be here is not one:
 * `'fit'` is a measurement, and a CSS length may be `60vh` or a `min()` over one.
 * Neither can be read out of JS — `getComputedStyle` returns custom properties as
 * specified, `innerHeight` is not `svh`, and hard-coding a viewport allowance is
 * inventing the layout engine's answer. So a length is *laid out* rather than parsed:
 * an empty, unpainted, zero-width box at exactly that height reports what it currently
 * comes to, and keeps reporting it across viewport changes for free.
 *
 * The fit height is the content column's own box. Measured rather than summed, so a
 * header and a footer cost nothing to support — they are inside the column, so they are
 * already inside the number.
 *
 * # Ease a step change, track a measurement
 *
 * Two different things move this height and they want opposite treatment.
 *
 * A step change is a transition: the surface travels alongside the content crossing
 * over inside it, on the same duration and curve, because it is one gesture and two
 * curves read as two events.
 *
 * A fresh measurement of the step already showing is not a transition at all. Content
 * that grows — a nested wizard landing a step, an image arriving, a line of copy
 * wrapping — either eased itself one level down or did not ease at all, and easing it
 * again out here makes the surface *trail* its own content: the column resizes
 * instantly, so for the length of the lag the content is taller than the surface and
 * the clip cuts it off, which reads as the surface flinching and catching up. Tracked
 * outright, the content is what moves and the surface is simply always around it.
 *
 * So the envelope is chosen per change, and the eased one is held for a **window**
 * after a step change rather than for the one commit it happened in — the step that has
 * just arrived is usually still settling, and the measurements that land while it does
 * are part of the step. A timestamp in a ref, not state: the window has to survive the
 * re-renders inside it without a timer to cancel and without a state update per frame.
 *
 * # Motion, not a CSS transition
 *
 * Two independent reasons, both of which make the CSS form — the one anybody reaches
 * for first — do nothing.
 *
 * A CSS transition only animates a value that changes while the transition property is
 * *already* in force on a painted frame. Here the height and the decision to animate it
 * are the same fact, known in the same commit, so the surface would snap to every new
 * height and then have an animation armed for a value that had already arrived.
 *
 * And the target moves. A fit height re-reports as its content settles, so the
 * destination is not fixed; re-declaring a CSS transition mid-flight *cancels* the
 * running one, where Motion animates from wherever the value currently is. That is the
 * whole of what "continuous" means here, and it is why the cleanup only `stop()`s:
 * stopping leaves the height where it had reached, which is where the next run should
 * start from.
 */
export const useWizardHeight = ({ duration, height, open, step }: UseWizardHeightOptions): WizardHeightResult => {
  const prefersReducedMotion = useReducedMotion();
  const surface = useRef<HTMLElement | null>(null);
  const column = useMeasuredHeight();
  const probe = useMeasuredHeight();

  const isFit = height === 'fit';
  // A bare number is already px; anything else has to be laid out to be known.
  const needsProbe = !isFit && typeof height === 'string';
  const declared = isFit ? undefined : typeof height === 'number' ? `${height}px` : height;
  const target = isFit ? column.height : typeof height === 'number' ? height : probe.height;

  const easesUntil = useRef(0);
  const previousStep = useRef(step);
  const previousOpen = useRef(open);
  // Nothing to travel from on the first write. A wizard appearing is not a wizard
  // changing height, and the same holds for one that mounted at a height it is only now
  // measuring for the first time.
  const hasHeight = useRef(false);

  const setSurface = useCallback((node: HTMLElement | null) => {
    surface.current = node;
  }, []);

  useLayoutEffect(() => {
    if (previousStep.current !== step) {
      previousStep.current = step;

      easesUntil.current = performance.now() + duration * 1000 + EASE_WINDOW_TAIL_MS;
    }

    // Tracked separately from the step, and it *closes* the window rather than opening
    // one: a wizard whose run was rewound while it was closed has both facts arriving
    // in the same commit, and the step change is the one that must not be honoured —
    // the height it would travel to is the height the user is about to see first.
    if (previousOpen.current !== open) {
      previousOpen.current = open;

      easesUntil.current = 0;
    }

    const node = surface.current;

    // Zero is a box that has not laid out rather than a surface with no room in it,
    // which is also the state a first paint and a host with no layout engine are in.
    if (node === null || target === null || target <= 0) return;

    const eases = open && !prefersReducedMotion && hasHeight.current && performance.now() < easesUntil.current;

    hasHeight.current = true;

    const animation = animate(
      node,
      { height: target },
      eases ? { duration, ease: STEP_TRANSITION_EASE } : { duration: 0 }
    );

    return () => {
      animation.stop();
    };
  }, [duration, open, prefersReducedMotion, step, target]);

  return {
    declared,
    isFit,
    needsProbe,
    setColumn: column.setNode,
    setProbe: probe.setNode,
    setSurface,
  };
};

/**
 * An element's border-box height, kept current.
 *
 * A `ResizeObserver` and not an `IntersectionObserver`: the event that matters is
 * *content growing at a fixed width*, which is a resize and not an intersection change
 * — and it has to keep arriving for a wizard that is laid out while closed.
 *
 * Observed from the ref callback rather than an effect, so the observer belongs to the
 * exact node it was handed and detaches with it. `null` until the observer's first
 * delivery is a real state and not a placeholder for zero: the caller leaves the height
 * to its declaration while it holds, which is `auto` in the mode that needs measuring.
 * That is also the whole fallback where `ResizeObserver` is missing — nothing animates
 * and everything still lays out.
 */
const useMeasuredHeight = (): {
  height: number | null;
  setNode: (node: HTMLElement | null) => (() => void) | undefined;
} => {
  const [height, setHeight] = useState<number | null>(null);

  const setNode = useCallback((node: HTMLElement | null) => {
    if (node === null || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver((entries) => {
      const entry = entries.at(-1);

      if (entry === undefined) return;

      // `borderBoxSize` over `getBoundingClientRect`: it is layout px, unaffected by any
      // ancestor transform, and fractional — a rounded `offsetHeight` would leave the
      // animation landing up to a px away from where the content actually sits.
      const box = entry.borderBoxSize[0];
      const next = box === undefined ? entry.contentRect.height : box.blockSize;

      // Deduped at half a pixel, so sub-pixel churn cannot re-target the animation
      // every frame it reports — which reads as a height that never quite settles.
      setHeight((current) => (current !== null && Math.abs(current - next) < 0.5 ? current : next));
    });

    observer.observe(node, { box: 'border-box' });

    return () => {
      observer.disconnect();
      // Dropped rather than kept, so a box that comes back — the probe, when a run
      // steps from a fit height to a declared one — cannot be animated to the length
      // it had the last time it was mounted.
      setHeight(null);
    };
  }, []);

  return { height, setNode };
};
