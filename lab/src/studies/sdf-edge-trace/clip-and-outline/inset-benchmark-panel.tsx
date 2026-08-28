import { cn } from '@monorepo/utils';
import { FC, useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '#src/components/button/button.js';
import { Ball, ContourTracer } from '#src/components/meta-surface/sdf/field.js';

import { InsetCostRow, InsetSweepResult, runInsetSweep } from './inset-sweep.js';

const numberFormatter = new Intl.NumberFormat('en-US');
const formatMs = (ms: number): string => (ms >= 10 ? ms.toFixed(1) : ms >= 1 ? ms.toFixed(2) : ms.toFixed(3));

const ratio = (after: number, before: number): string => (before > 0 ? `${(after / before).toFixed(3)}×` : '—');

interface InsetBenchmarkPanelProps {
  tracer: ContourTracer;
  /** Snapshot of the live surface, so the table describes the shape on screen. */
  getBalls: () => Ball[];
  radius: number;
  sigma: number;
  blend: number;
  cells: readonly number[];
  inset: number;
  pinchInsets: readonly number[];
  className?: string;
}

export const InsetBenchmarkPanel: FC<InsetBenchmarkPanelProps> = ({
  tracer,
  getBalls,
  radius,
  sigma,
  blend,
  cells,
  inset,
  pinchInsets,
  className,
}) => {
  const [result, setResult] = useState<InsetSweepResult | null>(null);
  const [rows, setRows] = useState<InsetCostRow[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [ballCount, setBallCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleRun = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const balls = getBalls();
    setBallCount(balls.length);
    setRows([]);
    setResult(null);
    setProgress({ done: 0, total: 1 });

    void runInsetSweep({
      tracer,
      balls,
      radius,
      sigma,
      blend,
      cells,
      inset,
      pinchInsets,
      signal: controller.signal,
      onProgress: (update) => {
        setRows(update.rows);
        setProgress({ done: update.done, total: update.total });
      },
    })
      .then((sweep) => {
        if (!controller.signal.aborted) setResult(sweep);
      })
      .finally(() => {
        if (!controller.signal.aborted) setProgress(null);
      });
  }, [tracer, getBalls, radius, sigma, blend, cells, inset, pinchInsets]);

  const running = progress !== null;

  return (
    <div className={cn('flex flex-col gap-3', className)} data-testid="inset-benchmark">
      <div className="flex flex-row flex-wrap items-center gap-3">
        <Button
          size="sm"
          onClick={handleRun}
          disabled={running}
          data-testid="run-inset-benchmark"
          allPossibleContents={['Run benchmark', 'Running…']}
        >
          {running ? 'Running…' : 'Run benchmark'}
        </Button>
        {running && (
          <div className="font-mono text-xs text-neutral-500">
            {progress.done} / {progress.total}
          </div>
        )}
        {!running && rows.length > 0 && (
          <div className="font-mono text-xs text-neutral-500" data-testid="inset-benchmark-caption">
            {ballCount} balls · inset {inset} · median of 7 batches
          </div>
        )}
        {!running && rows.length === 0 && (
          <div className="text-xs text-neutral-500">
            Sweeps traversal × cell with and without the inset level, then walks the inset for the pinch.
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse font-mono text-xs tabular-nums">
            <thead>
              <tr
                className={`
                  text-left text-neutral-400
                  dark:text-neutral-500
                `}
              >
                <th className="py-1 pr-3 font-medium">traversal</th>
                <th className="py-1 pr-3 text-right font-medium">cell</th>
                <th className="py-1 pr-3 text-right font-medium">ms</th>
                <th className="py-1 pr-3 text-right font-medium">+inset</th>
                <th className="py-1 pr-3 text-right font-medium">ms ×</th>
                <th className="py-1 pr-3 text-right font-medium">evals</th>
                <th className="py-1 pr-3 text-right font-medium">+inset</th>
                <th className="py-1 pr-3 text-right font-medium">evals ×</th>
                <th className="py-1 pr-3 text-right font-medium">verts ×</th>
                <th className="py-1 pr-3 font-medium">loops</th>
              </tr>
            </thead>
            <tbody data-testid="inset-benchmark-rows">
              {rows.map((row) => {
                const isSparse = row.traversal === 'sparse';
                const evalsFree = row.insetEvals === row.baseEvals;
                return (
                  <tr
                    key={row.id}
                    data-testid={`inset-row-${row.id}`}
                    className={cn(
                      `
                        border-t border-neutral-100
                        dark:border-neutral-800
                      `,
                      isSparse &&
                        `
                          bg-indigo-50/60
                          dark:bg-indigo-950/30
                        `
                    )}
                  >
                    <td
                      className={cn(
                        'py-1 pr-3',
                        isSparse
                          ? `
                            text-indigo-600
                            dark:text-indigo-400
                          `
                          : 'text-neutral-500'
                      )}
                    >
                      {row.traversal}
                    </td>
                    <td className="py-1 pr-3 text-right text-neutral-500">{row.cell}</td>
                    <td className="py-1 pr-3 text-right text-neutral-500">{formatMs(row.baseMs)}</td>
                    <td
                      className={`
                        py-1 pr-3 text-right font-medium text-neutral-900
                        dark:text-neutral-100
                      `}
                    >
                      {formatMs(row.insetMs)}
                    </td>
                    <td className="py-1 pr-3 text-right text-neutral-500">{ratio(row.insetMs, row.baseMs)}</td>
                    <td className="py-1 pr-3 text-right text-neutral-500">{numberFormatter.format(row.baseEvals)}</td>
                    <td className="py-1 pr-3 text-right text-neutral-500">{numberFormatter.format(row.insetEvals)}</td>
                    <td
                      className={cn(
                        'py-1 pr-3 text-right font-medium',
                        evalsFree
                          ? `
                            text-emerald-600
                            dark:text-emerald-400
                          `
                          : `
                            text-amber-600
                            dark:text-amber-400
                          `
                      )}
                    >
                      {ratio(row.insetEvals, row.baseEvals)}
                    </td>
                    <td className="py-1 pr-3 text-right text-neutral-500">{ratio(row.insetPoints, row.basePoints)}</td>
                    <td className="py-1 pr-3 text-neutral-500">
                      {row.surfaceLoops} + {row.insetLoops}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {result !== null && result.pinch.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="font-mono text-xs text-neutral-400">
            topology vs inset width
            {result.pinchAt !== null && (
              <span
                className={`
                  text-amber-600
                  dark:text-amber-400
                `}
                data-testid="pinch-at"
              >
                {' '}
                · splits at {result.pinchAt}
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse font-mono text-xs tabular-nums">
              <thead>
                <tr
                  className={`
                    text-left text-neutral-400
                    dark:text-neutral-500
                  `}
                >
                  <th className="py-1 pr-3 text-right font-medium">inset</th>
                  <th className="py-1 pr-3 text-right font-medium">surface loops</th>
                  <th className="py-1 pr-3 text-right font-medium">inner loops</th>
                  <th className="py-1 font-medium">shape</th>
                </tr>
              </thead>
              <tbody data-testid="pinch-rows">
                {result.pinch.map((row) => {
                  const split = row.insetLoops > row.surfaceLoops;
                  const gone = row.insetLoops === 0;
                  return (
                    <tr
                      key={row.inset}
                      data-testid={`pinch-row-${row.inset}`}
                      className={`
                        border-t border-neutral-100
                        dark:border-neutral-800
                      `}
                    >
                      <td className="py-1 pr-3 text-right text-neutral-500">{row.inset}</td>
                      <td className="py-1 pr-3 text-right text-neutral-500">{row.surfaceLoops}</td>
                      <td
                        className={cn(
                          'py-1 pr-3 text-right font-medium',
                          split
                            ? `
                              text-amber-600
                              dark:text-amber-400
                            `
                            : `
                              text-neutral-900
                              dark:text-neutral-100
                            `
                        )}
                      >
                        {row.insetLoops}
                      </td>
                      <td className="py-1 text-neutral-500">
                        {gone ? 'nothing left' : split ? 'split' : 'one band per lobe'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rows.length > 0 && !running && (
        <p className="max-w-prose text-xs/relaxed text-neutral-500">
          The <span className="font-mono">evals ×</span> column is the claim and its limit in one place: exactly{' '}
          <span className="font-mono">1.000</span> for the grid walks, because a fixed grid visits the same cells either
          way and the second level only redoes the per-edge interpolation — and above that for{' '}
          <span className="font-mono">sparse</span>, which has to go find its contours and therefore pays for a second
          perimeter. Sample sharing is real; a free second contour is not. Watch the sparse ratio climb toward 2 as the
          cell shrinks, since the levels share ancestor nodes for a fixed number of tree levels while the leaf count
          keeps doubling.
        </p>
      )}
    </div>
  );
};
