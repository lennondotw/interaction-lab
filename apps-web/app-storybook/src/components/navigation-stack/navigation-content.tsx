import { cn } from '@monorepo/utils';
import { motion, type Transition } from 'motion/react';
import { useState, type FC, type ReactNode } from 'react';
import { useNavigation } from './navigation-context.js';
import type { NavigationView } from './use-navigation-stack.js';

const transition: Transition = { type: 'spring', stiffness: 400, damping: 40, mass: 1 };

/** How far a covered view slides back, as a fraction of the container. */
const PARALLAX_OFFSET = '-30%';

/** Dimming applied to a covered view. */
const COVERED_OVERLAY_OPACITY = 0.1;

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
 */
export const NavigationContent: FC<NavigationContentProps> = ({ renderView, className }) => {
  const { stack, direction } = useNavigation();

  /** Popped views still playing their exit animation. */
  const [leaving, setLeaving] = useState<NavigationView[]>([]);

  // Views present at mount must not animate in — otherwise the whole
  // initial stack slides across on first paint. Capturing their ids once
  // is enough: anything pushed later is absent from the set and gets the
  // entrance animation. A snapshot, not derived state, so it never updates.
  const [initialViewIds] = useState(() => new Set(stack.map((view) => view.id)));

  // Diff against the previous stack during render (React's
  // adjust-state-during-render pattern) rather than in an effect, so the
  // leaving views are already on screen for the very paint that drops
  // them from the stack — no blank frame between pop and animation.
  const [lastStack, setLastStack] = useState(stack);
  if (lastStack !== stack) {
    const stackIds = new Set(stack.map((view) => view.id));
    const removed = lastStack.filter((view) => !stackIds.has(view.id));
    setLastStack(stack);
    // Re-pushing an id that is still leaving would collide on `key`, so
    // anything back in the stack is dropped from the leaving set.
    setLeaving((prev) => [...prev.filter((view) => !stackIds.has(view.id)), ...removed]);
  }

  const dropLeaving = (viewId: string): void => {
    setLeaving((prev) => prev.filter((view) => view.id !== viewId));
  };

  const entries = [
    ...stack.map((view, index) => ({ view, index, isExiting: false })),
    // Leaving views paint above everything so they cover the view they reveal.
    ...leaving.map((view) => ({ view, index: stack.length, isExiting: true })),
  ];

  return (
    <div data-testid="navigation-content" className={cn('relative isolate flex-1 overflow-clip', className)}>
      {entries.map(({ view, index, isExiting }) => {
        const isTop = !isExiting && index === stack.length - 1;

        // Top sits at rest, covered views park slightly back for parallax,
        // and an exiting view slides all the way out to the right.
        const targetX = isExiting ? '100%' : isTop ? 0 : PARALLAX_OFFSET;

        // Covered views are inert and hidden: `visibility` keeps them out
        // of the a11y tree and off the paint path while still mounted.
        const isCovered = !isTop && !isExiting;

        return (
          <motion.div
            key={view.id}
            data-testid={`navigation-view-${view.id}`}
            data-view-id={view.id}
            data-view-status={isTop ? 'active' : isExiting ? 'exiting' : 'background'}
            initial={initialViewIds.has(view.id) ? false : { x: direction === 'push' && isTop ? '100%' : targetX }}
            animate={{ x: targetX, zIndex: index, visibility: isCovered ? 'hidden' : 'visible' }}
            transition={transition}
            onAnimationComplete={() => {
              if (isExiting) dropLeaving(view.id);
            }}
            className={cn(
              `
                absolute inset-0 bg-neutral-200
                dark:bg-neutral-900
              `,
              !isTop && 'pointer-events-none select-none'
            )}
            style={{ zIndex: index, contain: 'layout style paint' }}
          >
            {renderView(view, index)}
            <motion.div
              initial={initialViewIds.has(view.id) ? false : { opacity: 0 }}
              animate={{ opacity: isCovered ? COVERED_OVERLAY_OPACITY : 0 }}
              transition={transition}
              className="pointer-events-none absolute inset-0 bg-black"
            />
          </motion.div>
        );
      })}
    </div>
  );
};
