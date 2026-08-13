import { cn } from '@monorepo/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { FC, ReactNode } from 'react';

import { useContainerLayout } from './container-context.js';
import { useNavigation } from './navigation-context.js';

export interface NavBackButtonProps {
  className?: string;
}

/** Pops the stack. Renders nothing at the root. */
export const NavBackButton: FC<NavBackButtonProps> = ({ className }) => {
  const { canGoBack, pop } = useNavigation();

  if (!canGoBack) return null;

  return (
    <button
      type="button"
      data-testid="nav-back-button"
      onClick={pop}
      aria-label="Go back"
      className={cn(
        `
          flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-sm text-neutral-700
          transition-colors
          hover:bg-black/5
          dark:text-neutral-200
          dark:hover:bg-white/10
        `,
        className
      )}
    >
      <ChevronLeft className="size-5" />
    </button>
  );
};

export interface NavTitleProps {
  className?: string;
}

/** Title of the view currently on top of the stack. */
export const NavTitle: FC<NavTitleProps> = ({ className }) => {
  const { currentView } = useNavigation();

  return (
    <div
      data-testid="nav-title"
      className={cn(
        `
          h-7 truncate text-sm/7 font-medium text-black
          dark:text-white
        `,
        className
      )}
    >
      {currentView?.title}
    </div>
  );
};

export interface NavBreadcrumbProps {
  className?: string;
}

/**
 * The whole path, root first, on one line.
 *
 * Never wraps, and elides rather than clipping. Which crumb gives up its
 * width is the design decision: the crumbs behind you shrink first and by a
 * huge factor, so the trail loses its history from the left while the place
 * you are actually standing stays readable. Shrinking evenly — or eliding the
 * end, which is what a single `truncate` on the row would do — hides the one
 * crumb the component exists to show.
 *
 * `min-w-0` is what makes any of it possible: a flex item will not shrink
 * below its own min-content width without it, so the row would just overflow.
 */
export const NavBreadcrumb: FC<NavBreadcrumbProps> = ({ className }) => {
  const { stack } = useNavigation();

  return (
    <nav
      data-testid="nav-breadcrumb"
      aria-label="Breadcrumb"
      className={cn(
        `
          flex items-center overflow-hidden text-xs whitespace-nowrap text-black/50
          dark:text-white/50
        `,
        className
      )}
    >
      {stack.map((view, i) => {
        const isCurrent = i === stack.length - 1;

        return (
          <span
            key={view.id}
            data-testid={`breadcrumb-item-${i}`}
            className={cn('flex min-w-0 items-center', isCurrent ? 'shrink' : 'shrink-[999]')}
          >
            {i > 0 && <ChevronRight className="size-3 shrink-0" aria-hidden="true" />}
            {/* `title` so an elided crumb is still readable on hover. */}
            <span className="truncate" title={view.title} aria-current={isCurrent ? 'page' : undefined}>
              {view.title}
            </span>
          </span>
        );
      })}
    </nav>
  );
};

export interface NavHeaderProps {
  children: ReactNode;
  className?: string;
}

/**
 * Standard header padding + stacking.
 *
 * In `overlay` mode it also has to carry its own legibility: the content
 * running underneath it is arbitrary, so the bar becomes a translucent
 * blurred material rather than staying transparent over whatever happens to
 * be there. No hairline under it — over edge-to-edge content a permanent
 * rule reads as a seam, and there is no scroll position here to reveal one
 * from.
 *
 * That material is built from two absolutely-positioned layers rather than
 * one, and the split is the fix for a hairline along the frame's top corners.
 *
 * A `backdrop-filter` puts its element on its own compositing layer, and the
 * container's rounded `overflow: hidden` is then rasterised *separately* for
 * that layer. Along the corner curve its coverage does not agree with the
 * main layer's, so a subpixel ring of content goes untinted — which reads as
 * a bright thread tracing each top corner, brightest where the curve meets
 * the straight edge. It is not a geometry problem: giving the filtered layer
 * its own concentric radius does not move the thread at all, and removing
 * *only* the `backdrop-filter` — same colour, same box, same content behind
 * it — makes it disappear. What matters is which layer carries the colour:
 *
 * - **Tint** carries the colour, and nothing else. No filter, so it is not
 *   promoted and the frame's clip rasterises it exactly as it does the view
 *   beneath: the coverages agree and there is no ring to see. It is also the
 *   layer that overdraws by `-1px` on the top and both sides, so the clip
 *   cuts through tint rather than through the join between tint and whatever
 *   is behind the frame.
 * - **Blur** carries no background at all, which is what makes it harmless
 *   to leave square and flush with the frame. Its coverage along the curve
 *   still disagrees by a subpixel, but with no colour of its own the only
 *   consequence is a hairline-thin ring that is slightly less blurred, and
 *   that is invisible.
 *
 * Painted blur-then-tint, so the tint sits over the blurred result rather
 * than being part of what gets blurred.
 *
 * Do not give the blur layer a radius to "keep it clear of the curve". It
 * was tried: a radius wider than the frame's does remove the thread, but it
 * paints a second, visibly *larger* arc inside the corner — two different
 * radii on one corner, which reads as a mistake far more loudly than the
 * hairline did. A radius equal to the frame's brings the thread back.
 * Splitting the colour off the filtered layer is the whole fix; the blur
 * layer's geometry is not part of it.
 *
 * Two further things the layers must not do. The bottom edge is never
 * overdrawn: that is the edge content is measured against, and it has to
 * stay exactly where the layout says it is. And neither layer may be pushed
 * behind the content with a negative z-index — positioned elements paint
 * above non-positioned in-flow siblings whatever the DOM order, so the
 * content needs a positioned layer of its own for order to decide. Reaching
 * for `isolation: isolate` to make a negative index behave would be worse
 * than verbose: `isolate` forms a backdrop root, and a `backdrop-filter`
 * inside one has only that subtree to sample, which is empty. The blur would
 * silently stop blurring. A mask on the container has the same trap for the
 * same reason — it does flatten the subtree into one clip and does remove the
 * thread, but it makes the container the backdrop root, so the blur clamps at
 * the frame's top edge and bands over detailed content instead.
 *
 * The layout box is untouched by any of it: both layers are out of flow, so
 * `useHeaderHeight` measures the same box it would have without them and
 * `--nav-safe-top` is unaffected. A negative margin would have overdrawn
 * just as well and taken the measured height with it.
 */
export const NavHeader: FC<NavHeaderProps> = ({ children, className }) => {
  const { headerMode } = useContainerLayout();

  return (
    <div className="relative">
      {headerMode === 'overlay' && (
        <>
          <div
            aria-hidden="true"
            data-testid="nav-header-blur"
            className="pointer-events-none absolute inset-0 backdrop-blur-md"
          />
          <div
            aria-hidden="true"
            data-testid="nav-header-tint"
            className={`
              pointer-events-none absolute -top-px -inset-x-px bottom-0 bg-white/70
              dark:bg-neutral-950/60
            `}
          />
        </>
      )}
      <div className={cn('relative flex flex-col gap-2 p-4', className)}>{children}</div>
    </div>
  );
};

/** Row layout for the back button and title. */
export const NavHeaderRow: FC<NavHeaderProps> = ({ children, className }) => (
  <div className={cn('flex min-w-0 items-center gap-2', className)}>{children}</div>
);
