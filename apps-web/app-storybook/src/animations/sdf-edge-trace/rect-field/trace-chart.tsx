/**
 * Traces over the last few seconds, plotted against wall-clock time.
 *
 * Time rather than trace index, because the gaps are the point. Under a still layout there
 * are no bars at all, and that emptiness is the honest picture of an event-driven tracer —
 * indexing by trace would space a burst and a lone retrace identically and hide exactly
 * the property worth showing.
 *
 * A red guide sits at the frame budget. Bars are absolutely positioned by timestamp rather
 * than laid out in a row for the same reason: their horizontal position carries meaning.
 */

import { cn } from '@monorepo/utils';
import type { FC } from 'react';
import { IDLE_AFTER_MS, statusOf, type TraceHistory } from './trace-log.js';

/** Window plotted, in ms. */
const SPAN_MS = 4000;
/** The 60Hz frame budget. Stated as a number, and drawn only when it is in range. */
const BUDGET_MS = 16.7;
/**
 * Smallest full-scale value, in ms.
 *
 * Scaling to the frame budget was the obvious choice and the wrong one: a median trace of
 * 0.4ms against 16.7ms drew bars 2.4% tall, so the chart was a flat line under a red rule.
 * That is *true* — the work is a rounding error against a frame — but it says it by
 * destroying the only thing a chart is for, which is the shape of the variation. So the
 * scale follows the data and the budget relationship is a number in the footer instead.
 */
const MIN_SCALE_MS = 0.5;
/** Draw the budget rule only once traces are within this fraction of it. */
const BUDGET_VISIBLE_AT = 0.25;

export const TraceChart: FC<{ history: TraceHistory; className?: string }> = ({ history, className }) => {
  const status = statusOf(history);
  const ceiling = Math.max(history.peakMs * 1.3, MIN_SCALE_MS);
  const budgetInRange = ceiling > BUDGET_MS * BUDGET_VISIBLE_AT;
  const budgetShare = (history.peakMs / BUDGET_MS) * 100;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex flex-row items-baseline justify-between font-mono text-[10px] text-neutral-400">
        <span className="flex flex-row items-center gap-1.5" data-testid="trace-status">
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
          {status === 'idle' && history.sinceLast !== null && (
            <span className="text-neutral-500">· settled {(history.sinceLast / 1000).toFixed(1)}s ago</span>
          )}
          {status === 'tracing' && history.rate > 0 && (
            <span className="text-neutral-500">· {history.rate.toFixed(0)}/s</span>
          )}
        </span>
        <span>
          {ceiling.toFixed(2)}ms full scale · {SPAN_MS / 1000}s window
        </span>
      </div>

      <div
        className={`
          relative h-20 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50
          dark:border-neutral-800 dark:bg-neutral-900/50
        `}
        data-testid="trace-chart"
      >
        {/* Only drawn when it would land inside the plot; otherwise it is a rule at the
            top of a chart of nothing, and the footer carries the comparison instead. */}
        {budgetInRange && (
          <>
            <div
              className="absolute inset-x-0 border-t border-dashed border-rose-500/40"
              style={{ bottom: `${Math.min((BUDGET_MS / ceiling) * 100, 99)}%` }}
            />
            <span
              className="absolute right-1 font-mono text-[9px] text-rose-500/70"
              style={{ bottom: `${Math.min((BUDGET_MS / ceiling) * 100, 99)}%` }}
            >
              16.7ms
            </span>
          </>
        )}

        {history.samples.map((sample, index) => {
          const age = history.readAt - sample.at;
          if (age > SPAN_MS) return null;
          return (
            <div
              key={index}
              className={cn(
                'absolute bottom-0 w-[3px] rounded-t-sm',
                sample.ms > BUDGET_MS ? 'bg-rose-500' : 'bg-indigo-500/70'
              )}
              style={{
                right: `${(age / SPAN_MS) * 100}%`,
                height: `${Math.max((sample.ms / ceiling) * 100, 1.5)}%`,
              }}
            />
          );
        })}

        {status !== 'tracing' && (
          <div
            className={`
              absolute inset-0 flex items-center justify-center font-mono text-[10px] text-neutral-400
              dark:text-neutral-600
            `}
          >
            {history.total === 0 ? 'waiting for the first layout' : 'nothing to trace — layout is still'}
          </div>
        )}
      </div>

      <div className="flex flex-row justify-between font-mono text-[10px] text-neutral-400">
        <span>
          {history.total} traces total
          {history.samples.length > 0 &&
            ` · median ${history.medianMs.toFixed(3)}ms · peak ${history.peakMs.toFixed(3)}ms`}
        </span>
        <span className="text-neutral-500">
          {history.samples.length > 0
            ? `peak is ${budgetShare.toFixed(1)}% of a frame`
            : `idle after ${IDLE_AFTER_MS}ms`}
        </span>
      </div>
    </div>
  );
};
