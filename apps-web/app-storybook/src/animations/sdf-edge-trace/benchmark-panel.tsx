import { Button } from '#src/components/button/button.js';
import { cn } from '@monorepo/utils';
import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { Ball, ContourTracer } from './field.js';
import { SweepRow, runSweep } from './sweep.js';

const numberFormatter = new Intl.NumberFormat('en-US');

const formatMs = (ms: number): string => (ms >= 10 ? ms.toFixed(1) : ms >= 1 ? ms.toFixed(2) : ms.toFixed(3));

interface BenchmarkPanelProps {
  tracer: ContourTracer;
  /** Snapshot of the live canvas, so the table describes the shape on screen. */
  getBalls: () => Ball[];
  radius: number;
  sigma: number;
  blend: number;
  cells: readonly number[];
  className?: string;
}

export const BenchmarkPanel: FC<BenchmarkPanelProps> = ({
  tracer,
  getBalls,
  radius,
  sigma,
  blend,
  cells,
  className,
}) => {
  const [rows, setRows] = useState<SweepRow[]>([]);
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
    setProgress({ done: 0, total: 1 });

    void runSweep({
      tracer,
      balls,
      radius,
      sigma,
      blend,
      cells,
      signal: controller.signal,
      onProgress: (update) => {
        setRows(update.rows);
        setProgress({ done: update.done, total: update.total });
      },
    }).finally(() => {
      if (!controller.signal.aborted) setProgress(null);
    });
  }, [tracer, getBalls, radius, sigma, blend, cells]);

  const running = progress !== null;
  const slowest = rows.reduce((max, row) => Math.max(max, row.ms), 0);
  // Everything is compared against the worst configuration: a full dense scan.
  const baseline = rows.find((row) => row.field === 'density' && row.traversal === 'dense' && row.cell === 1);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-row flex-wrap items-center gap-3">
        <Button size="sm" onClick={handleRun} disabled={running} allPossibleContents={['Run benchmark', 'Running…']}>
          {running ? 'Running…' : 'Run benchmark'}
        </Button>
        {running && (
          <div className="font-mono text-xs text-neutral-500">
            {progress.done} / {progress.total}
          </div>
        )}
        {!running && rows.length > 0 && (
          <div className="font-mono text-xs text-neutral-500">
            {ballCount} balls · median of 7 batches · contours cross-checked against the dense scan
          </div>
        )}
        {!running && rows.length === 0 && (
          <div className="text-xs text-neutral-500">
            Sweeps every field × traversal × cell size against the shape currently on the canvas.
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse font-mono text-xs tabular-nums">
            <thead>
              <tr
                className={`
                  text-left text-neutral-400
                  dark:text-neutral-500
                `}
              >
                <th className="py-1 pr-3 font-medium">field</th>
                <th className="py-1 pr-3 font-medium">traversal</th>
                <th className="py-1 pr-3 text-right font-medium">cell</th>
                <th className="py-1 pr-3 text-right font-medium">ms</th>
                <th className="py-1 pr-3 text-right font-medium">evals</th>
                <th className="py-1 pr-3 text-right font-medium">vs worst</th>
                <th className="py-1 pr-3 font-medium">contour</th>
                <th className="w-1/4 py-1 font-medium">
                  <span className="sr-only">relative cost</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isSparse = row.traversal === 'sparse';
                return (
                  <tr
                    key={row.id}
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
                    <td className="py-1 pr-3 text-neutral-500">{row.field}</td>
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
                    <td
                      className={`
                        py-1 pr-3 text-right font-medium text-neutral-900
                        dark:text-neutral-100
                      `}
                    >
                      {formatMs(row.ms)}
                    </td>
                    <td className="py-1 pr-3 text-right text-neutral-500">{numberFormatter.format(row.fieldEvals)}</td>
                    <td className="py-1 pr-3 text-right text-neutral-500">
                      {baseline && row.ms > 0 ? `${(baseline.ms / row.ms).toFixed(1)}×` : '—'}
                    </td>
                    <td className="py-1 pr-3">
                      {row.agreesWithDense === null ? (
                        <span className="text-neutral-400">ref</span>
                      ) : row.agreesWithDense ? (
                        <span
                          className={`
                            text-emerald-600
                            dark:text-emerald-400
                          `}
                        >
                          ✓ {row.loopCount}/{row.pointCount}
                        </span>
                      ) : (
                        <span
                          className={`
                            text-rose-600
                            dark:text-rose-400
                          `}
                        >
                          ✗ {row.loopCount}/{row.pointCount}
                        </span>
                      )}
                    </td>
                    <td className="py-1">
                      <div
                        className={`
                          h-2 w-full overflow-hidden rounded-sm bg-neutral-100
                          dark:bg-neutral-800
                        `}
                      >
                        <div
                          className={cn(
                            'h-full rounded-sm',
                            isSparse
                              ? 'bg-indigo-500'
                              : `
                                bg-neutral-400
                                dark:bg-neutral-600
                              `
                          )}
                          style={{ width: `${slowest > 0 ? Math.max((row.ms / slowest) * 100, 0.6) : 0}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && !running && (
        <p className="max-w-prose text-xs leading-relaxed text-neutral-500">
          Read the <span className="font-mono">evals</span> column down each traversal:{' '}
          <span className="font-mono">dense</span> and <span className="font-mono">bounded</span> quadruple when the
          cell size halves (O(area)), while <span className="font-mono">sparse</span> only doubles (O(perimeter)). That
          gap, not per-sample cost, is the whole argument for a real distance field — SDF is actually the <em>more</em>{' '}
          expensive field to evaluate.
        </p>
      )}
    </div>
  );
};
