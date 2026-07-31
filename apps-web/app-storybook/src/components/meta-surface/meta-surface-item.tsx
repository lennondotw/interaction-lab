/**
 * A participant. An ordinary element that happens to contribute its own laid-out
 * rect to the surface's field.
 *
 * It owns its layout completely — the surface reads the box the CSS box model
 * produced and never writes to it. So an item can be a flex child, can carry
 * padding, can wrap text, can be `asChild`'d onto whatever element the content
 * actually wants; nothing here constrains it. And because the overlay paints
 * elsewhere and takes no pointer events, an item keeps its own hit area too.
 */

import { cn } from '@monorepo/utils';
import { Slot } from 'radix-ui';
import { useCallback, useContext, useEffect, useId, useRef, type HTMLAttributes } from 'react';
import { layoutOffsetRelativeTo } from '../beacon/layout-offset.js';
import { useLayoutObservation } from '../beacon/use-layout-observation.js';
import { MetaSurfaceContainerContext, MetaSurfaceRegistryContext } from './context.js';

export interface MetaSurfaceItemProps extends HTMLAttributes<HTMLElement> {
  /**
   * Merge onto the single child element instead of wrapping it in a `div`. Use it
   * when the child already is the right element — the surface only needs a box.
   */
  asChild?: boolean;
  /**
   * Corner radius fed to the field, in px. Read from computed style when omitted,
   * which is what keeps a Tailwind `rounded-*` class working without being repeated
   * here.
   */
  radius?: number;
  /**
   * Register the rect but paint nothing of the element itself. For a participant
   * that exists only to pull the shape somewhere — a bridge, an anchor.
   */
  shapeOnly?: boolean;
}

/**
 * Largest of the four corner radii, resolved to px.
 *
 * Largest rather than an average because the field takes one radius, and rounding a
 * corner *less* than the element does makes the surface poke outside the element it
 * is supposed to be tracing. Percentage radii come back from `getComputedStyle`
 * already resolved against the box, so no unit handling is needed.
 */
const readRadius = (el: HTMLElement): number => {
  const style = getComputedStyle(el);
  const corners = [
    style.borderTopLeftRadius,
    style.borderTopRightRadius,
    style.borderBottomRightRadius,
    style.borderBottomLeftRadius,
  ];
  let largest = 0;
  for (const corner of corners) {
    // A two-value corner ("12px 30px") is elliptical; the first value is the
    // horizontal radius and is the closer of the two to what a circular corner
    // radius means here.
    const first = Number.parseFloat(corner);
    if (Number.isFinite(first) && first > largest) largest = first;
  }
  return largest;
};

export const MetaSurfaceItem = ({
  asChild = false,
  radius,
  shapeOnly = false,
  className,
  children,
  ...props
}: MetaSurfaceItemProps) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const id = useId();

  // Read from separate contexts, not destructured out of one bundled object — see
  // `context.ts`. `measure` below must stay identity-stable, and the compiler can
  // only guarantee that when its inputs are direct context reads.
  const registry = useContext(MetaSurfaceRegistryContext);
  const containerRef = useContext(MetaSurfaceContainerContext);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el || registry === null) return;

    // Same reading as the beacon's: `offsetWidth` / `offsetHeight` plus the
    // `offsetParent` walk, so the surface follows where the box model *lays the item
    // out* and is immune to presentation transforms above it. That is a contract, not
    // a limitation — a card sliding on a transform keeps its lobe where its layout
    // is, which is what makes the merged shape stable while something animates over
    // it. Following the visual rect would need rAF sampling of
    // `getBoundingClientRect`, since transforms fire no observer.
    const container = containerRef?.current ?? null;
    const layout = layoutOffsetRelativeTo(el, container);
    if (layout === null) return;

    registry.set(id, {
      x: layout.x,
      y: layout.y,
      width: el.offsetWidth,
      height: el.offsetHeight,
      radius: radius ?? readRadius(el),
    });
  }, [containerRef, id, radius, registry]);

  useLayoutObservation(ref, containerRef, measure, { enabled: registry !== null });

  useEffect(() => () => registry?.delete(id), [id, registry]);

  const Component = asChild ? Slot.Root : 'div';

  return (
    <Component ref={ref} data-slot="meta-surface-item" className={cn(shapeOnly && 'invisible', className)} {...props}>
      {children}
    </Component>
  );
};
