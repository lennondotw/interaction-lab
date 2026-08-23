/**
 * What the three wheels mean, kept apart from how they move.
 *
 * The canonical value is a 24-hour `{ hour, minute }`, and the columns are a
 * *presentation* of it. Storing the displayed hour plus a meridiem instead would
 * make `12 AM` and `12 PM` two values that both round-trip through hour `12`, and
 * the bug only surfaces at the two instants a day where it is least testable.
 *
 * So the wheel indices are derived from the canonical value on the way out and
 * folded back into it on the way in, and `hour: 0` is midnight in both formats.
 */

export type HourFormat = 12 | 24;

export interface TimeValue {
  /** 0–23. Canonical regardless of which format is displayed. */
  hour: number;
  /** 0–59. */
  minute: number;
}

/** The three wheels, as indices into their own item lists. `meridiem` is unused at 24-hour. */
export interface WheelIndices {
  hour: number;
  minute: number;
  meridiem: number;
}

const MERIDIEM_ITEMS = ['AM', 'PM'] as const;

const pad2 = (value: number): string => String(value).padStart(2, '0');

/**
 * Hour labels for a format.
 *
 * 12-hour runs `1 … 12`, unpadded, which is what every system picker shows and
 * why the hour column needs a reserved two-digit width rather than a padded
 * label — see `TimeWheelPicker` for the horizontal half of aligning the `:`.
 */
export const hourItems = (format: HourFormat): string[] =>
  format === 24
    ? Array.from({ length: 24 }, (_unused, index) => pad2(index))
    : Array.from({ length: 12 }, (_unused, index) => String(index + 1));

export const minuteItems = (): string[] => Array.from({ length: 60 }, (_unused, index) => pad2(index));

export const meridiemItems = (): string[] => [...MERIDIEM_ITEMS];

/** Which half of the day an hour falls in. */
export const meridiemOf = (hour: number): number => (hour < 12 ? 0 : 1);

/** The hour as shown on a 12-hour wheel: midnight and noon are both `12`, not `0`. */
export const displayHour = (hour: number): number => {
  const twelve = hour % 12;
  return twelve === 0 ? 12 : twelve;
};

export const toWheelIndices = (value: TimeValue, format: HourFormat): WheelIndices => ({
  hour: format === 24 ? value.hour : displayHour(value.hour) - 1,
  minute: value.minute,
  meridiem: meridiemOf(value.hour),
});

/**
 * Wheel indices back to a canonical time.
 *
 * The 12-hour fold is the part worth reading: `displayHour % 12` sends `12` to
 * `0`, so `12 AM` becomes hour `0` and `12 PM` becomes hour `12`, while `1 PM`
 * becomes `13`. Doing it the other way round — adding 12 to the displayed hour —
 * turns noon into hour `24`.
 */
export const fromWheelIndices = (indices: WheelIndices, format: HourFormat): TimeValue => {
  if (format === 24) {
    return { hour: indices.hour, minute: indices.minute };
  }
  const shown = indices.hour + 1;
  return { hour: (shown % 12) + (indices.meridiem === 1 ? 12 : 0), minute: indices.minute };
};

/** `13:05` or `1:05 PM`, for a readout next to the wheel. */
export const formatTime = (value: TimeValue, format: HourFormat): string =>
  format === 24
    ? `${pad2(value.hour)}:${pad2(value.minute)}`
    : `${displayHour(value.hour)}:${pad2(value.minute)} ${MERIDIEM_ITEMS[meridiemOf(value.hour)] ?? ''}`;
