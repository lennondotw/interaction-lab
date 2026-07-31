/**
 * A scope for a live numeric series, plotted against wall-clock time and scrolling at the
 * display's refresh rate.
 *
 * Styleless: it paints the series, the zero line and the axis labels, and nothing else. No
 * border, no background, no radius, no padding — a caller who wants chrome puts it on the
 * element through `className`, which is also how the height is set.
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
 *
 * The y axis is always zero-based, and its top follows the tallest sample *currently
 * visible* rather than the tallest ever seen, so a peak that has scrolled away stops
 * stretching the scale. That top is eased toward its target instead of snapped, because a
 * hard jump the instant the tallest bar leaves the window reads as exactly the stepping
 * the canvas was adopted to remove.
 */

import { cn } from '@monorepo/utils';
import { useAnimationFrame } from 'motion/react';
import { useRef, type FC } from 'react';

export interface LiveScopeSample {
  /** `performance.now()` when the value was produced. */
  at: number;
  value: number;
}

export interface LiveScopeColors {
  grid: string;
  axis: string;
  label: string;
  bar: string;
  /** Bars at or above `threshold`. Falls back to `bar` when no threshold is set. */
  barOverThreshold: string;
}

const DEFAULT_COLORS: LiveScopeColors = {
  grid: 'rgba(148, 163, 184, 0.16)',
  axis: 'rgba(148, 163, 184, 0.35)',
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
  /** Width of the plotted window, in ms. */
  spanMs?: number;
  /**
   * Floor for the axis top. Needed because the scale is data-driven: without it an empty
   * window divides by zero and one small sample fills the plot.
   */
  minScale?: number;
  /** Headroom above the visible peak, as a multiplier. */
  headroom?: number;
  /** Per-frame approach of the axis top toward its target, 0..1. Lower is smoother. */
  scaleEase?: number;
  /** Horizontal rules and labels, excluding zero. */
  ticks?: number;
  /** Samples at or above this are painted with `barOverThreshold`. */
  threshold?: number;
  /** Gutter reserved for axis labels, in CSS px. 0 hides them. */
  axisWidth?: number;
  barWidth?: number;
  colors?: Partial<LiveScopeColors>;
  /** Axis label text. Receives the tick value and the current axis top. */
  formatTick?: (value: number, scale: number) => string;
  className?: string;
}

/** Keeps the first and last axis labels fully inside the box. */
const LABEL_INSET = 6;

const defaultFormatTick = (value: number, scale: number): string => value.toFixed(scale < 1 ? 2 : 1);

export const LiveScope: FC<LiveScopeProps> = ({
  read,
  spanMs = 4000,
  minScale = 1,
  headroom = 1.15,
  scaleEase = 0.08,
  ticks = 4,
  threshold,
  axisWidth = 40,
  barWidth = 2,
  colors,
  formatTick = defaultFormatTick,
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Eased axis top. Persisted across frames so it can approach rather than snap. */
  const scaleRef = useRef(minScale);

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
    const samples = read(now - spanMs);

    let visibleMax = 0;
    for (const sample of samples) if (sample.value > visibleMax) visibleMax = sample.value;
    const target = Math.max(visibleMax * headroom, minScale);
    scaleRef.current += (target - scaleRef.current) * scaleEase;
    const scale = scaleRef.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const plotLeft = axisWidth;
    const plotWidth = width - axisWidth;
    // Baseline inset by half a pixel so the zero rule lands on a device pixel, and the top
    // left a little clear so a full-scale bar is not flush with the edge.
    const baseline = height - 0.5;
    const plotHeight = height - 6;

    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= ticks; i++) {
      const value = (scale / ticks) * i;
      const y = baseline - (value / scale) * plotHeight;
      ctx.strokeStyle = i === 0 ? palette.axis : palette.grid;
      ctx.beginPath();
      ctx.moveTo(plotLeft, Math.round(y) + 0.5);
      ctx.lineTo(width, Math.round(y) + 0.5);
      ctx.stroke();
      if (axisWidth > 0) {
        ctx.fillStyle = palette.label;
        // Clamped into the box: the zero label is centred on the baseline, so half of it
        // would otherwise sit below the bottom edge and read as clipped.
        const labelY = Math.min(Math.max(y, LABEL_INSET), height - LABEL_INSET);
        ctx.fillText(formatTick(value, scale), axisWidth - 6, labelY);
      }
    }

    if (axisWidth > 0) {
      ctx.strokeStyle = palette.axis;
      ctx.beginPath();
      ctx.moveTo(plotLeft + 0.5, 0);
      ctx.lineTo(plotLeft + 0.5, baseline);
      ctx.stroke();
    }

    for (const sample of samples) {
      const age = now - sample.at;
      if (age < 0 || age > spanMs) continue;
      const x = plotLeft + plotWidth * (1 - age / spanMs);
      const barHeight = Math.max((sample.value / scale) * plotHeight, 1);
      ctx.fillStyle = threshold !== undefined && sample.value >= threshold ? palette.barOverThreshold : palette.bar;
      ctx.fillRect(x - barWidth, baseline - barHeight, barWidth, barHeight);
    }
  });

  return <canvas ref={canvasRef} data-slot="live-scope" className={cn('block', className)} />;
};
