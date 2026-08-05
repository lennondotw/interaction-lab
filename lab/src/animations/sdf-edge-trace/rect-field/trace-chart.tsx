/**
 * The story's own chrome around a `LiveScope`.
 *
 * The scope itself is styleless and knows nothing about tracing — it plots a numeric series
 * against time. Everything specific to *this* readout lives here: the border and radius, the
 * idle-versus-tracing badge, the totals, and the frame-budget comparison.
 *
 * The split is by how fast things change, not by what they are about. Motion is on the
 * canvas at refresh rate, reading the log directly; the numbers are React on a 200ms poll,
 * which is as often as a median is worth re-reading. Rendering the bars from that same poll
 * is what made an earlier version step: samples arrived sixteen at a time and the whole
 * strip jumped 200ms of distance at once. The badge is on neither clock — it is pushed by
 * `useTraceStatus`, so it does not inherit the poll's lag.
 *
 * Both caption rows are `justify-between` inside a 26rem panel, which leaves no room for
 * prose: at 10px mono every character is 6px, so a phrase of forty is a quarter of the
 * column. They are written short and marked `whitespace-nowrap` deliberately — an earlier
 * pass fit the panel exactly, and the two rows silently broke mid-phrase (`· 2` above
 * `traces/s`) the moment a rate reached two digits.
 */

import { cn } from '@monorepo/utils';
import { useCallback, type FC } from 'react';

import { LiveScope } from '#src/components/live-scope/live-scope.js';

import { IDLE_AFTER_MS, statusOf, type TraceHistory, type TraceLog } from './trace-log.js';

/** Window plotted, in ms. */
const SPAN_MS = 4000;
/** The 60Hz frame budget. Bars reaching it are painted as over-budget. */
const BUDGET_MS = 16.7;

export const TraceChart: FC<{
  log: TraceLog;
  history: TraceHistory;
  /** Pushed by `useTraceStatus` rather than derived from `history`, so the badge is live. */
  tracing: boolean;
  className?: string;
}> = ({ log, history, tracing, className }) => {
  const read = useCallback((fromAt: number) => log.since(fromAt), [log]);
  const status = statusOf(history, tracing);
  const budgetShare = (history.peakMs / BUDGET_MS) * 100;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex flex-row items-baseline justify-between gap-3 font-mono text-[10px] text-neutral-400">
        <span className="flex shrink-0 flex-row items-center gap-1.5 whitespace-nowrap" data-testid="trace-status">
          <span
            className={cn(
              'size-1.5 rounded-full',
              status === 'tracing' ? 'bg-emerald-500' : status === 'idle' ? 'bg-neutral-500' : 'bg-neutral-700'
            )}
          />
          <span
            className={cn(
              status === 'tracing' &&
                `
                  text-emerald-600
                  dark:text-emerald-400
                `
            )}
          >
            {status === 'never' ? 'no trace yet' : status === 'tracing' ? 'tracing' : 'idle'}
          </span>
          {/*
            Held back until the poll agrees with the badge. The badge flips on its own timer
            `IDLE_AFTER_MS` after the last trace, while `sinceLast` is up to 200ms stale, so
            for that overlap the two disagree and the honest reading is to say nothing rather
            than `settled 0.0s ago`.
          */}
          {status === 'idle' && history.sinceLast !== null && history.sinceLast >= IDLE_AFTER_MS && (
            <span className="text-neutral-500">· settled {(history.sinceLast / 1000).toFixed(1)}s ago</span>
          )}
          {status === 'tracing' && history.rate > 0 && (
            <span className="text-neutral-500">· {history.rate.toFixed(0)} traces/s</span>
          )}
        </span>
        <span className="truncate" data-testid="trace-axis">
          ms · {SPAN_MS / 1000}s window · axis follows peak
        </span>
      </div>

      <div className="relative" data-testid="trace-chart">
        <LiveScope
          read={read}
          spanMs={SPAN_MS}
          minScale={0.2}
          threshold={BUDGET_MS}
          className={`
            h-24 w-full rounded-lg border border-neutral-200 bg-neutral-50
            dark:border-neutral-800 dark:bg-neutral-900/50
          `}
        />
        {status !== 'tracing' && (
          <div
            className={`
              pointer-events-none absolute inset-0 flex items-center justify-center pl-10 font-mono text-[10px]
              text-neutral-400
              dark:text-neutral-600
            `}
          >
            {history.total === 0 ? 'waiting for the first layout' : 'nothing to trace — layout is still'}
          </div>
        )}
      </div>

      <div className="flex flex-row justify-between gap-3 font-mono text-[10px] text-neutral-400">
        <span className="shrink-0 whitespace-nowrap">
          {history.total} traces
          {history.samples.length > 0 &&
            ` · median ${history.medianMs.toFixed(3)}ms · peak ${history.peakMs.toFixed(3)}ms`}
        </span>
        {/* Reads as being about the peak from sitting beside it, which is what buys the room. */}
        <span className="truncate text-neutral-500">
          {history.samples.length > 0 ? `${budgetShare.toFixed(1)}% of a frame` : `idle after ${IDLE_AFTER_MS}ms`}
        </span>
      </div>
    </div>
  );
};
