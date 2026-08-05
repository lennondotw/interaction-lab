import type { Meta, StoryObj } from '@storybook/react-vite';
import { Fragment, useState, type FC, type ReactNode } from 'react';
import { ElapsedTimer, type TimerPrecision } from './index.js';

const PRECISIONS: TimerPrecision[] = ['minutes', 'seconds', 'tenths', 'hundredths', 'milliseconds'];

/**
 * Anchors `offsetMs` in the past, once, at mount.
 *
 * Passing `Date.now() - offsetMs` through story args instead would pin the
 * anchor to module-evaluation time, so the story would drift: leave the
 * tab open for ten minutes and "started two minutes ago" reads twelve.
 */
const OffsetTimer: FC<{ offsetMs: number; precision: TimerPrecision }> = ({ offsetMs, precision }) => {
  const [startTime] = useState(() => Date.now() - offsetMs);
  return <ElapsedTimer startTime={startTime} precision={precision} />;
};

/** One anchor, five readouts — the coarse ones visibly lag the fine ones. */
const AllPrecisionsDemo: FC = () => {
  const [startTime] = useState(() => Date.now());

  return (
    <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-8 gap-y-2 text-base">
      {PRECISIONS.map((precision) => (
        <Fragment key={precision}>
          <span
            className={`
              text-sm text-neutral-400
              dark:text-neutral-500
            `}
          >
            {precision}
          </span>
          <ElapsedTimer startTime={startTime} precision={precision} className="text-right" />
        </Fragment>
      ))}
    </div>
  );
};

const Stage: FC<{ children: ReactNode }> = ({ children }) => (
  <div
    className={`
      flex min-h-screen items-center justify-center bg-neutral-100 p-8
      dark:bg-neutral-950
    `}
  >
    <div
      className={`
        min-w-64 rounded-2xl border border-black/5 bg-white px-8 py-6 text-center font-mono text-2xl text-neutral-700
        shadow-sm
        dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-200
      `}
    >
      {children}
    </div>
  </div>
);

const meta = {
  title: 'Components/ElapsedTimer',
  component: ElapsedTimer,
  decorators: [
    (Story) => (
      <Stage>
        <Story />
      </Stage>
    ),
  ],
  tags: ['autodocs'],
  argTypes: {
    precision: { control: 'select', options: PRECISIONS },
    startTime: { control: false },
  },
} satisfies Meta<typeof ElapsedTimer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { precision: 'seconds' },
  parameters: {
    docs: {
      description: {
        story:
          'With no `startTime`, the timer anchors at mount. Switch the precision control to see the scheduling change: down to tenths it sleeps between boundaries, below that it rides the frame loop.',
      },
    },
  },
};

export const Minutes: Story = {
  render: () => <OffsetTimer offsetMs={125_000} precision="minutes" />,
  parameters: {
    docs: {
      description: {
        story:
          'Started two minutes and five seconds ago. The seconds are dropped, and the whole readout only repaints once a minute.',
      },
    },
  },
};

export const Seconds: Story = {
  args: { precision: 'seconds' },
};

export const Tenths: Story = {
  args: { precision: 'tenths' },
};

export const Hundredths: Story = {
  args: { precision: 'hundredths' },
};

export const Milliseconds: Story = {
  args: { precision: 'milliseconds' },
  parameters: {
    docs: {
      description: {
        story:
          'Sampled once per frame, so the last digit skips — the display cannot show more than one value per refresh, and pretending otherwise would just burn timers between paints.',
      },
    },
  },
};

export const OverOneHour: Story = {
  render: () => <OffsetTimer offsetMs={3_601_000} precision="seconds" />,
  parameters: {
    docs: {
      description: {
        story:
          'One hour and one second ago. Zero units are omitted even mid-string, so this opens on `1 h 1 s` rather than `1 h 0 m 1 s` — the minutes field appears a minute later. Note the first paint is already correct: the elapsed value is seeded at mount rather than waiting for the first tick.',
      },
    },
  },
};

export const Frozen: Story = {
  args: { frozenValue: '4 m 12 s' },
  parameters: {
    docs: {
      description: {
        story:
          'A settled duration. `frozenValue` stops all scheduling, so a finished task can keep rendering the same element instead of swapping it for a plain span.',
      },
    },
  },
};

export const AllPrecisions: Story = {
  render: () => <AllPrecisionsDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Every precision from one shared anchor. The coarse readouts trail the fine ones because each truncates rather than rounds — the unit it shows has actually elapsed.',
      },
    },
  },
};
