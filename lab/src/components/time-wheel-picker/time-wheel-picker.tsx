import { cn } from '@monorepo/utils';
import { useCallback, useEffect, useMemo, useRef, type FC, type KeyboardEvent } from 'react';

import {
  fromWheelIndices,
  hourItems,
  meridiemItems,
  minuteItems,
  toWheelIndices,
  type HourFormat,
  type TimeValue,
  type WheelIndices,
} from './time-model.js';
import { numericTypeahead } from './typeahead.js';
import { WheelColumn, type WheelColumnShape, type WheelVariant } from './wheel-column.js';
import { DEFAULT_DRUM_ANGLE_PER_ITEM, resolveColumnHeight } from './wheel-geometry.js';
import { WIREFRAME_BAND, WIREFRAME_FRAME, WIREFRAME_ITEM } from './wheel-style.js';

/**
 * Widths in `ch`, which with `tabular-nums` is exactly one digit, so the whole
 * picker scales with its font size and the columns stay in the same relationship.
 *
 * The two-digit reservation on the hour is the horizontal half of aligning the `:`
 * — see the `SeparatorCell` docblock. `3ch` columns around `2ch` of content leave
 * half a digit of breathing room on each side, which puts the colon exactly `1ch`
 * from the hour's right edge and `1ch` from the minute's left edge.
 */
const DIGITS_WIDTH = 'w-[2ch]';
const DIGIT_COLUMN_WIDTH = 'w-[3ch]';
const SEPARATOR_WIDTH = 'w-[1ch]';
const MERIDIEM_WIDTH = 'w-[3ch]';
const MERIDIEM_COLUMN_WIDTH = 'w-[4ch]';

interface SeparatorCellProps {
  itemHeight: number;
  /** The same box the columns use, so the colon sits on their centre line. */
  height: number;
}

/**
 * The `:` between the hour and the minute, as a row rather than as centred text.
 *
 * ## Vertically
 *
 * This is a box of exactly `itemHeight`, centred by the same arithmetic as the
 * selection band, holding its text with the same `flex items-center` as a real row
 * and inheriting the same font. So the colon's baseline *is* the selected row's
 * baseline, by construction.
 *
 * The alternative — letting the colon sit in the flow and be centred by the
 * parent's `items-center` — lands in the same place today, but it derives the
 * position from the column box instead of from the centre line the snap maths uses.
 * Two sources of truth for one line; they agree only for as long as nothing moves.
 * And centring the glyph's own box with `translateY(-50%)` is worse than either: a
 * colon's dots straddle the x-height, not the em box, so the optical centre is not
 * the box centre and the result sits low.
 *
 * It is outlined like any other row, because that outline is the visible proof
 * that the colon occupies the same box a selected item does.
 *
 * ## Horizontally
 *
 * Nothing here does that half of the job — it is done by the hour column reserving
 * two digits and right-aligning them. A 12-hour wheel runs 1 to 12, so its width
 * changes between one and two digits, and a centred hour would slide the digits
 * sideways under a fixed colon as the wheel passed 9 → 10. Which reads, wrongly,
 * as the colon moving.
 */
const SeparatorCell: FC<SeparatorCellProps> = ({ itemHeight, height }) => (
  <div aria-hidden="true" className={cn('relative', SEPARATOR_WIDTH)} style={{ height }}>
    <div
      className={cn('absolute inset-x-0 flex items-center justify-center', WIREFRAME_ITEM)}
      style={{ height: itemHeight, top: (height - itemHeight) / 2 }}
    >
      <span>:</span>
    </div>
  </div>
);

export interface TimeWheelPickerProps {
  /** Canonical 24-hour time, whichever format is displayed. */
  value: TimeValue;
  onChange: (value: TimeValue) => void;
  hourFormat?: HourFormat;
  /** Row pitch. Everything else is derived from it, so it is a contract rather than a magic number. */
  itemHeight?: number;
  /**
   * How many items tall a **flat** wheel is. Must be odd — an even count has no centred
   * row for the band and the `:` to align to.
   *
   * A drum ignores it, and provably: its slots come from its arc, so it renders the same
   * geometry at every row count. `WheelColumn` refuses the pair outright, but this level
   * keeps both props because it owns a `variant` toggle and a caller flipping that should
   * not have to restructure its props to do it.
   */
  rows?: number;
  variant?: WheelVariant;
  /**
   * The drum's shape: degrees between adjacent items. Ignored when flat.
   *
   * To size a drum to a target height instead, invert it —
   * `drumAnglePerItem={drumAngleForHeight({ itemHeight, drumHeight: 240 })}` — rather than
   * looking for a second prop. The two are one quantity.
   */
  drumAnglePerItem?: number;
  /**
   * The window onto the drum, applied to every column and with them the `:` and the band,
   * so all three stay on one centre line. Ignored when flat, whose box is `rows` items.
   *
   * Left out, a drum measures itself — the cylinder its edges sweep, see `drumHeight`.
   * Smaller than that clips the ends of the arc, which is usually what is wanted; larger
   * pads above and below it.
   */
  drumViewportHeight?: number;
  className?: string;
}

/**
 * A looping hour / minute / meridiem picker.
 *
 * The three wheels are `WheelColumn`s over a canonical 24-hour value; `time-model.ts`
 * owns the conversion in both directions, so `12 AM` and `12 PM` cannot collapse
 * into each other. At 24-hour format the meridiem column is simply absent, and
 * because the hour labels are then `00`–`23` the reserved two-digit width stops
 * being a workaround and becomes the natural size.
 */
export const TimeWheelPicker: FC<TimeWheelPickerProps> = ({
  value,
  onChange,
  hourFormat = 12,
  itemHeight = 40,
  rows = 5,
  variant = 'flat',
  drumAnglePerItem = DEFAULT_DRUM_ANGLE_PER_ITEM,
  drumViewportHeight,
  className,
}) => {
  const hours = useMemo(() => hourItems(hourFormat), [hourFormat]);
  const minutes = useMemo(() => minuteItems(), []);
  const meridiems = useMemo(() => meridiemItems(), []);

  const indices = toWheelIndices(value, hourFormat);

  /**
   * What the wheels collectively say.
   *
   * Each column writes only its own field here, and that is the whole point.
   * Rebuilding the value from a snapshot of `value` inside each handler looks
   * equivalent and loses updates: when two columns move at once they each carry a
   * stale copy of the other's field, and whichever commits last wins for *both*. The
   * symptom is the wheels and the reported value disagreeing — an hour wheel resting
   * on `1` while the value says `11`, because the minute's report arrived carrying an
   * hour the animation had merely passed through.
   *
   * Two columns moving at once is not exotic. Typing across them makes it the normal
   * case, since the hour is still animating when the first minute digit lands, but
   * two fingers or a tap during a fling could always do it.
   */
  const indicesRef = useRef(indices);

  const report = useCallback(
    (patch: Partial<WheelIndices>) => {
      const next = { ...indicesRef.current, ...patch };
      indicesRef.current = next;
      onChange(fromWheelIndices(next, hourFormat));
    },
    [hourFormat, onChange]
  );

  // Adopt a value that did not come from us — a controlled parent setting the time
  // itself. Comparing against what our own indices would produce is what tells the
  // two apart, so our own reports echoing back do not reset anything mid-edit.
  useEffect(() => {
    const echo = fromWheelIndices(indicesRef.current, hourFormat);
    if (echo.hour !== value.hour || echo.minute !== value.minute) {
      indicesRef.current = toWheelIndices(value, hourFormat);
    }
  }, [hourFormat, value]);

  const onHourChange = useCallback((hour: number) => report({ hour }), [report]);
  const onMinuteChange = useCallback((minute: number) => report({ minute }), [report]);
  const onMeridiemChange = useCallback((meridiem: number) => report({ meridiem }), [report]);

  // One height for the columns, the separator and the band, so all three agree about
  // where the centre line is however the box was arrived at.
  const resolvedHeight = resolveColumnHeight({
    variant,
    itemHeight,
    rows,
    anglePerItem: drumAnglePerItem,
    height: drumViewportHeight,
  });

  /**
   * The sizing half of a column's props, which differs by variant.
   *
   * `WheelColumn` takes a union — a flat wheel is sized by `rows`, a drum by its own
   * geometry — so a caller holding a variant at runtime has to pick a branch rather than
   * spread everything and hope. This picker is that caller, and being made to choose here
   * is the point: it is where the `variant` toggle lives.
   *
   * The drum is handed the height already resolved, so the separator, the band and all
   * three columns cannot end up disagreeing about the box.
   */
  const shape =
    variant === 'drum'
      ? ({ variant: 'drum', drumAnglePerItem, drumViewportHeight: resolvedHeight } satisfies WheelColumnShape)
      : ({ variant: 'flat', rows } satisfies WheelColumnShape);

  /**
   * Typing `0941p` should fill the whole picker, which means a finished segment has
   * to hand focus on.
   *
   * The columns report that they are finished and nothing more — only this level
   * knows there is a next column at all. Found by document order rather than by a ref
   * per column, because document order *is* the column order here, and three refs
   * plus merging them into the one `useWheel` already owns is more machinery than one
   * query.
   *
   * Auto-advance is not a convenience on top of typeahead; it is what makes typing
   * across columns work. Without it every digit of `0941` would land in the hour
   * column and fight the previous one.
   */
  const columnsRef = useRef<HTMLDivElement>(null);
  const focusColumn = useCallback((position: number) => {
    const columns = columnsRef.current?.querySelectorAll<HTMLElement>('[role="spinbutton"]');
    columns?.[position]?.focus();
  }, []);

  /**
   * Left and Right step between columns, because these three columns are one field.
   *
   * Measured off `<input type="time">` rather than chosen — see
   * `archive/2026-08-wheel-focus-model`. The native field offers *both* paths: Tab walks its
   * segments and so does Left/Right, and both **clamp** at the ends rather than wrapping.
   * Clamping is the part worth being careful about, because this wheel's value loops and it
   * would be easy to make the columns loop with it. The value is endless; the field is three
   * columns wide and has a first and a last.
   *
   * It belongs here and not in `WheelColumn` for the same reason auto-advance does: a column
   * knows about a wheel, and only this level knows there is a column beside it. A wheel has
   * no horizontal axis of its own, so a single-column picker leaves Left/Right alone — which
   * is better than aliasing them to Up/Down, since that would make one key mean two
   * unrelated things depending on how many columns happened to be composed.
   */
  const onColumnsKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (step === 0) return;

    const columns = columnsRef.current?.querySelectorAll<HTMLElement>('[role="spinbutton"]');
    if (columns === undefined) return;
    const from = [...columns].indexOf(document.activeElement as HTMLElement);
    // A key that arrived from somewhere other than a column is not ours to take.
    if (from === -1) return;

    // Consumed even when the clamp makes it a no-op: the key has been handled, and letting
    // it through would scroll the page sideways at the ends only. `stopImmediatePropagation`
    // for the reason `useWheel`'s `consume` documents — a host listening on `document` is
    // otherwise still reached.
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();

    columns[Math.min(Math.max(from + step, 0), columns.length - 1)]?.focus();
  }, []);

  return (
    // The group carries a keydown handler without being interactive itself, which is the
    // arrow-key container pattern rather than an exception to it: the interactive elements
    // are the columns, which are focusable and keyboard-operable on their own, and the
    // group only decides which of them Left/Right hands focus to. There is nothing here a
    // pointer user could reach and a keyboard user could not.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      aria-label="Time"
      className={cn('inline-flex p-1', WIREFRAME_FRAME, className)}
      // Three custom spinbuttons that are one control. The rule proposes
      // address/details/fieldset/hgroup/optgroup; the only near miss is <fieldset>,
      // which wants a <legend> to be well formed and arrives with a UA border,
      // padding and margin that an explicitly measured wireframe box would have to
      // unwind. `role="group"` plus a label is the whole of what is meant here.
      // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="group"
      // Bound to the group rather than to a column, because the group is the field and
      // "which column next" is a fact about the field. The columns are its only focusable
      // descendants, so anything reaching here by bubbling came from one of them.
      onKeyDown={onColumnsKeyDown}
    >
      <div className="relative flex" ref={columnsRef}>
        <WheelColumn
          className={DIGIT_COLUMN_WIDTH}
          contentClassName={cn(DIGITS_WIDTH, 'text-right')}
          index={indices.hour}
          itemHeight={itemHeight}
          items={hours}
          label="Hour"
          onIndexChange={onHourChange}
          onSettled={() => focusColumn(1)}
          {...shape}
          typeahead={numericTypeahead}
        />
        <SeparatorCell height={resolvedHeight} itemHeight={itemHeight} />
        <WheelColumn
          className={DIGIT_COLUMN_WIDTH}
          contentClassName={cn(DIGITS_WIDTH, 'text-left')}
          index={indices.minute}
          itemHeight={itemHeight}
          items={minutes}
          label="Minute"
          onIndexChange={onMinuteChange}
          onSettled={() => focusColumn(2)}
          {...shape}
          typeahead={numericTypeahead}
          valueText={(index) => `${minutes[index] ?? ''} minutes`}
        />
        {hourFormat === 12 && (
          <WheelColumn
            className={MERIDIEM_COLUMN_WIDTH}
            contentClassName={cn(MERIDIEM_WIDTH, 'text-center')}
            index={indices.meridiem}
            itemHeight={itemHeight}
            items={meridiems}
            label="AM or PM"
            onIndexChange={onMeridiemChange}
            {...shape}
          />
        )}
        {/*
         * The selection band, drawn across every column at once.
         *
         * Full width is what keeps its verticals away from the rows' verticals, so
         * only the horizontals coincide at the centre line — and dashed is what
         * makes that one coincidence read as two layers rather than as a dirty
         * line. Its height is exactly `itemHeight` because it doubles as the
         * assertion that the centre line really is where the snap maths puts it.
         */}
        <div
          aria-hidden="true"
          className={cn('pointer-events-none absolute inset-x-0', WIREFRAME_BAND)}
          style={{ height: itemHeight, top: (resolvedHeight - itemHeight) / 2 }}
        />
      </div>
    </div>
  );
};
