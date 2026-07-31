import type { Meta, StoryObj } from '@storybook/react-vite';
import { Eraser, Pencil, Square, Type } from 'lucide-react';
import { useState } from 'react';
import { MetaSurface } from './meta-surface.js';
import { MetaSurfaceProbe } from './surface-probe.js';
import { ToolbarGroup } from './toolbar-group.js';
import type { SurfaceTraceResult } from './use-surface-trace.js';

/**
 * The primitive itself, with the knobs exposed. `Consumer` is the story that shows
 * what using it actually looks like.
 */
const meta: Meta = {
  title: 'Components/MetaSurface',
  parameters: { layout: 'centered' },
};

export default meta;

const Card = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <MetaSurface.Item
    className={className}
    aria-hidden={children === undefined ? true : undefined}
    // A participant is an ordinary box: its own padding, its own text, its own
    // rounding. The surface reads the result and never writes to it.
  >
    {children}
  </MetaSurface.Item>
);

/** Two items far enough apart to stay separate, close enough to bridge on demand. */
export const Default: StoryObj = {
  render: () => {
    const [gap, setGap] = useState(56);
    const [blend, setBlend] = useState(40);
    const [outline, setOutline] = useState(0);
    const [traced, setTraced] = useState<SurfaceTraceResult | null>(null);

    return (
      <div className="flex flex-col gap-5">
        <MetaSurface
          blend={blend}
          outline={outline}
          className="flex w-fit flex-row items-center p-10"
          onTraced={setTraced}
        >
          <div className="flex flex-row items-center" style={{ gap }}>
            {/*
              `shrink-0` is load-bearing. A flex item shrinks by default, and at a wide
              gap the gaps alone claim the whole row — every item collapses to zero
              width, which the surface faithfully renders as nothing.
            */}
            <Card className="size-24 shrink-0 rounded-3xl" />
            <Card className="size-24 shrink-0 rounded-3xl" />
            <Card className="h-16 w-32 shrink-0 rounded-full" />
          </div>
        </MetaSurface>

        <div className="flex flex-col gap-2 font-mono text-xs text-neutral-500">
          <label className="flex flex-row items-center gap-2">
            gap {String(gap).padStart(3)}
            <input
              type="range"
              min={0}
              max={140}
              value={gap}
              onChange={(event) => setGap(Number(event.target.value))}
            />
          </label>
          <label className="flex flex-row items-center gap-2">
            blend {String(blend).padStart(3)}
            <input
              type="range"
              min={0}
              max={90}
              value={blend}
              onChange={(event) => setBlend(Number(event.target.value))}
            />
          </label>
          <label className="flex flex-row items-center gap-2">
            outline {String(outline).padStart(2)}
            <input
              type="range"
              min={0}
              max={24}
              value={outline}
              onChange={(event) => setOutline(Number(event.target.value))}
            />
          </label>
          <div data-testid="surface-stats">
            loops {traced?.surfaceLoops ?? 0}
            {outline > 0 ? ` + ${traced?.insetLoops ?? 0}` : ''} · {traced?.vertices ?? 0} verts ·{' '}
            {traced?.fieldEvals ?? 0} evals · {(traced?.traceMs ?? 0).toFixed(3)} ms (one sample, clock-quantised)
          </div>
        </div>
      </div>
    );
  },
};

/**
 * The instrument. Each case mutates the layout and reports whether the contour kept up,
 * measured rather than eyeballed — a surface that misses a participant reports the
 * wrong topology, and a plausible blob does not look wrong.
 */
export const LayoutTracking: StoryObj = {
  parameters: { layout: 'fullscreen', controls: { disable: true } },
  render: () => <MetaSurfaceProbe />,
};

const TOOLBAR_ACTIONS = [
  { id: 'draw', label: 'Draw', icon: <Pencil className="size-5" /> },
  { id: 'shape', label: 'Shape', icon: <Square className="size-5" /> },
  { id: 'text', label: 'Text', icon: <Type className="size-5" /> },
  { id: 'erase', label: 'Erase', icon: <Eraser className="size-5" /> },
];

/**
 * The consumer's view. `ToolbarGroup` knows nothing about fields or contours — its
 * buttons are buttons, in a flex row, with their own hit areas and focus rings, and the
 * group merges their shapes when they sit close.
 *
 * Drag the gap down and the four separate pills fuse into one continuous bar. Nothing
 * about the buttons changes as it happens: tab through them mid-merge and the focus ring
 * still traces each button's own box, because the surface never touches their layout.
 */
export const Consumer: StoryObj = {
  parameters: { layout: 'centered', controls: { disable: true } },
  render: () => {
    const [active, setActive] = useState<string | null>('draw');
    const [gap, setGap] = useState(10);

    return (
      <div className="flex flex-col items-center gap-8 rounded-3xl bg-neutral-950 p-12">
        <ToolbarGroup actions={TOOLBAR_ACTIONS} activeId={active} onSelect={setActive} gap={gap} />
        <label className="flex flex-row items-center gap-3 font-mono text-xs text-neutral-400">
          gap {String(gap).padStart(2)}
          <input
            type="range"
            min={0}
            max={40}
            value={gap}
            onChange={(event) => setGap(Number(event.target.value))}
            data-testid="toolbar-gap"
          />
        </label>
        <p className="max-w-sm text-center text-xs leading-relaxed text-neutral-500">
          Selected: <span className="font-mono">{active ?? 'none'}</span>. Tab through the buttons at any gap — the
          focus ring follows each button&apos;s own box, merged or not.
        </p>
      </div>
    );
  },
};
