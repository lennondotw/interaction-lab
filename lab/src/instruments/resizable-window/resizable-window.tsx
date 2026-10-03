import { motion, useMotionValue, useTransform, type MotionValue } from 'motion/react';
import { useRef, useState, type PointerEvent, type ReactNode } from 'react';

import { indicatorSize } from './resize-indicator-geometry.js';
import {
  ResizeIndicators,
  useIndicatorStyle,
  type HandleAxis as Axis,
  type HoveredHandle,
} from './resize-indicators.js';

interface Size {
  width: number;
  height: number;
}
interface WindowSize {
  width: number;
  height: number | 'auto';
}
interface Drag {
  pointerId: number;
  x: number;
  y: number;
  size: WindowSize;
  axis: Axis;
}

// Bounds keep the chat usable while allowing narrow reflow.
const defaultInitialSize = { width: 560, height: 800 };
const defaultMinimumSize = { width: 320, height: 560 };
// Absolute insets start at the inner border edge. Half the 1px stroke places
// each edge handle's center on the painted border center.
// Edge endpoints are derived from the corner's half-size and inset so the hit areas meet.
// The width handle's grid area follows the body row, excluding the title row.
const handles = [
  {
    axis: 'width',
    label: 'Resize width',
    className:
      'row-start-2 row-end-3 top-0 bottom-(--resize-edge-inset) -right-[0.5px] w-2 translate-x-1/2 cursor-ew-resize',
  },
  {
    axis: 'height',
    label: 'Resize height',
    className: 'inset-x-(--resize-edge-inset) -bottom-[0.5px] h-2 translate-y-1/2 cursor-ns-resize',
  },
  {
    axis: 'both',
    label: 'Resize window',
    className:
      'right-(--resize-corner-inset) bottom-(--resize-corner-inset) size-(--resize-corner-size) translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
  },
] as const;

/**
 * Keep the handle focused for arrow-key resizing, while choosing the ring for
 * the input that actually owns the interaction. After a page reload, focus()
 * from pointerdown can match :focus-visible because the browser has no previous
 * mouse-focus history; focusVisible: false makes pointer intent explicit.
 *
 * Chromium returns early from focus() when the element is already focused, so
 * calling it again with different options does not update the ring. Moreover,
 * an explicit false takes precedence over its usual keyboard heuristic: simply
 * pressing an arrow key will not restore the ring. When its appearance must
 * change, blur first so the next focus applies the new options. This is needed
 * in both directions (pointer -> keyboard and keyboard -> pointer).
 * https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/core/dom/element.cc
 *
 * Skip the transition when focus and ring already match. Repeated drag presses
 * or arrow-key repeats should not emit needless blur/focus events. Native Tab
 * navigation remains untouched, and preventScroll keeps refocusing from moving
 * the viewport during a resize.
 */
function focusHandle(target: HTMLButtonElement, focusVisible: boolean) {
  const focused = target.matches(':focus');
  if (focused && target.matches(':focus-visible') === focusVisible) return;
  if (focused) target.blur();
  // focusVisible is a native FocusOptions member, not yet declared by our DOM lib.
  const options = { preventScroll: true, focusVisible };
  target.focus(options);
}

function ResizeGrip({
  axis,
  hoveredAxis,
  activeAxis,
}: {
  axis: Exclude<Axis, 'both'>;
  hoveredAxis: MotionValue<HoveredHandle>;
  activeAxis: MotionValue<HoveredHandle>;
}) {
  const vertical = axis === 'width';
  const { readStyle, thickness, color, opacity } = useIndicatorStyle(axis, hoveredAxis, activeAxis);
  const canvas = {
    width: vertical ? indicatorSize.hover.thickness : indicatorSize.hover.length,
    height: vertical ? indicatorSize.hover.length : indicatorSize.hover.thickness,
  };
  const path = useTransform(() => {
    const appearance = readStyle();
    const halfLength = (appearance.length - appearance.thickness) / 2;
    const x = canvas.width / 2;
    const y = canvas.height / 2;
    return vertical
      ? `M ${x} ${y - halfLength} L ${x} ${y + halfLength}`
      : `M ${x - halfLength} ${y} L ${x + halfLength} ${y}`;
  });

  // The side hit area excludes the corner clearance; add it back before taking the body center.
  const centerY = vertical ? 'calc((100% + var(--resize-edge-inset)) / 2)' : '50%';

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ top: centerY }}
      width={canvas.width}
      height={canvas.height}
      viewBox={`0 0 ${canvas.width} ${canvas.height}`}
    >
      <motion.path
        data-resize-indicator={axis}
        d={path}
        fill="none"
        stroke={color}
        strokeOpacity={opacity}
        strokeWidth={thickness}
        strokeLinecap="round"
      />
    </svg>
  );
}

interface ResizableWindowProps {
  children: ReactNode;
  /** Shown in the header. */
  title?: string;
  /** Accessible name of the window region. */
  label?: string;
  /** Auto height follows content and enables only horizontal resizing. */
  initialSize?: WindowSize;
  minimumSize?: Size;
  /** Single-axis modes show only their edge handle; both also enables the corner. */
  resizeAxis?: Axis;
}

/** A stable top-left origin makes pointer deltas equal actual window size changes. */
export function ResizableWindow({
  children,
  title = 'Chat · Resizable window',
  label: regionLabel = 'Resizable chat window',
  initialSize = defaultInitialSize,
  minimumSize = defaultMinimumSize,
  resizeAxis = 'both',
}: ResizableWindowProps) {
  const [size, setSize] = useState<WindowSize>(initialSize);
  const drag = useRef<Drag | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const hoveredAxis = useMotionValue<HoveredHandle>('none');
  const activeAxis = useMotionValue<HoveredHandle>('none');
  const bothAxes = resizeAxis === 'both' && size.height !== 'auto';

  function endDrag(target: HTMLButtonElement, pointerId: number, revert = false) {
    const current = drag.current;
    if (!current || current.pointerId !== pointerId) return;
    if (revert) setSize(current.size);
    // Clear ownership before releasing capture; lostpointercapture can follow.
    drag.current = null;
    activeAxis.set('none');
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    // A release outside the browser may never deliver pointerup.
    if (event.buttons === 0) {
      endDrag(event.currentTarget, event.pointerId);
      return;
    }
    setSize({
      width:
        current.axis === 'height'
          ? current.size.width
          : Math.max(minimumSize.width, current.size.width + event.clientX - current.x),
      height:
        current.axis === 'width' || current.size.height === 'auto'
          ? current.size.height
          : Math.max(minimumSize.height, current.size.height + event.clientY - current.y),
    });
  }

  return (
    <section
      aria-label={regionLabel}
      className={`relative grid shrink-0 grid-rows-[auto_minmax(0,1fr)] rounded-xl border border-neutral-500/30
        [--resize-corner-size:calc(var(--spacing)*6)] [--resize-corner-inset:calc(var(--spacing)*0.5)]
        [--resize-edge-inset:calc(var(--resize-corner-size)/2+var(--resize-corner-inset))]`}
      style={size}
    >
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-neutral-500/20 px-3 text-xs text-neutral-500 dark:text-neutral-400">
        <span>{title}</span>
        <span className="font-mono tabular-nums">
          {size.width.toFixed(2)} × {size.height === 'auto' ? 'auto' : size.height.toFixed(2)}
        </span>
      </header>
      <div ref={bodyRef} className="min-h-0 min-w-0 p-3">
        {children}
      </div>
      {handles
        .filter((handle) => size.height !== 'auto' || handle.axis === 'width')
        .filter((handle) => resizeAxis === 'both' || handle.axis === resizeAxis)
        .map(({ axis, label, className }) => (
          <motion.button
            key={axis}
            type="button"
            aria-label={label}
            onHoverStart={() => hoveredAxis.set(axis)}
            onHoverEnd={() => {
              if (hoveredAxis.get() === axis) hoveredAxis.set('none');
            }}
            title={`${label} · Arrow keys to resize · Escape to cancel drag`}
            className={`absolute z-20 touch-none rounded-sm select-none focus-visible:outline-2 focus-visible:outline-blue-500 ${className}`}
            onPointerDown={(event) => {
              if (drag.current || !event.isPrimary || event.button !== 0) return;
              drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, size, axis };
              // Active follows drag ownership, not hover/tap hit testing: capture keeps
              // the press alive outside the handle until release, cancellation or Escape.
              activeAxis.set(axis);
              event.currentTarget.setPointerCapture(event.pointerId);
              focusHandle(event.currentTarget, false);
              event.preventDefault();
            }}
            onPointerMove={move}
            onPointerUp={(event) => endDrag(event.currentTarget, event.pointerId)}
            onLostPointerCapture={(event) => endDrag(event.currentTarget, event.pointerId)}
            onPointerCancel={(event) => endDrag(event.currentTarget, event.pointerId, true)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && drag.current) {
                endDrag(event.currentTarget, drag.current.pointerId, true);
                event.preventDefault();
                return;
              }
              if (drag.current) return;
              const dx = axis !== 'height' ? Number(event.key === 'ArrowRight') - Number(event.key === 'ArrowLeft') : 0;
              const dy = axis !== 'width' ? Number(event.key === 'ArrowDown') - Number(event.key === 'ArrowUp') : 0;
              if (!dx && !dy) return;
              focusHandle(event.currentTarget, true);
              event.preventDefault();
              const step = event.shiftKey ? 10 : 1;
              setSize((previous) => ({
                width: axis === 'height' ? previous.width : Math.max(minimumSize.width, previous.width + dx * step),
                height:
                  axis === 'width' || previous.height === 'auto'
                    ? previous.height
                    : Math.max(minimumSize.height, previous.height + dy * step),
              }));
            }}
          >
            {!bothAxes && axis !== 'both' && (
              <ResizeGrip axis={axis} hoveredAxis={hoveredAxis} activeAxis={activeAxis} />
            )}
          </motion.button>
        ))}
      {bothAxes && <ResizeIndicators bodyRef={bodyRef} hoveredAxis={hoveredAxis} activeAxis={activeAxis} />}
    </section>
  );
}
