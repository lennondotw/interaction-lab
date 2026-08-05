import { cn } from '@monorepo/utils';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Eraser, Pencil, Square, Type } from 'lucide-react';
import { useState } from 'react';
import { MetaSurface } from './meta-surface.js';
import { OverflowContent } from './overflow-content.js';
import { OVERFLOW_KINDS, OVERFLOW_LABELS, type OverflowKind } from './overflow-kind.js';
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

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Every content the cell can hold, stacked at zero height, so the cell keeps the width of
 * its widest state instead of resizing as the value changes.
 *
 * The value is reserved one digit *position* at a time — ten stacked digits per slot —
 * rather than enumerating every number the slider can produce. Each `slots` entry is a
 * column of alternatives contributing its widest one; the row sums the slots.
 */
const ReservedWidth = ({ slots }: { slots: string[][] }) => (
  <span aria-hidden className="invisible flex h-0 flex-row overflow-clip leading-0">
    {slots.map((alternatives, index) => (
      <span className="flex flex-col" key={`${index}-${alternatives[0]}`}>
        {alternatives.map((alternative) => (
          <span key={alternative}>{alternative}</span>
        ))}
      </span>
    ))}
  </span>
);

/**
 * One row of a two-column knob grid: the label ends and the track begins on the same
 * column line, and neither moves as the value changes.
 */
const Knob = ({
  label,
  value,
  max,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
  testId?: string;
}) => (
  <label className="col-span-2 grid grid-cols-subgrid items-center">
    <span className="text-right">
      {label} {value}
      {/*
        A block-level sibling of the visible line, so the cell resolves to the wider of
        the two rather than to their sum. The label carries a non-breaking space: a plain
        trailing space collapses away and would reserve nothing.
      */}
      <ReservedWidth slots={[[`${label}\u00a0`], ...Array.from({ length: String(max).length }, () => DIGITS)]} />
    </span>
    <input
      type="range"
      min={0}
      max={max}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      data-testid={testId}
    />
  </label>
);

/** Two items far enough apart to stay separate, close enough to bridge on demand. */
export const Default: StoryObj = {
  // Top-left, not centred: the surface grows as the gap widens, and growing away from a
  // fixed corner is easier to read than growing symmetrically about a moving centre.
  parameters: { layout: 'padded' },
  render: () => {
    const [gap, setGap] = useState(56);
    const [blend, setBlend] = useState(40);
    const [outline, setOutline] = useState(0);
    const [traced, setTraced] = useState<SurfaceTraceResult | null>(null);

    return (
      <div className="flex flex-col items-start gap-5">
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

        <div className="flex flex-col items-start gap-2 font-mono text-xs text-neutral-500">
          {/*
            One grid for the three knobs, so every label ends and every track begins on the
            same column line. Each label spans both columns of this grid rather than
            nesting a row of its own, which keeps the label wrapping its input.
          */}
          <div className="grid grid-cols-[auto_auto] items-center gap-2">
            <Knob label="gap" value={gap} max={140} onChange={setGap} />
            <Knob label="blend" value={blend} max={90} onChange={setBlend} />
            <Knob label="outline" value={outline} max={24} onChange={setOutline} />
          </div>
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
        <div className="grid grid-cols-[auto_auto] items-center gap-x-3 font-mono text-xs text-neutral-400">
          <Knob label="gap" value={gap} max={40} onChange={setGap} testId="toolbar-gap" />
        </div>
        <p className="max-w-sm text-center text-xs/relaxed text-neutral-500">
          Selected: <span className="font-mono">{active ?? 'none'}</span>. Tab through the buttons at any gap — the
          focus ring follows each button&apos;s own box, merged or not.
        </p>
      </div>
    );
  },
};

/**
 * The clip, which the other stories never exercise. They draw a fill and an outline — both
 * of which paint *inside* the shape and so can never show whether the boundary is right.
 * A clip is the opposite: it decides what happens to content that does not belong to the
 * shape at all.
 *
 * So the content here is deliberately wrong for the shape. Every option fills the whole
 * region box, which is a rectangle, while the shape inside it is a blob — so all of it
 * spills past the contour on four sides by construction. Turn `clip` off to see the
 * rectangle it really is; turn it on and the same content is cut to the traced curve.
 *
 * `clip` moves nothing else. The content stays in the same layer either way, so the toggle
 * changes exactly one thing — see `BackdropProps.clip` for why that mattered enough to be a
 * prop rather than the story swapping the element out.
 */
export const ClippedOverflow: StoryObj = {
  parameters: { layout: 'centered', controls: { disable: true } },
  render: () => {
    const [clip, setClip] = useState(true);
    const [kind, setKind] = useState<OverflowKind>('grid');
    const [gap, setGap] = useState(16);
    const [outline, setOutline] = useState(3);

    return (
      <div className="flex flex-col gap-5">
        <MetaSurface
          blend={44}
          outline={outline}
          outlineColor="rgb(165 180 252 / 0.9)"
          // No fill: a fill would sit under the backdrop and muddy what the clip is doing.
          fill={null}
          className="flex w-fit flex-row items-center p-12"
        >
          <MetaSurface.Backdrop clip={clip}>
            <OverflowContent kind={kind} />
          </MetaSurface.Backdrop>
          <div className="flex flex-row items-center" style={{ gap }}>
            <MetaSurface.Item className="size-28 shrink-0 rounded-4xl" />
            <MetaSurface.Item className="size-20 shrink-0 rounded-full" />
            <MetaSurface.Item className="h-24 w-36 shrink-0 rounded-3xl" />
          </div>
        </MetaSurface>

        <div className="flex flex-col gap-2 font-mono text-xs text-neutral-500">
          <label className="flex flex-row items-center gap-2">
            <input
              type="checkbox"
              checked={clip}
              onChange={(event) => setClip(event.target.checked)}
              data-testid="clip-toggle"
              className="size-3.5 accent-indigo-500"
            />
            clip to shape
          </label>
          <div className="flex flex-row items-center gap-2">
            content
            {OVERFLOW_KINDS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setKind(option)}
                className={cn(
                  'rounded-sm px-2 py-0.5',
                  option === kind
                    ? 'bg-indigo-500 text-white'
                    : `
                      text-neutral-400
                      hover:text-neutral-200
                    `
                )}
              >
                {OVERFLOW_LABELS[option]}
              </button>
            ))}
          </div>
          <label className="flex flex-row items-center gap-2">
            gap {String(gap).padStart(3)}
            <input type="range" min={0} max={80} value={gap} onChange={(e) => setGap(Number(e.target.value))} />
          </label>
          <label className="flex flex-row items-center gap-2">
            outline {String(outline).padStart(2)}
            <input type="range" min={0} max={16} value={outline} onChange={(e) => setOutline(Number(e.target.value))} />
          </label>
        </div>
      </div>
    );
  },
};
