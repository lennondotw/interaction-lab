import { cn } from '@monorepo/utils';
import { motion, useMotionTemplate, useTransform, type MotionValue } from 'motion/react';
import type { FC } from 'react';

import { prefixTypeahead, type Typeahead } from './typeahead.js';
import { useWheel, WHEEL_SLOT_ATTRIBUTE } from './use-wheel.js';
import {
  DRUM_PERSPECTIVE,
  drumRadius,
  drumRow,
  drumSlots,
  resolveColumnHeight,
  rowDistance,
  rowFade,
  rowIndex,
  rowSlots,
  rowTop,
} from './wheel-geometry.js';
import { WIREFRAME_FOCUS, WIREFRAME_FRAME, WIREFRAME_ITEM } from './wheel-style.js';

export type WheelVariant = 'drum' | 'flat';

interface WheelRowProps {
  slot: number;
  offset: MotionValue<number>;
  items: readonly string[];
  itemHeight: number;
  /** The box the rows are centred in. Not `itemHeight * rows` once a drum sizes itself. */
  height: number;
  /**
   * How far the fade reaches, in rows. Only a flat wheel has one; a drum's dimming comes
   * from `cos θ`, which needs no reach because a surface turning away is not a curve
   * anyone chose.
   */
  rows: number | undefined;
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
  height,
  variant,
  anglePerItem,
  contentClassName,
}) => {
  const count = items.length;

  const label = useTransform(offset, (value) => items[rowIndex({ slot, offset: value, itemHeight, count })] ?? '');
  const distance = useTransform(offset, (value) => rowDistance({ slot, offset: value, itemHeight }));

  // `rows` is only ever absent on a drum, which reads none of these three.
  const flatRows = rows ?? 1;
  const top = useTransform(offset, (value) => rowTop({ slot, offset: value, itemHeight, rows: flatRows }));
  const flatOpacity = useTransform(distance, (value) => rowFade({ distance: value, rows: flatRows }).opacity);
  const flatScale = useTransform(distance, (value) => rowFade({ distance: value, rows: flatRows }).scale);

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
  // A row turned past 90° is on the back of the drum. `drumRow` clamps it to
  // invisible, but invisible is not untouchable: the arc brings it back inside the
  // column's box, where it would still win a hit-test and send a tap five rows away.
  // The flat wheel is already safe — its far rows are clipped out, and clipping
  // takes hit-testing with it — but binding both costs nothing.
  const pointerEvents = useTransform(isDrum ? drumOpacity : flatOpacity, (value) => (value < 0.02 ? 'none' : 'auto'));

  return (
    <motion.div
      // The rows are a rendering of the column's value, and the column already
      // announces that value through `aria-valuetext`. Left visible to the
      // accessibility tree they would have it read six times over.
      aria-hidden="true"
      className={cn('absolute inset-x-0 flex items-center justify-center', WIREFRAME_ITEM)}
      style={
        isDrum
          ? {
              height: itemHeight,
              // Every row starts stacked at the centre line; the rotation is what
              // distributes them around the drum. Centred in the resolved box, which
              // for a drum is its own height rather than `itemHeight * rows`.
              top: (height - itemHeight) / 2,
              opacity: drumOpacity,
              transform: drumTransform,
              pointerEvents,
            }
          : { height: itemHeight, top: 0, y: top, opacity: flatOpacity, scale: flatScale, pointerEvents }
      }
      {...{ [WHEEL_SLOT_ATTRIBUTE]: slot }}
    >
      <motion.span className={cn('tabular-nums', contentClassName)}>{label}</motion.span>
    </motion.div>
  );
};

/** Everything a wheel needs whichever way it is drawn. */
interface WheelColumnBase {
  /** Labels, in wheel order. Looped, so any length works — including two. */
  items: readonly string[];
  index: number;
  onIndexChange: (index: number) => void;
  itemHeight: number;
  /**
   * How typing selects. Defaults to `<select>`'s prefix matching, which is right for
   * a wheel over arbitrary labels; a wheel over numbers should be handed
   * `numericTypeahead` explicitly. Pass `null` to make the column deaf to characters.
   *
   * Explicit rather than inferred from whether the labels parse as integers: a column
   * whose keyboard behaviour changes because one label stopped being a number is not
   * a column anybody can debug.
   */
  typeahead?: Typeahead | null;
  /**
   * Called when a typed entry can go no further. A composition wires this to focus
   * its next column; a single column has no opinion about it. See `useWheel`.
   */
  onSettled?: () => void;
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
 * How the wheel is drawn, and the sizing that goes with it. A discriminated union rather
 * than one flat set of optional props, because the two shapes are sized by different
 * things and the props that size one are meaningless on the other.
 *
 * `rows` is the flat wheel's size: it *is* the box, `itemHeight * rows` tall. A drum has
 * no use for it — measured, a drum renders identical geometry at every row count — so
 * accepting it there would be accepting a prop that silently does nothing.
 *
 * A drum is sized by its own geometry instead: `anglePerItem` is its shape, and `height`
 * is the window onto it. See `resolveColumnHeight` for how those two settle the box.
 */
export type WheelColumnShape =
  | {
      variant?: 'flat';
      /** Odd, and the viewport is exactly this many items tall. */
      rows: number;
      anglePerItem?: never;
      height?: never;
    }
  | {
      variant: 'drum';
      rows?: never;
      /** Degrees between adjacent items. The drum's shape, and so its natural height. */
      anglePerItem?: number;
      /**
       * Overrides the box. Left out, the drum measures itself — the cylinder its edges
       * sweep. Larger is padding above and below it, smaller is a clip, and the clip is
       * usually the point.
       */
      height?: number;
    };

export type WheelColumnProps = WheelColumnBase & WheelColumnShape;

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
  height,
  typeahead = prefixTypeahead,
  onSettled,
  label,
  valueText,
  className,
  contentClassName,
}) => {
  const { offset, elementRef, handlers } = useWheel({
    items,
    itemHeight,
    rows,
    index,
    onIndexChange,
    typeahead: typeahead ?? undefined,
    onSettled,
  });

  // A drum's slots come from its arc and a flat wheel's from its row count — the two are
  // sized by different things, which is what the props union says.
  const slots = variant === 'drum' ? drumSlots({ anglePerItem }) : rowSlots({ rows: rows ?? 1 });
  const resolvedHeight = resolveColumnHeight({ variant, itemHeight, rows, anglePerItem, height });

  return (
    <div
      aria-label={label}
      aria-valuemax={items.length - 1}
      aria-valuemin={0}
      aria-valuenow={index}
      aria-valuetext={valueText?.(index) ?? items[index]}
      className={cn(
        // `pointer` at rest because a tap now selects a row, and the closed hand only
        // once the gesture has been classified as a drag. This cannot be `active:`,
        // which begins at `pointerdown` and so would close the hand for taps too.
        //
        // The attribute name is spelled out rather than interpolated from
        // `WHEEL_DRAGGING_ATTRIBUTE` because Tailwind scans source text and would not
        // see a class built at runtime. Keep the two in step.
        `
          relative cursor-pointer overflow-hidden select-none
          data-[dragging=true]:cursor-grabbing
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
        height: resolvedHeight,
        perspective: variant === 'drum' ? DRUM_PERSPECTIVE : undefined,
      }}
      tabIndex={0}
      {...handlers}
    >
      {slots.map((slot) => (
        <WheelRow
          anglePerItem={anglePerItem}
          contentClassName={contentClassName}
          height={resolvedHeight}
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
