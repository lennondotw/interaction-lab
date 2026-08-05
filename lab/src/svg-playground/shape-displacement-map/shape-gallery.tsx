import { cn } from '@monorepo/utils';
import { type FC } from 'react';

import { Stat } from '#src/animations/sdf-edge-trace/controls.js';

import type { GlassLook } from './glass-look.js';
import { SHAPES } from './shape-catalogue.js';
import { ShapeGlass } from './shape-glass.js';

interface ShapeGalleryProps extends GlassLook {
  className?: string;
}

/**
 * Every shape at once, under one set of parameters.
 *
 * The comparison is the whole point, and it only holds because the parameters are shared: a
 * gallery whose cards each owned their own bevel would show ten different glasses rather than
 * one glass on ten outlines. So this takes the same `GlassLook` a single card does and passes it
 * straight through.
 *
 * It takes them as props rather than reading Storybook args, and the story that renders it passes
 * constants: a gallery is a reference view, and a reference that moves is not one — the readouts
 * under the cards are only comparable across shapes if the glass is identical, and only comparable
 * across sessions if nobody has been dragging a slider. Parameters get explored one shape at a
 * time, next door.
 */
export const ShapeGallery: FC<ShapeGalleryProps> = ({ className, ...look }) => {
  // No `useDeferredValue` here. It was guarding against an args slider being dragged across ten
  // rasterisations, and the stories that render this now pass fixed parameters, so the deferral
  // and its stale-opacity branch were unreachable. If a caller ever drives it live, the deferral
  // belongs there — that is where the "catching up" affordance can actually be designed.
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-row flex-wrap items-baseline gap-x-4 gap-y-1">
        <Stat label="shapes" value={`${SHAPES.length}`} />
        <Stat label="bevel" value={`${look.bevel}px`} />
        <Stat label="thickness" value={`${look.thickness}px`} />
        <Stat label="depth" value={`${look.depth}px`} />
        <Stat label="ior" value={look.ior.toFixed(2)} />
      </div>

      <div
        className={`
          grid grid-cols-1 gap-3
          sm:grid-cols-2
          lg:grid-cols-3
          xl:grid-cols-4
        `}
      >
        {/*
          `shape` comes *after* the spread deliberately. The story's args are shared with the
          single-shape stories, so they carry a `shape` of their own; spreading them last made
          every one of these ten cards render `continuous-corner` while still keying correctly,
          which looks like a gallery of one shape and reads like a data bug rather than a
          precedence one.
        */}
        {SHAPES.map((entry) => (
          <ShapeGlass key={entry.id} {...look} shape={entry.id} />
        ))}
      </div>
    </div>
  );
};
