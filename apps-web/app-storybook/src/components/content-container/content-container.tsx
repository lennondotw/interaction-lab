import { cn } from '@monorepo/utils';
import { Slot } from 'radix-ui';
import type { FC, ReactNode } from 'react';

export interface ContentContainerProps {
  /**
   * Merge the container's classes onto the single child element instead of
   * wrapping it in a `div`. Use it when the child already is the semantic
   * element for the band — a `section`, `article`, `header` — so the
   * layout does not cost an extra node.
   */
  asChild?: boolean;
  /**
   * Drop the width constraint and the gutter, letting the content run the
   * full width of its parent. The element still renders, so a full-bleed
   * band can carry a background of its own while a nested container
   * re-centers the content inside it.
   */
  bleed?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Centers page content at a readable width.
 *
 * The whole layout is one rule applied consistently: every band of the
 * page is a `ContentContainer`, so their left and right edges line up
 * down the whole scroll without any single band knowing the page width.
 * A band that needs an edge-to-edge background sets `bleed` and nests
 * another container inside for its content, which keeps that alignment
 * while the background escapes it.
 *
 * The gutter sits on the container rather than on the page, which is what
 * lets a `bleed` band reach the viewport edges — page-level padding would
 * inset it along with everything else. `className` is merged last, so both
 * defaults are overridable per instance: `className="max-w-3xl"` narrows
 * one band, `className="px-0"` drops its gutter.
 *
 * @example
 * ```tsx
 * <ContentContainer bleed className="bg-neutral-100">
 *   <ContentContainer>Aligned with every other band</ContentContainer>
 * </ContentContainer>
 * ```
 */
export const ContentContainer: FC<ContentContainerProps> = ({
  asChild = false,
  bleed = false,
  children,
  className,
}) => {
  const Component = asChild ? Slot.Root : 'div';

  return <Component className={cn(!bleed && 'mx-auto max-w-300 px-4', className)}>{children}</Component>;
};
