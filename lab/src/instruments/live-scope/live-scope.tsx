/**
 * A scope for a live numeric series, plotted against wall-clock time and scrolling at the
 * display's refresh rate.
 *
 * It paints the series and internal rules on canvas, with a single border overlay when
 * axes are shown, and positions DOM axis labels outside that frame. A caller sets the
 * overall size through `className` and the plot background through `plotClassName`.
 *
 * Two decisions are the reason this exists as a component rather than as markup.
 *
 * **Canvas on `requestAnimationFrame`, reading through `read` every frame.** The obvious
 * implementation is one absolutely-positioned element per sample, re-rendered from React
 * state. That steps badly: state polled every 200ms delivers samples in clumps, and since
 * each sample's x comes from the snapshot's timestamp, the whole strip freezes between
 * polls and then jumps a poll's worth of distance at once. Polling per frame is not the fix
 * either — reconciling hundreds of elements at 144Hz costs more than most things worth
 * measuring with a scope. So motion lives on a canvas outside React entirely, and any text
 * that does not animate stays with the caller.
 *
 * **Time on the x axis, not sample index.** Gaps are usually the most informative part of a
 * live series — an event-driven producer is idle between events, and indexing by sample
 * would close every gap and make a burst indistinguishable from a trickle.
 * Horizontal speed is fixed in CSS px/s. Resizing changes the visible duration, never the
 * sample spacing or speed. The caller declares its nominal sampling frequency; each bar
 * spans one nominal interval, snapped to device pixels, so missing samples remain visible.
 *
 * The y axis is always zero-based, and its top follows the tallest sample *currently
 * visible* rather than the tallest ever seen, so a peak that has scrolled away stops
 * stretching the scale. That top springs toward its target instead of snapping, because a
 * hard jump the instant the tallest bar leaves the window reads as exactly the stepping
 * the canvas was adopted to remove.
 */

import { cn } from '@monorepo/utils';
import { useAnimationFrame } from 'motion/react';
import { useRef, type FC } from 'react';

import { collectScopeColumns } from './scope-columns.js';
import { ScopeScale } from './scope-scale.js';

export interface LiveScopeSample {
  /** `performance.now()` when the value was produced. */
  at: number;
  value: number;
}

export interface LiveScopeColors {
  grid: string;
  /** Opaque frame color; opacity is applied once to the entire border layer. */
  axis: string;
  label: string;
  bar: string;
  /** Bars at or above `threshold`. Falls back to `bar` when no threshold is set. */
  barOverThreshold: string;
}

const DEFAULT_COLORS: LiveScopeColors = {
  grid: 'rgba(148, 163, 184, 0.16)',
  axis: 'rgb(148, 163, 184)',
  label: 'rgba(148, 163, 184, 0.75)',
  bar: 'rgba(99, 102, 241, 0.85)',
  barOverThreshold: 'rgba(244, 63, 94, 0.9)',
};

export interface LiveScopeProps {
  /**
   * Called once per frame for the samples inside the window. Must be cheap — it runs at
   * refresh rate — and should return only what is in range rather than everything retained.
   */
  read: (fromAt: number) => readonly LiveScopeSample[];
  /** Horizontal speed in CSS px/s, independent of viewport width. */
  pixelsPerSecond?: number;
  /** Nominal producer frequency in Hz. Determines bar width, not horizontal speed. */
  sampleRate: number;
  /**
   * Floor for the axis top. Needed because the scale is data-driven: without it an empty
   * window divides by zero and one small sample fills the plot.
   */
  minScale?: number;
  /** Headroom above the visible peak, as a multiplier. */
  headroom?: number;
  /** Horizontal rules and labels, excluding zero. */
  ticks?: number;
  /** Samples at or above this are painted with `barOverThreshold`. */
  threshold?: number;
  /** Gutter reserved for axis labels, in CSS px. 0 hides them. */
  axisWidth?: number;
  colors?: Partial<LiveScopeColors>;
  /** Axis label text. Receives the tick value and the current axis top. */
  formatTick?: (value: number, scale: number) => string;
  /** Overall size, including the axis label gutter. */
  className?: string;
  /** Plot background, excluding the axis labels and the border overlay. */
  plotClassName?: string;
}

const defaultFormatTick = (value: number, scale: number): string =>
  value === 0 ? '0' : value.toFixed(scale < 1 ? 2 : 1);

export const LiveScope: FC<LiveScopeProps> = ({
  read,
  pixelsPerSecond = 120,
  sampleRate,
  minScale = 1,
  headroom = 1.15,
  ticks = 4,
  threshold,
  axisWidth = 40,
  colors,
  formatTick = defaultFormatTick,
  className,
  plotClassName,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<(HTMLDivElement | null)[]>([]);
  const scaleRef = useRef<ScopeScale | null>(null);
  if (scaleRef.current === null) scaleRef.current = new ScopeScale(minScale);
  const columnsRef = useRef(new Float64Array(0));

  useAnimationFrame(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.round(width * dpr);
    const targetH = Math.round(height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const palette = { ...DEFAULT_COLORS, ...colors };
    const now = performance.now();
    // Keep data inside the 1 CSS px frame. Round inward on fractional DPRs so no painted
    // device pixel straddles the border. A borderless sparkline needs no inset.
    const plotInsetPixels = axisWidth > 0 ? Math.ceil(dpr) : 0;
    const plotWidthPixels = targetW - 2 * plotInsetPixels;
    // Wider plots reveal older samples; they never stretch time or accelerate the strip.
    const pixelsPerMs = (pixelsPerSecond * dpr) / 1000;
    const spanMs = plotWidthPixels / pixelsPerMs;
    const samples = read(now - spanMs);

    if (columnsRef.current.length !== plotWidthPixels) columnsRef.current = new Float64Array(plotWidthPixels);
    const columns = columnsRef.current;
    // One bar covers one nominal sampling period. Missed samples leave real gaps. Its
    // device-pixel footprint stays fixed when the viewport is resized.
    const barWidthPixels = Math.max(1, Math.round((pixelsPerSecond * dpr) / sampleRate));
    const visibleMax = collectScopeColumns(columns, samples, now, pixelsPerMs, barWidthPixels);
    const target = Math.max(visibleMax * headroom, minScale);
    const scale = scaleRef.current!.sample(now, target).value;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Data fills only the frame interior. First/last labels still centre on the border
    // strokes; interior labels share their grid lines' coordinates.
    const plotTop = axisWidth > 0 ? plotInsetPixels / dpr : 0.5;
    const baseline = axisWidth > 0 ? (targetH - plotInsetPixels) / dpr : height - 0.5;
    const plotHeight = baseline - plotTop;

    for (let i = 0; i <= ticks; i++) {
      const value = i === 0 ? 0 : (scale / ticks) * i;
      const y = i === 0 ? height - 0.5 : i === ticks ? 0.5 : Math.round(baseline - (value / scale) * plotHeight) - 0.5;
      // Skip the first (zero) and last (full-scale) grid lines: the bottom and top borders
      // already supply those rules. Their labels remain, centred on the border strokes.
      if (i > 0 && i < ticks) {
        ctx.strokeStyle = palette.grid;
        ctx.beginPath();
        // Inset both endpoints by the frame's 1 CSS px, rounded inward to device pixels.
        // Grid lines must not overlap the border or compound opacity at the intersections.
        ctx.moveTo(plotInsetPixels / dpr, y);
        ctx.lineTo((targetW - plotInsetPixels) / dpr, y);
        ctx.stroke();
      }
      if (axisWidth > 0) {
        const label = labelsRef.current[i]!;
        label.style.transform = `translateY(${y}px)`;
        label.style.color = palette.label;
        label.firstElementChild!.textContent = formatTick(value, scale);
      }
    }

    // Columns are clipped and aggregated in device pixels before painting. Each pixel receives
    // one fill, so sample overlaps cannot compound alpha and fractional edges cannot leave seams.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.rect(plotInsetPixels, Math.round(plotTop * dpr), plotWidthPixels, Math.round(plotHeight * dpr));
    ctx.clip();
    const baselinePixels = Math.round(baseline * dpr);
    for (let column = 0; column < columns.length;) {
      const value = columns[column]!;
      let end = column + 1;
      while (end < columns.length && columns[end] === value) end++;
      if (value !== -Infinity) {
        const barHeight = Math.max(Math.round((value / scale) * plotHeight * dpr), 1);
        ctx.fillStyle = threshold !== undefined && value >= threshold ? palette.barOverThreshold : palette.bar;
        ctx.fillRect(plotInsetPixels + column, baselinePixels - barHeight, end - column, barHeight);
      }
      column = end;
    }
    ctx.restore();
  });

  return (
    <div data-slot="live-scope" className={cn('flex items-start', className)}>
      {axisWidth > 0 && (
        // The gutter reserves width in flow. Zero-height rows centre labels on rules without
        // adding layout height, including the labels that extend past the plot's edges.
        <div data-slot="live-scope-axis" className="flex h-0 shrink-0 flex-col" style={{ width: axisWidth }}>
          {Array.from({ length: ticks + 1 }, (_, i) => (
            <div
              key={i}
              ref={(label) => {
                labelsRef.current[i] = label;
              }}
              data-slot="live-scope-label"
              className="flex h-0 shrink-0 items-center justify-end pr-1.5"
            >
              <span className="font-mono text-[9px] leading-none whitespace-nowrap" />
            </div>
          ))}
        </div>
      )}
      <div data-slot="live-scope-plot" className="relative h-full min-w-0 flex-1">
        <div className={cn('pointer-events-none absolute inset-0', plotClassName)} />
        <canvas ref={canvasRef} data-slot="live-scope-canvas" className="absolute inset-0 block size-full" />
        {axisWidth > 0 && (
          // One opaque color paints all four sides, then opacity-35 fades the entire layer
          // once, keeping corners and sides consistent. Data is clipped to the interior,
          // inset by 1 CSS px on all four sides; this frame never composites over the bars.
          <div
            aria-hidden
            data-slot="live-scope-border"
            className="pointer-events-none absolute inset-0 border opacity-35"
            style={{ borderColor: colors?.axis ?? DEFAULT_COLORS.axis }}
          />
        )}
      </div>
    </div>
  );
};
