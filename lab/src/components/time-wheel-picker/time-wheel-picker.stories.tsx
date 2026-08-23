import { cn } from '@monorepo/utils';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type FC, type ReactNode } from 'react';

import { formatTime, timeParts, type TimeValue } from './time-model.js';
import { TimeWheelPicker, type TimeWheelPickerProps } from './time-wheel-picker.js';
import { WheelColumn } from './wheel-column.js';
import { drumHeight, viewportHeight } from './wheel-geometry.js';
import { WIREFRAME_BAND, WIREFRAME_FRAME } from './wheel-style.js';

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
 *
 * The drum is trimmed rather than shown whole. Its own height is the cylinder its
 * edges sweep, and the last of that is rows turned so far from the viewer that they
 * are edge-on slivers a pixel or two tall — geometrically present, not worth the
 * space. Cutting one row's worth, half from each end, is what a real use wants and
 * it also brings the two boxes close enough to compare honestly.
 */
export const FlatAndDrum: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => {
    const itemHeight = args.itemHeight ?? 40;
    const trimmed = drumHeight({ itemHeight, anglePerItem: args.anglePerItem ?? 20 }) - itemHeight;

    return (
      <Frame>
        <div className="flex items-start gap-10">
          <div className="flex flex-col items-center gap-2">
            <PickerDemo {...args} variant="flat" />
            <span className="text-xs text-neutral-500">flat</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <PickerDemo {...args} height={trimmed} variant="drum" />
            <span className="text-xs text-neutral-500">drum, trimmed one row</span>
          </div>
        </div>
      </Frame>
    );
  },
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

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * A bare `WheelColumn` over words, to show what the wheel is once time is taken away.
 *
 * This is the default typeahead — `<select>`'s, verified against a real one. Focus the
 * column and type: `t` then `t` again cycles Tuesday to Thursday and back, while `t h`
 * goes straight to Thursday. The buffer expires after a second, as a `<select>`'s does.
 *
 * The `TimeWheelPicker` stories are this same component with `numericTypeahead` handed
 * to the two digit columns; its meridiem column keeps *this* behaviour, which is why
 * the strategy belongs to a column rather than to a picker. Time is not a mode.
 */
export const GenericPrefixTypeahead: Story = {
  parameters: { controls: { disable: true } },
  render: function Component(args) {
    const [index, setIndex] = useState(0);
    const itemHeight = args.itemHeight ?? 40;
    const rows = args.rows ?? 5;

    return (
      <Frame>
        <div className="flex flex-col items-center gap-3">
          <div className={cn('inline-flex p-1', WIREFRAME_FRAME)}>
            <div className="relative flex">
              <WheelColumn
                className="w-[11ch]"
                contentClassName="w-[9ch] text-center"
                index={index}
                itemHeight={itemHeight}
                items={WEEKDAYS}
                label="Weekday"
                onIndexChange={setIndex}
                rows={rows}
              />
              <div
                aria-hidden="true"
                className={cn('pointer-events-none absolute inset-x-0', WIREFRAME_BAND)}
                style={{ height: itemHeight, top: (viewportHeight({ itemHeight, rows }) - itemHeight) / 2 }}
              />
            </div>
          </div>
          <p className="font-mono text-sm text-neutral-500">{WEEKDAYS[index]}</p>
        </div>
      </Frame>
    );
  },
};

interface DrumCaseProps {
  title: string;
  note: string;
  itemHeight: number;
  rows: number;
  anglePerItem: number;
  height?: number;
}

/**
 * One drum with its box drawn around it, and the numbers under it.
 *
 * The dashed outer rule is the box the column is actually given. Where the drum is
 * smaller the gap between the two is visible padding; where it is larger the drum runs
 * off the edge and is clipped. Seeing both against the same drawn boundary is the only
 * way to judge which is wanted.
 */
const DrumCase: FC<DrumCaseProps> = ({ title, note, itemHeight, rows, anglePerItem, height }) => {
  const [index, setIndex] = useState(4);
  const auto = drumHeight({ itemHeight, anglePerItem });
  const box = height ?? auto;

  return (
    <div className="flex w-[13ch] flex-col items-center gap-2">
      <div className={cn('inline-flex p-1', WIREFRAME_BAND)}>
        <div className="relative flex">
          <WheelColumn
            anglePerItem={anglePerItem}
            className="w-[4ch]"
            contentClassName="w-[2ch] text-center"
            height={height}
            index={index}
            itemHeight={itemHeight}
            items={HOURS_24}
            label={`Hour ${title}`}
            onIndexChange={setIndex}
            rows={rows}
            variant="drum"
          />
          <div
            aria-hidden="true"
            className={cn('pointer-events-none absolute inset-x-0', WIREFRAME_FRAME)}
            style={{ height: itemHeight, top: (box - itemHeight) / 2 }}
          />
        </div>
      </div>
      <span className="text-center text-xs leading-4 text-neutral-500">
        {title}
        <br />
        <span className="font-mono text-neutral-400 tabular-nums">
          {anglePerItem}° · auto {auto.toFixed(0)} · box {box.toFixed(0)}
        </span>
        <br />
        <span className="text-neutral-400">{note}</span>
      </span>
    </div>
  );
};

const HOURS_24 = Array.from({ length: 24 }, (_unused, hour) => String(hour).padStart(2, '0'));

/**
 * What the drum's height is, and what overriding it does.
 *
 * A drum is not `rows` items tall. Its rows are flat rectangles set around an axis, so
 * in cross-section it is a prism, and a prism sits between two cylinders: an inscribed
 * one through the rows' own centres and a circumscribed one through their corners,
 * which is the surface the edges sweep as it turns. The auto height is the
 * circumscribed one, projected — the whole drum fits and nothing is ever clipped, at
 * any rotation.
 *
 * The dashed rule is the box; the solid inner rule is the selection band. Read the
 * first three cases left to right and the angle alone changes the drum's size by more
 * than a factor of three, which is exactly why a fixed `itemHeight * rows` box could
 * not work for it: at a small angle the drum was cut in half, at a large one it left
 * dead space on both sides.
 *
 * The last two are overrides. Larger is padding, smaller is a clip, and the clip is
 * usually the point — the outermost rows of a full drum are edge-on slivers, and most
 * uses want only the legible middle.
 */
export const DrumHeight: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => {
    const itemHeight = args.itemHeight ?? 40;
    const rows = args.rows ?? 5;
    const auto = drumHeight({ itemHeight, anglePerItem: 20 });

    return (
      <Frame>
        <div className="flex flex-wrap items-start justify-center gap-6">
          <DrumCase anglePerItem={10} itemHeight={itemHeight} note="auto" rows={rows} title="wide arc" />
          <DrumCase anglePerItem={20} itemHeight={itemHeight} note="auto" rows={rows} title="default" />
          <DrumCase anglePerItem={34} itemHeight={itemHeight} note="auto" rows={rows} title="tight arc" />
          <DrumCase
            anglePerItem={20}
            height={auto + 60}
            itemHeight={itemHeight}
            note="override, padded"
            rows={rows}
            title="taller box"
          />
          <DrumCase
            anglePerItem={20}
            height={auto - itemHeight}
            itemHeight={itemHeight}
            note="override, trimmed"
            rows={rows}
            title="one row cut"
          />
        </div>
      </Frame>
    );
  },
};
