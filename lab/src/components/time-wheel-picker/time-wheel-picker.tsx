import { cn } from '@monorepo/utils';
import { useCallback, useMemo, type FC } from 'react';

import {
  fromWheelIndices,
  hourItems,
  meridiemItems,
  minuteItems,
  toWheelIndices,
  type HourFormat,
  type TimeValue,
} from './time-model.js';
import { WheelColumn, type WheelVariant } from './wheel-column.js';
import { viewportHeight } from './wheel-geometry.js';
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
  rows: number;
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
const SeparatorCell: FC<SeparatorCellProps> = ({ itemHeight, rows }) => (
  <div
    aria-hidden="true"
    className={cn('relative', SEPARATOR_WIDTH)}
    style={{ height: viewportHeight({ itemHeight, rows }) }}
  >
    <div
      className={cn('absolute inset-x-0 flex items-center justify-center', WIREFRAME_ITEM)}
      style={{ height: itemHeight, top: (viewportHeight({ itemHeight, rows }) - itemHeight) / 2 }}
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
  /** Must be odd — an even count has no centred row for the band and the `:` to align to. */
  rows?: number;
  variant?: WheelVariant;
  /** Degrees between adjacent items on the drum. Ignored when flat. */
  anglePerItem?: number;
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
  anglePerItem = 20,
  className,
}) => {
  const hours = useMemo(() => hourItems(hourFormat), [hourFormat]);
  const minutes = useMemo(() => minuteItems(), []);
  const meridiems = useMemo(() => meridiemItems(), []);

  const indices = toWheelIndices(value, hourFormat);

  const onHourChange = useCallback(
    (hour: number) => onChange(fromWheelIndices({ ...toWheelIndices(value, hourFormat), hour }, hourFormat)),
    [hourFormat, onChange, value]
  );
  const onMinuteChange = useCallback(
    (minute: number) => onChange(fromWheelIndices({ ...toWheelIndices(value, hourFormat), minute }, hourFormat)),
    [hourFormat, onChange, value]
  );
  const onMeridiemChange = useCallback(
    (meridiem: number) => onChange(fromWheelIndices({ ...toWheelIndices(value, hourFormat), meridiem }, hourFormat)),
    [hourFormat, onChange, value]
  );

  const height = viewportHeight({ itemHeight, rows });

  return (
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
    >
      <div className="relative flex">
        <WheelColumn
          anglePerItem={anglePerItem}
          className={DIGIT_COLUMN_WIDTH}
          contentClassName={cn(DIGITS_WIDTH, 'text-right')}
          index={indices.hour}
          itemHeight={itemHeight}
          items={hours}
          label="Hour"
          onIndexChange={onHourChange}
          rows={rows}
          variant={variant}
        />
        <SeparatorCell itemHeight={itemHeight} rows={rows} />
        <WheelColumn
          anglePerItem={anglePerItem}
          className={DIGIT_COLUMN_WIDTH}
          contentClassName={cn(DIGITS_WIDTH, 'text-left')}
          index={indices.minute}
          itemHeight={itemHeight}
          items={minutes}
          label="Minute"
          onIndexChange={onMinuteChange}
          rows={rows}
          valueText={(index) => `${minutes[index] ?? ''} minutes`}
          variant={variant}
        />
        {hourFormat === 12 && (
          <WheelColumn
            anglePerItem={anglePerItem}
            className={MERIDIEM_COLUMN_WIDTH}
            contentClassName={cn(MERIDIEM_WIDTH, 'text-center')}
            index={indices.meridiem}
            itemHeight={itemHeight}
            items={meridiems}
            label="AM or PM"
            onIndexChange={onMeridiemChange}
            rows={rows}
            variant={variant}
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
          style={{ height: itemHeight, top: (height - itemHeight) / 2 }}
        />
      </div>
    </div>
  );
};
