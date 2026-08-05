/**
 * A consumer of `MetaSurface`, written the way one should be: it knows nothing about
 * fields, contours, tracers, or observation cascades.
 *
 * The whole surface story from a consumer's seat is two components and three props. The
 * buttons are buttons — real elements, in a real flex row, with their own padding and
 * their own hit areas and their own focus rings — and the group is what merges their
 * shapes when they sit close and lets them separate when they do not.
 *
 * Which is the test this file exists to be. Everything upstream of it could be correct
 * and still be unusable if a participant had to be a special kind of element, or if
 * merging cost the buttons their keyboard behaviour, or if the surface had to be told
 * the layout in advance. None of that is the case, and the way to demonstrate it is to
 * write an ordinary component and let it stay ordinary.
 */

import { cn } from '@monorepo/utils';
import type { FC, ReactNode } from 'react';
import { MetaSurface } from './meta-surface.js';

export interface ToolbarAction {
  id: string;
  label: string;
  icon: ReactNode;
}

export interface ToolbarGroupProps {
  actions: readonly ToolbarAction[];
  /** Currently pressed action id, if any. */
  activeId?: string | null;
  onSelect?: (id: string) => void;
  /** Space between buttons. Below roughly the blend distance they visually fuse. */
  gap?: number;
  className?: string;
}

export const ToolbarGroup: FC<ToolbarGroupProps> = ({ actions, activeId = null, onSelect, gap = 10, className }) => (
  <MetaSurface
    blend={26}
    outline={1.5}
    fill="rgb(255 255 255 / 0.06)"
    outlineColor="rgb(255 255 255 / 0.22)"
    className={cn('w-fit', className)}
  >
    <div className="flex flex-row items-center p-2" style={{ gap }}>
      {actions.map((action) => (
        <MetaSurface.Item key={action.id} asChild radius={14}>
          <button
            type="button"
            aria-pressed={activeId === action.id}
            title={action.label}
            onClick={() => onSelect?.(action.id)}
            className={cn(
              `
                flex size-11 shrink-0 items-center justify-center rounded-[14px] text-neutral-300 transition-colors
                hover:text-white
                focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none
              `,
              activeId === action.id && 'text-white'
            )}
          >
            {action.icon}
            <span className="sr-only">{action.label}</span>
          </button>
        </MetaSurface.Item>
      ))}
    </div>
  </MetaSurface>
);
