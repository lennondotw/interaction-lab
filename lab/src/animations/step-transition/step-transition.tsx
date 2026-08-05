import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react';
import { useState, type CSSProperties, type FC, type ReactNode } from 'react';

import { STEP_FADE_DURATION, STEP_SLIDE_DURATION, STEP_TRANSITION_EASE } from './timing.js';

export type StepTransitionMode = 'slide' | 'fade';

export interface StepTransitionProps {
  step: number;
  children: ReactNode;
  /**
   * Rendered offscreen (hidden, inert) so the neighbouring steps' images
   * / fonts / layout are warm before the user navigates to them. Leave
   * undefined to opt out of prefetching.
   */
  prev?: ReactNode;
  next?: ReactNode;
  mode?: StepTransitionMode;
  /**
   * Skip the `filter: blur(…)` leg of the variants. The `center`
   * keyframe then lands at a plain transform / opacity state with no
   * `filter` on the settled motion.div, so the wrapper is NOT a
   * "backdrop root" (CSS Filter Effects 2) and any descendant
   * `backdrop-filter` continues to sample the real composited backdrop.
   *
   * Pass this whenever a step renders `backdrop-filter` inline — for
   * example a progressive-blur strip over a scrolling grid. Without it,
   * Chromium traps those strips against the step's offscreen buffer and
   * paints seam artifacts under the mask gradient.
   *
   * Spec: https://drafts.fxtf.org/filter-effects-2/#BackdropRoot
   *
   * @default false
   */
  noFilter?: boolean;
  /**
   * Lay the showing step out in normal flow instead of `absolute inset-0`.
   *
   * Off by default because a step that fills its host is what a fixed-size stage
   * wants, and it is also the only shape that works without a host size: every step
   * is out of flow, so the wrapper has no intrinsic height at all and the caller is
   * expected to give it one.
   *
   * On, the showing step keeps a natural height and the wrapper is as tall as
   * whatever is currently showing — which is what a surface that fits its content
   * has to measure. The step *leaving* still goes out of flow either way:
   * `AnimatePresence mode='popLayout'` pins it at its old box, so it slides out
   * without holding the wrapper open at the height it is leaving.
   *
   * @default false
   */
  inFlow?: boolean;
  className?: string;
  style?: CSSProperties;
}

const SLIDE = 80;
const BLUR = 8;

// The `center` variant of the filter variants below lands at
// `filter: blur(0px)` rather than `filter: 'none'`, because Motion's
// value-per-variant interpolation requires a non-null target in the same
// shape as the `enter` / `exit` keyframes. As a side effect the settled
// `motion.div` keeps a non-`none` filter on its inline style, which per
// CSS Filter Effects 2 makes it a "backdrop root" and traps descendant
// `backdrop-filter` against the step's offscreen buffer. The `noFilter`
// pair below drops the `filter` property entirely for that case.
/** Navigation direction recorded per step, keyed by the step it belongs to. */
export type StepDirections = Record<number, number>;

const dirOf = (dirs: StepDirections, step: number): number => dirs[step] ?? 1;

// Each child's variants close over *its own* step and look the direction up in
// the live map handed down through `custom`, rather than reading one shared
// scalar.
//
// Why the indirection. An exiting child's props are frozen at the moment it was
// removed, which is why `AnimatePresence custom` exists at all — it is the one
// live channel into a child whose props can no longer be updated. But
// AnimatePresence removes exiting children as a *batch*, so during fast
// navigation several earlier cards are still mounted and still exiting. A single
// shared scalar is re-resolved for every one of them, so one Prev press rewrites
// the direction of four stale cards at once and they all reverse back across the
// frame. A map keyed by step keeps the channel live for the card this navigation
// removed, while leaving every earlier card reading the stamp it departed with.
const slideVariants = (step: number): Variants => ({
  enter: (dirs: StepDirections) => ({
    x: dirOf(dirs, step) > 0 ? SLIDE : -SLIDE,
    opacity: 0,
    filter: `blur(${BLUR}px)`,
  }),
  center: { x: 0, opacity: 1, filter: 'blur(0px)' },
  exit: (dirs: StepDirections) => ({
    x: dirOf(dirs, step) > 0 ? -SLIDE : SLIDE,
    opacity: 0,
    filter: `blur(${BLUR}px)`,
  }),
});

const slideVariantsNoFilter = (step: number): Variants => ({
  enter: (dirs: StepDirections) => ({ x: dirOf(dirs, step) > 0 ? SLIDE : -SLIDE, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dirs: StepDirections) => ({ x: dirOf(dirs, step) > 0 ? -SLIDE : SLIDE, opacity: 0 }),
});

const fadeVariants = (): Variants => ({
  enter: { opacity: 0, filter: `blur(${BLUR}px)` },
  center: { opacity: 1, filter: 'blur(0px)' },
  exit: { opacity: 0, filter: `blur(${BLUR}px)` },
});

const fadeVariantsNoFilter = (): Variants => ({
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
});

// Keyed lookups rather than nested ternaries — the mode / noFilter
// matrix is small but reads far better as a table.
const VARIANTS: Record<StepTransitionMode, Record<'filtered' | 'plain', (step: number) => Variants>> = {
  slide: { filtered: slideVariants, plain: slideVariantsNoFilter },
  fade: { filtered: fadeVariants, plain: fadeVariantsNoFilter },
};

const DURATIONS: Record<StepTransitionMode, number> = {
  slide: STEP_SLIDE_DURATION,
  fade: STEP_FADE_DURATION,
};

const hiddenStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  visibility: 'hidden',
  pointerEvents: 'none',
};

const fillStyle: CSSProperties = { position: 'absolute', inset: 0 };

/**
 * The `inFlow` counterpart. Still a positioning context, so `popLayout`'s absolute
 * pin on the outgoing step resolves against the wrapper rather than against
 * whatever further up the tree happens to be positioned.
 */
const inFlowStyle: CSSProperties = { position: 'relative' };

export const StepTransition: FC<StepTransitionProps> = ({
  step,
  children,
  prev,
  next,
  mode = 'slide',
  noFilter = false,
  inFlow = false,
  className,
  style,
}) => {
  const prefersReducedMotion = useReducedMotion();

  // Track last rendered step + direction via React state so render stays
  // pure. Mutating refs during render would desync when React 19's
  // concurrent scheduler aborts a render — that shows up as spurious key
  // churn which flickers AnimatePresence.
  //
  // The "setState during render" pattern, gated by `step !== lastStep`,
  // is the React-sanctioned way to derive state from a changed prop.
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [lastStep, setLastStep] = useState(step);
  const [directions, setDirections] = useState<StepDirections>({});

  if (step !== lastStep) {
    const dir = step > lastStep ? 1 : -1;
    setLastStep(step);
    // Stamp both ends of *this* navigation and nothing else: `lastStep` is
    // leaving now, so it exits in this direction, and `step` is arriving, so it
    // enters from this side. Steps stamped by earlier navigations keep their
    // own value even while they are still on screen exiting.
    setDirections((current) => ({ ...current, [lastStep]: dir, [step]: dir }));
  }

  const variants = VARIANTS[mode][noFilter ? 'plain' : 'filtered'](step);
  const duration = DURATIONS[mode];
  const stepStyle = inFlow ? inFlowStyle : fillStyle;

  return (
    <div className={className} style={{ position: 'relative', ...style }}>
      {prev != null && (
        <div key={`pre-prev-${step}`} style={hiddenStyle} aria-hidden="true">
          {prev}
        </div>
      )}
      {next != null && (
        <div key={`pre-next-${step}`} style={hiddenStyle} aria-hidden="true">
          {next}
        </div>
      )}

      {prefersReducedMotion ? (
        <div key={step} style={stepStyle}>
          {children}
        </div>
      ) : (
        <AnimatePresence mode="popLayout" custom={directions} initial={false}>
          <motion.div
            key={step}
            custom={directions}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration, ease: STEP_TRANSITION_EASE }}
            style={stepStyle}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
};
