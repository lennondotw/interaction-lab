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
import { useContext, useRef, type HTMLAttributes } from 'react';

import { useRegisteredRect } from '#src/animations/sdf-edge-trace/rect-registry.js';

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

export const MetaSurfaceItem = ({
  asChild = false,
  radius,
  shapeOnly = false,
  className,
  children,
  ...props
}: MetaSurfaceItemProps) => {
  const ref = useRef<HTMLDivElement | null>(null);

  // Read from separate contexts, not destructured out of one bundled object — see
  // `context.ts`. The hook's `measure` must stay identity-stable, and the compiler can
  // only guarantee that when its inputs are direct context reads.
  const registry = useContext(MetaSurfaceRegistryContext);
  const containerRef = useContext(MetaSurfaceContainerContext);

  useRegisteredRect(ref, registry, containerRef, radius);

  const Component = asChild ? Slot.Root : 'div';

  return (
    <Component ref={ref} data-slot="meta-surface-item" className={cn(shapeOnly && 'invisible', className)} {...props}>
      {children}
    </Component>
  );
};
