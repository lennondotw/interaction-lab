import type { Meta, StoryObj } from '@storybook/react-vite';
import { FC, ReactNode, useEffect, useRef, useState } from 'react';
import { ContinuousCorner } from './index.js';

type Story = StoryObj<typeof ContinuousCorner>;

const HAIRLINE = { width: 1, color: 'rgb(0 0 0 / 0.14)', align: 'inner' } as const;
const SURFACE = 'bg-white dark:bg-white/10';

const meta: Meta<typeof ContinuousCorner> = {
  title: 'Components/ContinuousCorner',
  component: ContinuousCorner,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    radius: { control: { type: 'range', min: 0, max: 120, step: 1 } },
    mode: { control: 'inline-radio', options: ['path', 'css'] },
    debugForceCssBaseline: { control: 'boolean' },
    debugSimulateNoCornerShapeSupport: { control: 'boolean' },
    clipContent: { control: 'boolean' },
    className: { control: 'text' },
    surfaceClassName: { control: 'text' },
  },
  args: {
    radius: 28,
    mode: 'path',
    debugForceCssBaseline: false,
    debugSimulateNoCornerShapeSupport: false,
    clipContent: true,
    className: 'size-40',
    surfaceClassName: SURFACE,
    border: HAIRLINE,
  },
};

export default meta;

/** The subject owns its frame; the canvas background is the theme's. */
const Stage: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="flex min-h-screen w-full items-center justify-center px-2">{children}</div>
);

const Caption: FC<{ children: ReactNode }> = ({ children }) => (
  <span className="font-mono text-xs text-neutral-500">{children}</span>
);

/**
 * One surface, measured, every prop live. Drag `radius` past ~52 — half of this
 * box's 160px side, divided by 1.528665 — and watch the corner stop growing along
 * the edge and start flattening toward a circle instead.
 */
export const Default: Story = {
  render: (args) => (
    <Stage>
      <ContinuousCorner {...args} />
    </Stage>
  ),
};

/** Measured: no `size` prop, so the box comes from layout and the path follows it. */
export const Observed: Story = {
  args: { className: 'h-40 w-72' },
  render: (args) => (
    <Stage>
      <ContinuousCorner {...args} />
    </Stage>
  ),
};

/**
 * Declared: `size` is passed in, so the path exists during the first render rather
 * than one frame later. The caller now owns keeping it in step with real layout.
 */
export const FixedSize: Story = {
  args: { size: { width: 288, height: 160 }, className: 'h-40 w-72' },
  render: (args) => (
    <Stage>
      <ContinuousCorner {...args} />
    </Stage>
  ),
};

/** Auto height from content, which is what the measured mode buys. */
export const AutoHeight: Story = {
  args: { className: 'w-64', contentClassName: 'p-5' },
  render: (args) => (
    <Stage>
      <ContinuousCorner {...args}>
        <p
          className={`
            text-sm/relaxed text-neutral-600
            dark:text-neutral-400
          `}
        >
          Nothing here declares a height. The box grows with this paragraph, the observer reports the new border box,
          and the path is regenerated to match it.
        </p>
      </ContinuousCorner>
    </Stage>
  ),
};

/** Every corner independent. The per-axis budget handles this without extra work. */
export const PerCornerRadii: Story = {
  args: {
    radius: { topLeft: 64, topRight: 8, bottomRight: 40, bottomLeft: 4 },
    className: 'h-40 w-72',
  },
  render: (args) => (
    <Stage>
      <ContinuousCorner {...args} />
    </Stage>
  ),
};

/**
 * A pill, and the case the generator has to work per axis for. Here the corner is
 * saturated vertically and not horizontally, so it reaches 122px along the top edge
 * and only 100px down the side — genuinely not symmetric about its diagonal.
 */
export const AsymmetricBudget: Story = {
  args: { radius: 80, className: 'h-[200px] w-[400px]' },
  render: (args) => (
    <Stage>
      <ContinuousCorner {...args} />
    </Stage>
  ),
};

/** Past the clamp on both axes: the construction lands on a true circle. */
export const Circle: Story = {
  args: { radius: 120, className: 'size-40' },
  render: (args) => (
    <Stage>
      <ContinuousCorner {...args} />
    </Stage>
  ),
};

/**
 * `mode="css"` — `border-radius` plus the fitted `corner-shape` instead of a
 * generated path. 0.0031r from Apple's curve, and it costs no measurement, no SVG
 * and no per-frame path, so it composes with the rest of CSS for free. Correct only
 * below the clamp; use `path` for pills and circles.
 */
export const CssMode: Story = {
  args: { mode: 'css', className: 'h-40 w-72' },
  render: (args) => (
    <Stage>
      <ContinuousCorner {...args} />
    </Stage>
  ),
};

/**
 * What the first frame looks like before the box has been measured: plain
 * `border-radius`, no `corner-shape`. 0.0138r from Apple below the clamp — 0.33px at
 * `r = 24` — and **exact at the clamp**, since `border-radius` clamps to a true pill
 * or circle by itself. That is why the baseline does not try to be clever: it is
 * never the wrong silhouette, only a slightly less smooth corner, and it needs to
 * know nothing about the box to be safe.
 */
export const DebugBaseline: Story = {
  args: { debugForceCssBaseline: true, className: 'h-40 w-72' },
  render: (args) => (
    <Stage>
      <ContinuousCorner {...args} />
    </Stage>
  ),
};

/**
 * `mode="css"` as Safari and Firefox render it today, with no `corner-shape`. The
 * radius scale is gated behind the same `@supports` that applies the superellipse, so
 * the two can only appear together: without it the shape degrades exactly onto the
 * plain-`border-radius` baseline rather than drawing a circular arc 24% too large.
 */
export const CssModeWithoutCornerShape: Story = {
  args: { mode: 'css', debugSimulateNoCornerShapeSupport: true, className: 'h-40 w-72' },
  render: (args) => (
    <Stage>
      <ContinuousCorner {...args} />
    </Stage>
  ),
};

/**
 * Composed, because a third of a pixel is not something a single instance can show.
 * All three shape paths at `r = 40` on a 160px box — deliberately below the crossover
 * at 52.3, since that is the only regime where `css` claims to be close. They should
 * be indistinguishable; `ShapeModesAtTheClamp` is where they stop being.
 *
 * `data-shape` on each root says which path it took.
 */
export const ShapeModes: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Stage>
      <div className="flex flex-row flex-wrap items-center justify-center gap-8">
        {(
          [
            { label: 'path · exact', props: {} },
            { label: 'css · 0.0031r', props: { mode: 'css' as const } },
            { label: 'baseline · 0.0138r', props: { debugForceCssBaseline: true } },
          ] as const
        ).map(({ label, props }) => (
          <div key={label} className="flex flex-col items-center gap-2">
            <ContinuousCorner radius={40} border={HAIRLINE} className="size-40" surfaceClassName={SURFACE} {...props} />
            <Caption>{label}</Caption>
          </div>
        ))}
      </div>
    </Stage>
  ),
};

/**
 * The clamp is where `css` mode stops being an approximation and starts being a
 * different shape. At a pill radius `corner-shape` keeps bulging where Apple
 * flattens onto an arc — 12.5% of the radius — while the plain-`border-radius`
 * baseline is exactly right. Read left to right: correct, wrong, correct.
 */
export const ShapeModesAtTheClamp: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Stage>
      <div className="flex flex-col items-center gap-6">
        {(
          [
            { label: 'path · exact pill', props: {} },
            { label: 'css · 12.5% off', props: { mode: 'css' as const } },
            { label: 'baseline · exact pill', props: { debugForceCssBaseline: true } },
          ] as const
        ).map(({ label, props }) => (
          <div key={label} className="flex flex-col items-center gap-2">
            <ContinuousCorner
              radius={9999}
              border={HAIRLINE}
              className="h-24 w-96"
              surfaceClassName={SURFACE}
              {...props}
            />
            <Caption>{label}</Caption>
          </div>
        ))}
      </div>
    </Stage>
  ),
};

/** An inner border of width `w` is a `2w` stroke clipped to the outline. */
export const BorderInner: Story = {
  args: { border: { width: 8, color: 'rgb(59 130 246 / 0.85)', align: 'inner' } },
  render: (args) => (
    <Stage>
      <ContinuousCorner {...args} />
    </Stage>
  ),
};

/** Centred needs no clipping at all — the stroke is the outline. */
export const BorderCenter: Story = {
  args: { border: { width: 8, color: 'rgb(59 130 246 / 0.85)', align: 'center' } },
  render: (args) => (
    <Stage>
      <ContinuousCorner {...args} />
    </Stage>
  ),
};

/** Outer mirrors inner, masking away the inside half instead of clipping to it. */
export const BorderOuter: Story = {
  args: { border: { width: 8, color: 'rgb(59 130 246 / 0.85)', align: 'outer' } },
  render: (args) => (
    <Stage>
      <ContinuousCorner {...args} />
    </Stage>
  ),
};

/**
 * Clipping the content must not clip the border. The clip lives on a content box
 * inside the root, never on the root itself, so a `center` or `outer` stroke still
 * paints outside the outline — here over an image that is being clipped by it.
 */
export const ClippedContentWithOuterBorder: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Stage>
      <div className="flex flex-row flex-wrap items-center justify-center gap-10">
        {(['inner', 'center', 'outer'] as const).map((align) => (
          <div key={align} className="flex flex-col items-center gap-2">
            <ContinuousCorner
              radius={28}
              clipContent
              border={{ width: 10, color: 'rgb(16 185 129 / 0.9)', align }}
              className="size-32"
              surfaceClassName={SURFACE}
            >
              <div
                className="size-full"
                style={{
                  background: 'repeating-linear-gradient(45deg, #fbbf24 0 8px, #f97316 8px 16px)',
                }}
              />
            </ContinuousCorner>
            <Caption>clip + {align}</Caption>
          </div>
        ))}
      </div>
    </Stage>
  ),
};

/**
 * The one story that needs its own background: `backdrop-filter` has nothing to
 * show against the flat canvas. It is also the reason the fill is a `clip-path`ed
 * element and not an SVG `<path fill>` — an SVG path cannot be backdrop-filtered.
 */
export const BackdropFilter: Story = {
  args: {
    radius: 32,
    className: 'h-40 w-72',
    // Centring goes on the content box, not the root: the root's job is the
    // outline, and layout for children belongs where the children are.
    contentClassName: 'flex items-center justify-center',
    surfaceClassName: 'bg-white/30 backdrop-blur-md',
    border: { width: 1, color: 'rgb(255 255 255 / 0.6)', align: 'inner' },
  },
  render: (args) => (
    <div
      className="flex min-h-screen w-full items-center justify-center px-2"
      style={{
        background: 'repeating-conic-gradient(from 45deg, #f472b6 0% 25%, #38bdf8 0% 50%) 0 0 / 48px 48px',
      }}
    >
      <ContinuousCorner {...args}>
        <span className="text-sm font-medium text-white">backdrop-blur-md</span>
      </ContinuousCorner>
    </div>
  ),
};

/**
 * The scroll rule the layered model imposes: the root must never be the scroller.
 * Its fill and border are `absolute inset-0` layers, which belong to a scroll
 * container's own scrollable content and would slide away on the first wheel tick.
 * Nest the scroller, and give it the padding so text and scrollbar reach the edge.
 */
export const NestedScroller: Story = {
  args: { radius: 28, className: 'h-80 w-md' },
  render: (args) => (
    <Stage>
      <ContinuousCorner {...args}>
        <div className="flex size-full flex-col gap-3 overflow-y-auto overscroll-contain p-6">
          {Array.from({ length: 12 }, (_, index) => (
            <p
              key={index}
              className={`
                text-sm/relaxed text-neutral-600
                dark:text-neutral-400
              `}
            >
              Paragraph {index + 1}. The frame never moves, because the frame is not what scrolls.
            </p>
          ))}
        </div>
      </ContinuousCorner>
    </Stage>
  ),
};

/**
 * Composed, and comparison is the point: the degradation cannot be judged from one
 * radius. Read left to right — the corner grows along the edge until 65.42% of half
 * the short side, then has no budget left and flattens back onto a circular arc.
 * The last three are the same shape.
 */
export const RadiusSweep: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Stage>
      <div className="flex flex-row flex-wrap items-center justify-center gap-8">
        {[8, 24, 48, 78, 100, 120].map((radius) => (
          <div key={radius} className="flex flex-col items-center gap-2">
            <ContinuousCorner radius={radius} border={HAIRLINE} className="size-32" surfaceClassName={SURFACE} />
            <Caption>
              {radius}
              {radius > 52 ? ' clamped' : ''}
            </Caption>
          </div>
        ))}
      </div>
    </Stage>
  ),
};

/**
 * Composed, because the three alignments are only legible against each other. All
 * three are exact at this width — an offset curve would already have cusped.
 */
export const BorderAlignments: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Stage>
      <div className="flex flex-row flex-wrap items-center justify-center gap-8">
        {(['inner', 'center', 'outer'] as const).map((align) => (
          <div key={align} className="flex flex-col items-center gap-2">
            <ContinuousCorner
              radius={28}
              border={{ width: 10, color: 'rgb(59 130 246 / 0.85)', align }}
              className="size-32"
              surfaceClassName={SURFACE}
            />
            <Caption>{align}</Caption>
          </div>
        ))}
      </div>
    </Stage>
  ),
};

/**
 * The performance harness, not a visual story. Each frame writes a new width, so
 * every observed instance regenerates its path per frame while the fixed ones are
 * told their box directly — which is the comparison the trace exists to make.
 *
 * `data-testid="toggle"` drives it from a probe; `data-sizing` on each root says
 * which mode an instance is in.
 */
/**
 * The animation sweeps a width, so every box around it would re-centre each frame.
 * Reserving the widest value up front is what stops the whole story shuddering while
 * only the subject changes size — which is the thing being measured.
 */
const STRESS_MIN_WIDTH = 280;
const STRESS_SWEEP = 160;
const STRESS_MAX_WIDTH = STRESS_MIN_WIDTH + STRESS_SWEEP;

export const ResizeStress: Story = {
  parameters: { controls: { disable: true } },
  render: () => {
    const Stress: FC = () => {
      const [running, setRunning] = useState(false);
      const [width, setWidth] = useState(320);
      const frame = useRef(0);
      const origin = useRef(0);

      useEffect(() => {
        if (!running) return;
        const tick = (now: number) => {
          if (origin.current === 0) origin.current = now;
          const seconds = (now - origin.current) / 1000;
          setWidth(STRESS_MIN_WIDTH + Math.round(STRESS_SWEEP * (0.5 - 0.5 * Math.cos(seconds * 2))));
          frame.current = requestAnimationFrame(tick);
        };
        frame.current = requestAnimationFrame(tick);
        return () => {
          cancelAnimationFrame(frame.current);
          origin.current = 0;
        };
      }, [running]);

      const count = 12;
      return (
        <div className="flex min-h-screen w-full flex-col items-center justify-center gap-5 px-2">
          <div className="flex flex-row items-center gap-3">
            <button
              type="button"
              data-testid="toggle"
              onClick={() => setRunning((value) => !value)}
              className={`
                rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white
                dark:bg-white dark:text-neutral-900
              `}
            >
              {/* Reserved so swapping the label cannot shift the caption beside it. */}
              <span className="inline-block w-8">{running ? 'stop' : 'start'}</span>
            </button>
            <Caption>
              width {width} · {count} observed + {count} fixed
            </Caption>
          </div>

          <div className="flex flex-col gap-2" style={{ width: STRESS_MAX_WIDTH }}>
            <Caption>observed — ResizeObserver, path regenerated per frame</Caption>
            {/*
              A fixed column count rather than `flex-wrap`: wrapping would change
              how many items fit as the width animates, so the group would flip
              between row counts and jump vertically. Grid columns stretch instead,
              which is what makes every instance re-measure — the thing under test —
              at a constant height.
            */}
            <div className="grid grid-cols-6 gap-2" data-testid="observed-group" style={{ width }}>
              {Array.from({ length: count }, (_, index) => (
                <ContinuousCorner
                  key={index}
                  radius={18}
                  border={HAIRLINE}
                  className="h-16"
                  surfaceClassName={SURFACE}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2" style={{ width: STRESS_MAX_WIDTH }}>
            <Caption>fixed — size declared, no observer, path never rebuilt</Caption>
            {/*
              Deliberately not animated. `size` is a promise about the box, so the
              box has to actually stay 64px — stretching these would make the
              declared size a lie, which is the failure mode that prop has. This is
              the control: same instance count, same painting, no observer.
            */}
            <div className="grid w-max grid-cols-6 gap-2" data-testid="fixed-group">
              {Array.from({ length: count }, (_, index) => (
                <ContinuousCorner
                  key={index}
                  radius={18}
                  size={{ width: 64, height: 64 }}
                  border={HAIRLINE}
                  className="size-16"
                  surfaceClassName={SURFACE}
                />
              ))}
            </div>
          </div>
        </div>
      );
    };

    return <Stress />;
  },
};
