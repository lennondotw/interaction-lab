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
const slideVariants: Variants = {
  enter: (dir: number) => ({ x: dir > 0 ? SLIDE : -SLIDE, opacity: 0, filter: `blur(${BLUR}px)` }),
  center: { x: 0, opacity: 1, filter: 'blur(0px)' },
  exit: (dir: number) => ({ x: dir > 0 ? -SLIDE : SLIDE, opacity: 0, filter: `blur(${BLUR}px)` }),
};

const fadeVariants: Variants = {
  enter: { opacity: 0, filter: `blur(${BLUR}px)` },
  center: { opacity: 1, filter: 'blur(0px)' },
  exit: { opacity: 0, filter: `blur(${BLUR}px)` },
};

const slideVariantsNoFilter: Variants = {
  enter: (dir: number) => ({ x: dir > 0 ? SLIDE : -SLIDE, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -SLIDE : SLIDE, opacity: 0 }),
};

const fadeVariantsNoFilter: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
};

// Keyed lookups rather than nested ternaries — the mode / noFilter
// matrix is small but reads far better as a table.
const VARIANTS: Record<StepTransitionMode, Record<'filtered' | 'plain', Variants>> = {
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

export const StepTransition: FC<StepTransitionProps> = ({
  step,
  children,
  prev,
  next,
  mode = 'slide',
  noFilter = false,
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
  const [direction, setDirection] = useState(0);

  if (step !== lastStep) {
    setLastStep(step);
    setDirection(step > lastStep ? 1 : -1);
  }

  const resolvedDir = direction || 1;
  const variants = VARIANTS[mode][noFilter ? 'plain' : 'filtered'];
  const duration = DURATIONS[mode];

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
        <div key={step} style={fillStyle}>
          {children}
        </div>
      ) : (
        <AnimatePresence mode="popLayout" custom={resolvedDir} initial={false}>
          <motion.div
            key={step}
            custom={resolvedDir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration, ease: STEP_TRANSITION_EASE }}
            style={fillStyle}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
};
