import { useRef, useState, type PointerEvent, type ReactNode } from 'react';

type Axis = 'width' | 'height' | 'both';
interface Size {
  width: number;
  height: number;
}
interface Drag {
  pointerId: number;
  x: number;
  y: number;
  size: Size;
  axis: Axis;
}

// Bounds keep the chat usable while allowing narrow reflow.
const initialSize = { width: 560, height: 800 };
const minimumSize = { width: 320, height: 560 };
// Absolute insets start at the inner border edge. Half the 1px stroke places
// each handle's center on the painted border center, rather than inside it.
const handles = [
  { axis: 'width', label: 'Resize width', className: 'inset-y-8 -right-[0.5px] w-2 translate-x-1/2 cursor-ew-resize' },
  {
    axis: 'height',
    label: 'Resize height',
    className: 'inset-x-8 -bottom-[0.5px] h-2 translate-y-1/2 cursor-ns-resize',
  },
  { axis: 'both', label: 'Resize window', className: '-right-1 -bottom-1 size-6 cursor-nwse-resize' },
] as const;

/** A stable top-left origin makes pointer deltas equal actual window size changes. */
export function ResizableWindow({ children }: { children: ReactNode }) {
  const [size, setSize] = useState<Size>(initialSize);
  const drag = useRef<Drag | null>(null);

  function endDrag(target: HTMLButtonElement, pointerId: number, revert = false) {
    const current = drag.current;
    if (!current || current.pointerId !== pointerId) return;
    if (revert) setSize(current.size);
    // Clear ownership before releasing capture; lostpointercapture can follow.
    drag.current = null;
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
        current.axis === 'width'
          ? current.size.height
          : Math.max(minimumSize.height, current.size.height + event.clientY - current.y),
    });
  }

  return (
    <section
      aria-label="Resizable chat window"
      className="relative flex shrink-0 flex-col rounded-xl border border-neutral-500/30"
      style={size}
    >
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-neutral-500/20 px-3 text-xs text-neutral-500 dark:text-neutral-400">
        <span>Chat · Resizable window</span>
        <span className="font-mono tabular-nums">
          {size.width.toFixed(2)} × {size.height.toFixed(2)}
        </span>
      </header>
      <div className="min-h-0 flex-1 p-3">{children}</div>
      {handles.map(({ axis, label, className }) => (
        <button
          key={axis}
          type="button"
          aria-label={label}
          title={`${label} · Arrow keys to resize · Escape to cancel drag`}
          className={`absolute z-20 flex touch-none items-center justify-center rounded-sm select-none focus-visible:outline-2 focus-visible:outline-blue-500 ${className}`}
          onPointerDown={(event) => {
            if (drag.current || !event.isPrimary || event.button !== 0) return;
            drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, size, axis };
            event.currentTarget.setPointerCapture(event.pointerId);
            event.currentTarget.focus({ preventScroll: true });
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
            event.preventDefault();
            const step = event.shiftKey ? 10 : 1;
            setSize((previous) => ({
              width: Math.max(minimumSize.width, previous.width + dx * step),
              height: Math.max(minimumSize.height, previous.height + dy * step),
            }));
          }}
        >
          {axis !== 'both' && (
            <span
              aria-hidden="true"
              className={`pointer-events-none rounded-full bg-neutral-500/60 ${axis === 'width' ? 'h-6 w-[3px]' : 'h-[3px] w-6'}`}
            />
          )}
        </button>
      ))}
    </section>
  );
}
