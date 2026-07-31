import { Button } from '#src/components/button/button.js';
import { cn } from '@monorepo/utils';
import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { Ball, ContourTracer } from '../field.js';
import { PathSweepRow, runPathSweep } from './path-sweep.js';

const numberFormatter = new Intl.NumberFormat('en-US');
const formatMs = (ms: number): string => (ms >= 10 ? ms.toFixed(1) : ms >= 1 ? ms.toFixed(2) : ms.toFixed(3));

/** The configuration the story ships. Called out so the table has an anchor. */
const SHIPPED = { cell: 2, precision: 1, smooth: true };

interface PathBenchmarkPanelProps {
  tracer: ContourTracer;
  /** Snapshot of the live surface, so the table describes the shape on screen. */
  getBalls: () => Ball[];
  radius: number;
  sigma: number;
  blend: number;
  cells: readonly number[];
  precisions: readonly number[];
  className?: string;
}

export const PathBenchmarkPanel: FC<PathBenchmarkPanelProps> = ({
  tracer,
  getBalls,
  radius,
  sigma,
  blend,
  cells,
  precisions,
  className,
}) => {
  const [rows, setRows] = useState<PathSweepRow[]>([]);
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

    void runPathSweep({
      tracer,
      balls,
      radius,
      sigma,
      blend,
      cells,
      precisions,
      signal: controller.signal,
      onProgress: (update) => {
        setRows(update.rows);
        setProgress({ done: update.done, total: update.total });
      },
    }).finally(() => {
      if (!controller.signal.aborted) setProgress(null);
    });
  }, [tracer, getBalls, radius, sigma, blend, cells, precisions]);

  const running = progress !== null;

  return (
    <div className={cn('flex flex-col gap-3', className)} data-testid="path-benchmark">
      <div className="flex flex-row flex-wrap items-center gap-3">
        <Button
          size="sm"
          onClick={handleRun}
          disabled={running}
          data-testid="run-path-benchmark"
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
          <div className="font-mono text-xs text-neutral-500" data-testid="path-benchmark-caption">
            {ballCount} balls · median of 7 batches · one trace per cell, held still for both builders
          </div>
        )}
        {!running && rows.length === 0 && (
          <div className="text-xs text-neutral-500">
            Sweeps cell × command × precision, timing the two path builders against identical geometry.
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
                <th className="py-1 pr-3 text-right font-medium">cell</th>
                <th className="py-1 pr-3 font-medium">cmd</th>
                <th className="py-1 pr-3 text-right font-medium">prec</th>
                <th className="py-1 pr-3 text-right font-medium">trace</th>
                <th className="py-1 pr-3 text-right font-medium">Path2D</th>
                <th className="py-1 pr-3 text-right font-medium">d string</th>
                <th className="py-1 pr-3 text-right font-medium">d / P2D</th>
                <th className="py-1 pr-3 text-right font-medium">chars</th>
                <th className="py-1 pr-3 text-right font-medium">b/vert</th>
                <th className="py-1 pr-3 text-right font-medium">round-off</th>
              </tr>
            </thead>
            <tbody data-testid="path-benchmark-rows">
              {rows.map((row) => {
                const shipped =
                  row.cell === SHIPPED.cell && row.precision === SHIPPED.precision && row.smooth === SHIPPED.smooth;
                return (
                  <tr
                    key={row.id}
                    data-testid={`path-row-${row.id}`}
                    className={cn(
                      `
                        border-t border-neutral-100
                        dark:border-neutral-800
                      `,
                      shipped &&
                        `
                          bg-indigo-50/60
                          dark:bg-indigo-950/30
                        `
                    )}
                  >
                    <td className="py-1 pr-3 text-right text-neutral-500">{row.cell}</td>
                    <td
                      className={cn(
                        'py-1 pr-3',
                        row.smooth
                          ? `
                            text-indigo-600
                            dark:text-indigo-400
                          `
                          : 'text-neutral-500'
                      )}
                    >
                      {row.smooth ? 'Q' : 'L'}
                    </td>
                    <td className="py-1 pr-3 text-right text-neutral-500">{row.precision}</td>
                    <td className="py-1 pr-3 text-right text-neutral-500">{formatMs(row.traceMs)}</td>
                    <td className="py-1 pr-3 text-right text-neutral-500">{formatMs(row.path2dMs)}</td>
                    <td
                      className={`
                        py-1 pr-3 text-right font-medium text-neutral-900
                        dark:text-neutral-100
                      `}
                    >
                      {formatMs(row.dataMs)}
                    </td>
                    <td className="py-1 pr-3 text-right text-neutral-500">
                      {row.path2dMs > 0 ? `${(row.dataMs / row.path2dMs).toFixed(1)}×` : '—'}
                    </td>
                    <td className="py-1 pr-3 text-right text-neutral-500">{numberFormatter.format(row.chars)}</td>
                    <td className="py-1 pr-3 text-right text-neutral-500">
                      {row.vertices > 0 ? (row.chars / row.vertices).toFixed(1) : '—'}
                    </td>
                    <td
                      className={cn(
                        'py-1 pr-3 text-right',
                        row.maxError > row.cell / 2
                          ? `
                            text-amber-600
                            dark:text-amber-400
                          `
                          : 'text-neutral-500'
                      )}
                    >
                      {row.maxError.toFixed(3)}
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
          Read <span className="font-mono">d / P2D</span> for the price of the move: the same vertices cost that much
          more to express as a string than as a <span className="font-mono">Path2D</span>, and{' '}
          <span className="font-mono">b/vert</span> is what the browser then has to reparse per vertex.{' '}
          <span className="font-mono">round-off</span> is flagged once it exceeds half a cell, which is the point where
          quantisation is throwing away more than the sampling grid resolved. <span className="font-mono">L</span> rows
          are the raw marching-squares polyline — cheaper and shorter, and at these cell sizes the curve it replaces is
          already sub-pixel.
        </p>
      )}
    </div>
  );
};
