import { cn } from '@monorepo/utils';
import { motion } from 'motion/react';
import { useState, type FC, type ReactNode } from 'react';

import { useNavigation } from './navigation-context.js';
import {
  AT_REST,
  coveredPose,
  isInstant,
  offscreenPose,
  presentationTransition,
  resolvePresentation,
  wrapperTarget,
} from './navigation-presentation.js';
import { useNavigationFocus } from './use-navigation-focus.js';
import type { NavigationView } from './use-navigation-stack.js';

export interface NavigationContentProps {
  renderView: (view: NavigationView, index: number) => ReactNode;
  className?: string;
}

/**
 * Renders every view in the stack and keeps them all mounted, so going
 * back doesn't remount (and re-fetch, re-scroll, re-animate) the view
 * underneath.
 *
 * The rendered set is the live stack plus any view that has been popped
 * but is still sliding out. Only that leaving set is state — everything
 * else is derived from the stack during render, so the two can't drift
 * apart the way a mirrored copy would.
 *
 * Each view carries its own `presentation`, so one stack can mix a push
 * that slides, one that covers from the bottom and one that dissolves.
 * A presentation is a *pair* of poses, never just an entrance: the
 * backward park that reads as depth under a slide reads as a glitch
 * under a fade, so `coveredPose` is keyed on the presentation of the
 * view above rather than on the covered view's own.
 *
 * Exactly one view is interactive: the one on top. Every other view —
 * covered or sliding out — is inert from the very paint that demotes it,
 * so it can't be tabbed into or read by a screen reader while it is
 * still on screen. {@link useNavigationFocus} then moves focus into the
 * new top view, since making its old home inert is what took it away.
 */
export const NavigationContent: FC<NavigationContentProps> = ({ renderView, className }) => {
  const { stack, direction } = useNavigation();

  const topView = stack[stack.length - 1];
  const activeViewId = topView?.id ?? null;
  const coveredIds = stack.slice(0, -1).map((view) => view.id);

  const { rootRef, onFocus } = useNavigationFocus(activeViewId);

  /** Popped views still playing their exit animation. */
  const [leaving, setLeaving] = useState<NavigationView[]>([]);

  // Views present at mount must not animate in — otherwise the whole
  // initial stack slides across on first paint. Capturing their ids once
  // is enough: anything pushed later is absent from the set and gets the
  // entrance animation. A snapshot, not derived state, so it never updates.
  const [initialViewIds] = useState(() => new Set(stack.map((view) => view.id)));

  // Covered views that can now be taken off the paint path with
  // `visibility: hidden`. Deliberately not a motion `animate` value:
  // motion would only write `visible` back on the reveal animation's first
  // tick, one frame after the paint that promotes the view — and a hidden
  // element cannot take focus, so that one frame is enough to lose the
  // focus restore. Anything covered at mount is already parked.
  const [hiddenViewIds, setHiddenViewIds] = useState<ReadonlySet<string>>(() => new Set(coveredIds));

  // Diff against the previous stack during render (React's
  // adjust-state-during-render pattern) rather than in an effect, so the
  // leaving views are already on screen for the very paint that drops
  // them from the stack — no blank frame between pop and animation.
  const [lastStack, setLastStack] = useState(stack);
  if (lastStack !== stack) {
    const stackIds = new Set(stack.map((view) => view.id));
    const removed = lastStack.filter((view) => !stackIds.has(view.id));
    setLastStack(stack);
    setLeaving((prev) => [
      // Re-pushing an id that is still leaving would collide on `key`, so
      // anything back in the stack is dropped from the leaving set.
      ...prev.filter((view) => !stackIds.has(view.id)),
      // An `instant` view has no exit to play. Dropping it here rather
      // than mounting it for one zero-duration frame is what makes it
      // genuinely instant, in both directions.
      ...removed.filter((view) => !isInstant(view.presentation)),
    ]);
    const stillCovered = new Set(coveredIds);
    setHiddenViewIds((prev) => {
      // A view that is no longer covered is visible again from this very
      // paint, so it is focusable by the time the focus hook runs.
      const next = new Set([...prev].filter((viewId) => stillCovered.has(viewId)));
      // An `instant` push never animates, so nothing will fire
      // `onAnimationComplete` to park what it covers — it has to happen here.
      if (isInstant(topView?.presentation)) for (const viewId of stillCovered) next.add(viewId);
      return next.size === prev.size && [...next].every((viewId) => prev.has(viewId)) ? prev : next;
    });
  }

  const dropLeaving = (viewId: string): void => {
    setLeaving((prev) => prev.filter((view) => view.id !== viewId));
  };

  const hideCovered = (viewIds: readonly string[]): void => {
    setHiddenViewIds((prev) => {
      if (viewIds.every((viewId) => prev.has(viewId))) return prev;
      const next = new Set(prev);
      for (const viewId of viewIds) next.add(viewId);
      return next;
    });
  };

  // Whichever view's presentation is driving this navigation: the arriving
  // one on a push, the departing one on a pop. Every view that moves
  // *because of* it borrows its curve, so a fade-in and the slide-back
  // beneath it can never be on two different clocks — which is exactly
  // what would happen if each view used its own presentation's timing.
  const drivingPresentation =
    direction === 'pop' && leaving.length > 0
      ? resolvePresentation(leaving[leaving.length - 1]?.presentation)
      : resolvePresentation(topView?.presentation);

  const entries = [
    ...stack.map((view, index) => ({ view, index, isExiting: false })),
    // Leaving views paint above everything so they cover the view they reveal.
    ...leaving.map((view) => ({ view, index: stack.length, isExiting: true })),
  ];

  return (
    <div
      ref={rootRef}
      // `onFocus` is React's `focusin`, so this sees focus landing
      // anywhere inside any view.
      onFocus={onFocus}
      data-testid="navigation-content"
      className={cn('relative isolate flex-1 overflow-clip', className)}
    >
      {entries.map(({ view, index, isExiting }) => {
        const isTop = !isExiting && index === stack.length - 1;
        const isCovered = !isTop && !isExiting;

        // Top sits at rest; an exiting view retraces its own entrance;
        // a covered view answers to the presentation of the view above it.
        const pose = isExiting
          ? offscreenPose(view.presentation)
          : isTop
            ? AT_REST
            : coveredPose(stack[index + 1]?.presentation);

        // A covered view only goes off the paint path once the view above
        // it has *landed* — not once it has finished its own park. Those
        // used to be the same moment only because every view shared one
        // transition; now that a fade and a slide run on different clocks,
        // hiding on its own completion would cut a hole in the frame while
        // the view above was still on its way in. So `visibility` can't be
        // what keeps a demoted view out of the tab order either: it is
        // still `visible` for the length of the transition. `inert` does
        // that, from the first paint.
        const isHidden = isCovered && hiddenViewIds.has(view.id);

        // An `instant` view is mounted already at rest; every other
        // entrance starts offscreen. Views present at first paint start at
        // rest too, or the whole initial stack animates in.
        const skipEntrance = initialViewIds.has(view.id) || isInstant(view.presentation);
        const entrancePose = isTop ? offscreenPose(view.presentation) : pose;

        return (
          <motion.div
            key={view.id}
            // Focusable only as a target for `useNavigationFocus`, never
            // by Tab; labelled so a screen reader announces which view
            // focus just landed in.
            tabIndex={-1}
            inert={!isTop}
            // A labelled grouping with no native equivalent that fits — the rule
            // proposes address/details/fieldset/hgroup/optgroup, none of which is
            // a navigation view container.
            // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
            role="group"
            aria-label={view.title}
            data-testid={`navigation-view-${view.id}`}
            data-view-id={view.id}
            data-view-status={isTop ? 'active' : isExiting ? 'exiting' : 'background'}
            data-view-presentation={resolvePresentation(view.presentation)}
            initial={skipEntrance ? false : wrapperTarget(entrancePose)}
            animate={wrapperTarget(pose)}
            transition={presentationTransition(isExiting ? view.presentation : drivingPresentation)}
            onAnimationComplete={() => {
              if (isExiting) dropLeaving(view.id);
              else if (isTop) hideCovered(coveredIds);
            }}
            className={cn(
              `
                absolute inset-0 bg-neutral-200 outline-none
                dark:bg-neutral-900
              `,
              // `inert` already swallows pointer events, but it does not
              // let them through to the view underneath — an exiting view
              // would go on blocking hover and clicks for the whole slide.
              !isTop && 'pointer-events-none select-none'
            )}
            // Stacking order is a fact about the stack, not something to
            // interpolate — so it stays out of `animate`, which would tween
            // it through fractional values and fight this declaration for
            // ownership of the same property.
            style={{ zIndex: index, contain: 'layout style paint', visibility: isHidden ? 'hidden' : 'visible' }}
          >
            {renderView(view, index)}
            <motion.div
              initial={skipEntrance ? false : { opacity: entrancePose.dim }}
              animate={{ opacity: pose.dim }}
              transition={presentationTransition(drivingPresentation)}
              className="pointer-events-none absolute inset-0 bg-black"
            />
          </motion.div>
        );
      })}
    </div>
  );
};
