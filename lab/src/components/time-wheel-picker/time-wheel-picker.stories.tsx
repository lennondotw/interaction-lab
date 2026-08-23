import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type FC, type ReactNode } from 'react';

import { formatTime, timeParts, type TimeValue } from './time-model.js';
import { TimeWheelPicker, type TimeWheelPickerProps } from './time-wheel-picker.js';

const meta = {
  title: 'Components/TimeWheelPicker',
  component: TimeWheelPicker,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    itemHeight: { control: { type: 'range', min: 24, max: 72, step: 2 } },
    // Stepped by two from an odd start, because the component throws on an even
    // row count rather than rounding it — there is no centred row to align to.
    rows: { control: { type: 'range', min: 1, max: 9, step: 2 } },
    anglePerItem: { control: { type: 'range', min: 8, max: 40, step: 1 } },
    hourFormat: { control: { type: 'inline-radio' }, options: [12, 24] },
    variant: { control: { type: 'inline-radio' }, options: ['flat', 'drum'] },
    // The picker is controlled, so these two are supplied by the story rather than
    // by a knob: `value` seeds the demo's state and `onChange` is forwarded to the
    // Actions panel. Neither would do anything as a control, and a knob that does
    // nothing is worse than no knob.
    value: { table: { disable: true } },
    onChange: { table: { disable: true } },
  },
  args: {
    hourFormat: 12,
    itemHeight: 40,
    rows: 5,
    variant: 'flat',
    anglePerItem: 20,
    value: { hour: 9, minute: 41 },
    onChange: () => undefined,
  },
} satisfies Meta<typeof TimeWheelPicker>;

export default meta;

/**
 * A 12-hour hour with the width of two characters reserved, and only one of them
 * used when that is all the hour needs.
 *
 * A 12-hour clock runs 1 to 12, so printing the hour as-is makes the readout one
 * character narrower half the time — and since the line is centred, crossing
 * 9 → 10 drags the colon, the meridiem and everything after it sideways. Reserving
 * the space a leading zero would occupy holds all of it still without printing a
 * zero, which is the part that matters: no 12-hour clock shows `04:41`. The same
 * reservation the picker's own hour column makes, for the same reason.
 *
 * Only the 12-hour half needs this. The canonical half is a 24-hour value, and a
 * 24-hour clock *does* pad, so there `timeParts` hands back `04` and the width is
 * already fixed — which is worth preferring where it is available, because a
 * reserved blank next to the `·` separator reads as a stray double space.
 *
 * `ch` is the advance of `0`, and the readout is `font-mono`, so `2ch` is exactly
 * two characters at whatever size the line is set.
 */
const ReservedHour: FC<{ children: string }> = ({ children }) => (
  <span className="inline-block w-[2ch] text-right">{children}</span>
);

/**
 * The picker plus a readout, so a fling can be seen to land somewhere specific.
 *
 * Holds the value itself and still forwards every change, so the Actions panel
 * shows the canonical 24-hour value the wheels resolved to.
 */
const PickerDemo: FC<TimeWheelPickerProps> = ({ value: initial, onChange, ...props }) => {
  const [value, setValue] = useState<TimeValue>(initial);
  const format = props.hourFormat ?? 12;
  const shown = timeParts(value, format);
  const canonical = timeParts(value, 24);

  return (
    <div className="flex flex-col items-center gap-3">
      <TimeWheelPicker
        {...props}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
        value={value}
      />
      <p className="font-mono text-sm text-neutral-500 tabular-nums">
        <ReservedHour>{shown.hour}</ReservedHour>
        {`:${shown.minute}${shown.meridiem === null ? '' : ` ${shown.meridiem}`}`}
        <span className="text-neutral-400">{` · ${canonical.hour}:${canonical.minute} canonical`}</span>
      </p>
    </div>
  );
};

const Frame: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="flex min-h-screen w-full items-center justify-center px-2">{children}</div>
);

type Story = StoryObj<typeof meta>;

/** Drag it, flick it, spin the wheel over it, or focus a column and use the arrow keys. */
export const Default: Story = {
  render: (args) => (
    <Frame>
      <PickerDemo {...args} />
    </Frame>
  ),
};

/**
 * No meridiem column, and the hour runs `00`–`23`.
 *
 * Worth having as its own story because the two-digit width the 12-hour wheel
 * reserves in order to hold the `:` still is, here, just the natural size of the
 * content — the same code, with the workaround no longer looking like one.
 */
export const TwentyFourHour: Story = {
  args: { hourFormat: 24 },
  render: (args) => (
    <Frame>
      <PickerDemo {...args} />
    </Frame>
  ),
};

/** The same interaction engine, drawn on a cylinder instead of a flat list. */
export const Drum: Story = {
  args: { variant: 'drum' },
  render: (args) => (
    <Frame>
      <PickerDemo {...args} />
    </Frame>
  ),
};

/** A taller viewport. Nothing but `rows` changes; every other measurement follows it. */
export const SevenRows: Story = {
  args: { rows: 7 },
  render: (args) => (
    <Frame>
      <PickerDemo {...args} />
    </Frame>
  ),
};

/**
 * Flat next to drum, because this is a pair you can only judge against each other.
 *
 * The interesting thing is not that they look different, it is that they feel the
 * same: both are driven by one `offset` in pixels, so a drag of one row height
 * advances one item in either, and the drum only redistributes that same motion
 * around an arc. Flick each with the same gesture and they should land together.
 */
export const FlatAndDrum: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => (
    <Frame>
      <div className="flex items-start gap-10">
        <div className="flex flex-col items-center gap-2">
          <PickerDemo {...args} variant="flat" />
          <span className="text-xs text-neutral-500">flat</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <PickerDemo {...args} variant="drum" />
          <span className="text-xs text-neutral-500">drum</span>
        </div>
      </div>
    </Frame>
  ),
};

/**
 * Controlled from outside, to show the loop choosing the short way round.
 *
 * Going from `23:59` to `00:00` is one row forward on a looping wheel and
 * twenty-three rows back on a list. Both readings are correct, so the component
 * picks the nearer offset explicitly rather than by accident — press the two
 * buttons in turn and the hour wheel should never take the long way.
 */
export const ShortestPath: Story = {
  args: { hourFormat: 24 },
  parameters: { controls: { disable: true } },
  render: function Component(args) {
    const [value, setValue] = useState<TimeValue>({ hour: 23, minute: 59 });

    return (
      <Frame>
        <div className="flex flex-col items-center gap-3">
          <TimeWheelPicker {...args} onChange={setValue} value={value} />
          <p className="font-mono text-sm text-neutral-500 tabular-nums">{formatTime(value, 24)}</p>
          <div className="flex gap-2">
            <button
              className="cursor-pointer rounded-md border border-neutral-500/40 px-2 py-0.5 text-sm"
              onClick={() => setValue({ hour: 23, minute: 59 })}
            >
              23:59
            </button>
            <button
              className="cursor-pointer rounded-md border border-neutral-500/40 px-2 py-0.5 text-sm"
              onClick={() => setValue({ hour: 0, minute: 0 })}
            >
              00:00
            </button>
          </div>
        </div>
      </Frame>
    );
  },
};
