import { cn } from '@monorepo/utils';
import { motion, useMotionTemplate, useTransform, type MotionValue } from 'motion/react';
import type { FC } from 'react';

import { useWheel } from './use-wheel.js';
import {
  drumOverscan,
  drumRadius,
  drumRow,
  rowDistance,
  rowFade,
  rowIndex,
  rowSlots,
  rowTop,
  viewportHeight,
} from './wheel-geometry.js';
import { WIREFRAME_FOCUS, WIREFRAME_FRAME, WIREFRAME_ITEM } from './wheel-style.js';

/** Distance to the projection plane. Large enough that the drum reads as curved rather than as a fisheye. */
const DRUM_PERSPECTIVE = 900;

export type WheelVariant = 'drum' | 'flat';

interface WheelRowProps {
  slot: number;
  offset: MotionValue<number>;
  items: readonly string[];
  itemHeight: number;
  rows: number;
  variant: WheelVariant;
  anglePerItem: number;
  contentClassName?: string;
}

/**
 * One row, positioned and labelled entirely from `offset`.
 *
 * Both the label and the transform are `useTransform` outputs, which is the point.
 * Motion recomputes a derived value in the `preRender` step of the frame and
 * writes a `MotionValue` child straight to `textContent` in the same pass, so the
 * two cannot land on different frames.
 *
 * They must not, because the failure is not subtle. When `floor(offset)`
 * increments, every row's label shifts up by one *and* every row's position drops
 * by a full `itemHeight`; the two cancel exactly. Split them across two frames —
 * by deriving the label from React state, say — and the whole column visibly jumps
 * one row height and back, on every single detent crossed. There is no edge of the
 * viewport to hide that in.
 */
const WheelRow: FC<WheelRowProps> = ({
  slot,
  offset,
  items,
  itemHeight,
  rows,
  variant,
  anglePerItem,
  contentClassName,
}) => {
  const count = items.length;

  const label = useTransform(offset, (value) => items[rowIndex({ slot, offset: value, itemHeight, count })] ?? '');
  const distance = useTransform(offset, (value) => rowDistance({ slot, offset: value, itemHeight }));

  const top = useTransform(offset, (value) => rowTop({ slot, offset: value, itemHeight, rows }));
  const flatOpacity = useTransform(distance, (value) => rowFade({ distance: value, rows }).opacity);
  const flatScale = useTransform(distance, (value) => rowFade({ distance: value, rows }).scale);

  const rotateX = useTransform(distance, (value) => drumRow({ distance: value, anglePerItem }).rotateX);
  const drumOpacity = useTransform(distance, (value) => drumRow({ distance: value, anglePerItem }).opacity);
  const radius = drumRadius({ itemHeight, anglePerItem });
  // Built as a template rather than from Motion's `rotateX` and `z` because both
  // the order and the count matter, and Motion's transform order is fixed.
  //
  // Read right to left, which is the order a point travels through it:
  //
  // - `translateZ(radius)` lifts the row off the axis onto the drum's surface.
  //   It has to come *after* the rotation in the point's journey — Motion would
  //   emit it before, which pushes an already-rotated row along the global Z and
  //   leaves every row stacked at the centre.
  // - `rotateX` turns it to its place on the arc.
  // - `translateZ(-radius)` puts the axis back where it belongs. Without it the
  //   whole drum sits `radius` closer to the viewer, and the perspective divide
  //   scales the centre row up by `perspective / (perspective - radius)` — 15% at
  //   these defaults. A centre row 15% taller than `itemHeight` no longer matches
  //   the selection band it is supposed to sit inside, so this term is not a
  //   refinement; it is what makes the drum agree with the same centre line the
  //   flat wheel and the snap maths use.
  const drumTransform = useMotionTemplate`translateZ(${-radius}px) rotateX(${rotateX}deg) translateZ(${radius}px)`;

  const isDrum = variant === 'drum';

  return (
    <motion.div
      className={cn('absolute inset-x-0 flex items-center justify-center', WIREFRAME_ITEM)}
      style={
        isDrum
          ? {
              height: itemHeight,
              // Every row starts stacked at the centre line; the rotation is what
              // distributes them around the drum.
              top: (viewportHeight({ itemHeight, rows }) - itemHeight) / 2,
              opacity: drumOpacity,
              transform: drumTransform,
            }
          : { height: itemHeight, top: 0, y: top, opacity: flatOpacity, scale: flatScale }
      }
    >
      <motion.span className={cn('tabular-nums', contentClassName)}>{label}</motion.span>
    </motion.div>
  );
};

export interface WheelColumnProps {
  /** Labels, in wheel order. Looped, so any length works — including two. */
  items: readonly string[];
  index: number;
  onIndexChange: (index: number) => void;
  itemHeight: number;
  /** Odd, and the viewport is exactly this many items tall. */
  rows: number;
  variant?: WheelVariant;
  /** Degrees between adjacent items on the drum. Ignored when flat. */
  anglePerItem?: number;
  /** Accessible name for the column, since the wheel itself carries no text. */
  label: string;
  /** Spoken value, when the bare label is not enough — `'05 minutes'` rather than `'05'`. */
  valueText?: (index: number) => string;
  className?: string;
  /**
   * Applied to the label span. Where a reserved width goes, which is how the `:`
   * is kept from moving between `9:30` and `10:30`.
   */
  contentClassName?: string;
}

/**
 * One endlessly looping column.
 *
 * `role="spinbutton"` rather than a listbox: the wheel has no end, so there is no
 * first or last option to arrow to, and `aria-valuemin`/`max` describing the
 * finite item range is a truer account of it than a list of options the user can
 * never reach the end of.
 */
export const WheelColumn: FC<WheelColumnProps> = ({
  items,
  index,
  onIndexChange,
  itemHeight,
  rows,
  variant = 'flat',
  anglePerItem = 20,
  label,
  valueText,
  className,
  contentClassName,
}) => {
  const { offset, elementRef, handlers } = useWheel({
    count: items.length,
    itemHeight,
    rows,
    index,
    onIndexChange,
  });

  const slots = rowSlots({ rows, overscan: variant === 'drum' ? drumOverscan({ rows, anglePerItem }) : 0 });

  return (
    <div
      aria-label={label}
      aria-valuemax={items.length - 1}
      aria-valuemin={0}
      aria-valuenow={index}
      aria-valuetext={valueText?.(index) ?? items[index]}
      className={cn(
        `
          relative cursor-grab overflow-hidden select-none
          active:cursor-grabbing
        `,
        // Without this, a touch drag scrolls the page instead of the wheel.
        'touch-none',
        WIREFRAME_FRAME,
        WIREFRAME_FOCUS,
        className
      )}
      ref={elementRef}
      // A spinbutton is exactly what an endless wheel is, but it cannot be the
      // <input> the rule proposes: the wheel's rows are a set of absolutely
      // positioned children, and an input is a void element with no children.
      // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="spinbutton"
      style={{
        height: viewportHeight({ itemHeight, rows }),
        perspective: variant === 'drum' ? DRUM_PERSPECTIVE : undefined,
      }}
      tabIndex={0}
      {...handlers}
    >
      {slots.map((slot) => (
        <WheelRow
          anglePerItem={anglePerItem}
          contentClassName={contentClassName}
          itemHeight={itemHeight}
          items={items}
          key={slot}
          offset={offset}
          rows={rows}
          slot={slot}
          variant={variant}
        />
      ))}
    </div>
  );
};
