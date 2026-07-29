import type { Meta, StoryObj } from '@storybook/react-vite';
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type FC, type ReactNode } from 'react';
import { fn } from 'storybook/test';
import { BubblePicker, type BubblePickerDebugOptions, type BubblePickerItem } from './bubble-picker.js';
import { BUBBLE_COUNT } from './constants.js';
import { buildBubbleItems, buildBubbleLabels } from './demo-items.js';
import { layoutSettle, type SettlePhase, type SettleRecorder } from './physics/layout-settle.js';
import { drawSettleReplayFrame } from './render/debug-overlay.js';
import { BUBBLE_PALETTES } from './render/palette.js';
import { useColorScheme } from './use-color-scheme.js';

// The bubbles are glass — they need colour under them to refract, not a
// flat panel. Light is a broad pastel sweep; dark is midnight, so the
// stops sit close together and stay near-black, letting a faint blue →
// violet shift read without a visible band.
const Stage: FC<{ children: ReactNode }> = ({ children }) => (
  <div
    className={`
      flex min-h-screen w-full items-center justify-center
      bg-[linear-gradient(180deg,#d4e3ff_0%,#e7d6ff_55%,#f3deca_100%)] p-2
      dark:bg-[linear-gradient(180deg,#06091a_0%,#12102b_55%,#090a1c_100%)]
    `}
  >
    <div className="relative h-150 w-5xl">{children}</div>
  </div>
);

// ── Controls-friendly wrapper ─────────────────────────────────────────
//
// Storybook's Controls panel is good at primitives (boolean / number /
// string / enum) and bad at deeply nested objects. Rather than expose
// `BubblePickerDebugOptions` as a single JSON-blob control, we flatten
// each subflag into its own primitive arg here; the wrapper composes
// them back into a `BubblePickerDebugOptions` before handing it to the
// real picker.
//
// `onToggle` is forwarded so Storybook's Action panel logs every tap.
// We still keep the actual selection state internal so the picker
// stays interactive across rapid clicks without bouncing through
// useState in the story.

interface ControlledPickerArgs {
  items: readonly BubblePickerItem[];
  initialSelectedIds: readonly string[];
  maxSelected: number;
  paused: boolean;
  onToggle: (id: string) => void;
  debugSettleSnapshot: boolean;
  debugCollisionRims: boolean;
  debugAnchors: boolean;
  debugTimeScale: number;
}

const ControlledPicker: FC<ControlledPickerArgs> = ({
  items,
  initialSelectedIds,
  maxSelected,
  paused,
  onToggle,
  debugSettleSnapshot,
  debugCollisionRims,
  debugAnchors,
  debugTimeScale,
}) => {
  // Re-key the selection state when the initial set changes so toggling
  // story args (e.g. switching from `WithSelections` to `Default`)
  // resets the controlled state cleanly. Joining is fine — the initial
  // sets are small. This is React's adjust-state-during-render recipe:
  // the extra render happens before the browser paints, so no flash.
  const initialKey = useMemo(() => initialSelectedIds.join(','), [initialSelectedIds]);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => [...initialSelectedIds]);
  const [lastInitialKey, setLastInitialKey] = useState(initialKey);
  if (lastInitialKey !== initialKey) {
    setLastInitialKey(initialKey);
    setSelectedIds([...initialSelectedIds]);
  }

  const handleToggle = useCallback(
    (id: string) => {
      onToggle(id);
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    },
    [onToggle]
  );

  const debug = useMemo<BubblePickerDebugOptions | undefined>(() => {
    const opts: BubblePickerDebugOptions = {};
    if (debugSettleSnapshot) opts.settleSnapshot = true;
    if (debugCollisionRims) opts.collisionRims = true;
    if (debugAnchors) opts.anchors = true;
    if (debugTimeScale !== 1) opts.timeScale = debugTimeScale;
    return Object.keys(opts).length > 0 ? opts : undefined;
  }, [debugSettleSnapshot, debugCollisionRims, debugAnchors, debugTimeScale]);

  return (
    <BubblePicker
      items={items}
      selectedIds={selectedIds}
      onToggle={handleToggle}
      maxSelected={maxSelected}
      paused={paused}
      debug={debug}
    />
  );
};

const defaultItems = buildBubbleItems(BUBBLE_COUNT);
const fewItems = buildBubbleItems(5);
const manyItems = buildBubbleItems(30);
const firstThreeIds = defaultItems.slice(0, 3).map((c) => c.id);

const meta = {
  title: 'Animations/BubblePicker',
  component: ControlledPicker,
  parameters: { layout: 'fullscreen' },
  args: {
    items: defaultItems,
    initialSelectedIds: [],
    maxSelected: 3,
    paused: false,
    onToggle: fn(),
    debugSettleSnapshot: false,
    debugCollisionRims: false,
    debugAnchors: false,
    debugTimeScale: 1,
  },
  argTypes: {
    // Hide complex props from the Controls panel — they're intentionally
    // story-defined, not interactively tweaked at runtime.
    items: { control: false },
    initialSelectedIds: { control: false },
    maxSelected: {
      control: { type: 'range', min: 1, max: 6, step: 1 },
      description: 'Hard cap on simultaneous selections.',
    },
    paused: {
      control: 'boolean',
      description:
        'Freeze procedural motion (breathing, drift, specular sweep). Selection scale ease still animates so taps stay legible.',
    },
    onToggle: {
      action: 'toggle',
      description: 'Fires whenever a bubble is tapped, before the selection set updates.',
    },
    debugSettleSnapshot: {
      control: 'boolean',
      description:
        'Render plain circles at `b.pos` with no harmonic deformation, drift, or glass shell. Verifies the layout algorithm output.',
      table: { category: 'Debug' },
    },
    debugCollisionRims: {
      control: 'boolean',
      description:
        'Overlay each bubble`s physics rim (solid) and personal claim radius (dashed). Two dashed rings touching = pair sits at minDist.',
      table: { category: 'Debug' },
    },
    debugAnchors: {
      control: 'boolean',
      description:
        '`restPos` crosshairs + displacement lines + drift envelopes. Combine with `debugCollisionRims` to see neighbours displaced by selection.',
      table: { category: 'Debug' },
    },
    debugTimeScale: {
      control: { type: 'range', min: 0.05, max: 2, step: 0.05 },
      description: 'Scale physics + procedural clock uniformly. 1 = real-time. 0.15 = slow-motion.',
      table: { category: 'Debug' },
    },
  },
  decorators: [
    (Story) => (
      <Stage>
        <Story />
      </Stage>
    ),
  ],
} satisfies Meta<typeof ControlledPicker>;

export default meta;

type Story = StoryObj<typeof meta>;

// ── Production stories ────────────────────────────────────────────────

export const Default: Story = {};

export const WithSelections: Story = {
  args: { initialSelectedIds: firstThreeIds },
};

export const Interactive: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Pick up to 3 bubbles by tapping. Tap again to deselect. Past the cap, taps log via `onToggle` but selection does not change. Use the Controls panel to live-tweak `maxSelected` / `paused`.',
      },
    },
  },
};

export const Paused: Story = {
  args: { paused: true },
  parameters: {
    docs: {
      description: {
        story:
          'Procedural motion (breathing, drift, specular sweep) frozen. Selection scale ease still animates so taps remain legible.',
      },
    },
  },
};

export const ReducedMotion: Story = {
  args: { paused: true },
  parameters: {
    docs: {
      description: {
        story:
          'Mirrors what users with `prefers-reduced-motion: reduce` will see. The `paused` prop is the explicit knob for the same behaviour.',
      },
    },
  },
};

export const FewBubbles: Story = {
  args: { items: fewItems, maxSelected: 2 },
  parameters: {
    docs: {
      description: {
        story: 'Stress test for the settle math with a small N. No division-by-zero in centroid math.',
      },
    },
  },
};

export const ManyBubbles: Story = {
  args: { items: manyItems, maxSelected: 3 },
  parameters: {
    docs: {
      description: {
        story:
          'Stress test for collision + PBD with a 1.5× cluster. Cluster fills the viewport without overlap; first-frame settle is heavier (~30ms on a 2020 Air) but only runs once.',
      },
    },
  },
};

// ── Debug stories ─────────────────────────────────────────────────────

export const DebugSettleSnapshot: Story = {
  args: { debugSettleSnapshot: true },
  parameters: {
    docs: {
      description: {
        story:
          'Plain circles at each bubble`s `pos` with the eased selection scale, no harmonic deformation, no drift, no glass shell. Verifies the settle algorithm`s output independently of any animation. Toggling a bubble still pops because scale ease is part of physics, not procedural rendering.',
      },
    },
  },
};

export const DebugCollisionRims: Story = {
  args: { debugCollisionRims: true },
  parameters: {
    docs: {
      description: {
        story:
          'Solid purple = each bubble`s hard physics rim (`radius * scale`). Dashed magenta = the bubble`s half-share of pairwise minDist (adds `MIN_GAP / 2 + slack`). When two dashed circles meet tangent, the pair sits at exactly minDist; when they overlap, PBD relaxation is firing.',
      },
    },
  },
};

export const DebugAnchors: Story = {
  args: { debugAnchors: true, debugCollisionRims: true },
  parameters: {
    docs: {
      description: {
        story:
          'Dark crosshairs = `restPos` anchors (never move). Yellow lines = current physics displacement from rest. Teal dashed circles = drift envelope (where draw-time drift can carry the visual centre). Combined with collision rims to show how a selected pop pushes neighbours away from their anchors.',
      },
    },
  },
};

export const DebugSlowMotion: Story = {
  args: { debugTimeScale: 0.15, debugAnchors: true },
  parameters: {
    docs: {
      description: {
        story:
          'Physics + procedural clock running at 15% speed. Toggle a bubble and watch the spring-back, pairwise repulsion, and PBD relaxation play out frame by frame. Anchors overlay shows how far each neighbour gets pushed before it springs home.',
      },
    },
  },
};

// ── Settle replay ─────────────────────────────────────────────────────
//
// Records every iteration of `layoutSettle` once on mount, then plays back
// snapshots driven by a slider. Three phases are colour-coded:
//
//   red    — initial scatter (1 frame)
//   blue   — main settle: gravity + repulsion + wall + damping (500 frames)
//   purple — PBD relaxation: hard non-overlap + vertical clamp (20 frames)
//
// The post-PBD horizontal recentering is a pure coordinate translation,
// not a physics step, so it's not in the playback — the last `pbd` frame
// is the last meaningful state.

interface ReplayData {
  phases: SettlePhase[];
  positions: { x: number; y: number }[][];
  radii: number[];
  labels: string[];
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
}

function recordSettle(viewportHeight: number): ReplayData {
  const ids = Array.from({ length: BUBBLE_COUNT }, (_, i) => `replay-${i}`);
  const labels = buildBubbleLabels(BUBBLE_COUNT);

  const phases: SettlePhase[] = [];
  const positions: { x: number; y: number }[][] = [];
  let radii: number[] = [];

  const recorder: SettleRecorder = {
    init: ({ radii: r }) => {
      radii = [...r];
    },
    snapshot: (phase, pos) => {
      phases.push(phase);
      positions.push(pos.map((p) => ({ x: p.x, y: p.y })));
    },
  };

  layoutSettle({ ids, labels, viewportHeight }, recorder);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const frameSnap of positions) {
    for (const [i, p] of frameSnap.entries()) {
      const r = radii[i] ?? 0;
      if (p.x - r < minX) minX = p.x - r;
      if (p.x + r > maxX) maxX = p.x + r;
      if (p.y - r < minY) minY = p.y - r;
      if (p.y + r > maxY) maxY = p.y + r;
    }
  }

  return { phases, positions, radii, labels, bbox: { minX, maxX, minY, maxY } };
}

function phaseLabel(phases: SettlePhase[], frameIndex: number): string {
  const counts = { init: 0, main: 0, pbd: 0 };
  for (const p of phases) counts[p.kind]++;
  const phase = phases[frameIndex];
  if (!phase) return '';
  if (phase.kind === 'init') return 'init (random scatter)';
  return `${phase.kind} ${phase.iter + 1} / ${counts[phase.kind]}`;
}

const SettleReplayCanvas: FC<{ viewportHeight: number; canvasWidth: number }> = ({ viewportHeight, canvasWidth }) => {
  const data = useMemo(() => recordSettle(viewportHeight), [viewportHeight]);
  const [frame, setFrame] = useState(() => data.positions.length - 1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dprRef = useRef(window.devicePixelRatio || 1);
  const palette = BUBBLE_PALETTES[useColorScheme()];

  // Clamp during render rather than via a `useEffect(() => setFrame(...))`
  // pass. If `viewportHeight` changes and the new recording has fewer
  // frames than the current `frame` index, this keeps reads consistent
  // for the current render without an extra commit cycle.
  const totalFrames = data.positions.length;
  const safeFrame = Math.min(frame, totalFrames - 1);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = dprRef.current;
    canvas.width = Math.round(canvasWidth * dpr);
    canvas.height = Math.round(viewportHeight * dpr);
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${viewportHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvasWidth, viewportHeight);

    const margin = 24;
    const bboxW = data.bbox.maxX - data.bbox.minX;
    const bboxH = data.bbox.maxY - data.bbox.minY;
    const scale = Math.min(
      (canvasWidth - margin * 2) / Math.max(1, bboxW),
      (viewportHeight - margin * 2) / Math.max(1, bboxH)
    );
    const offsetX = margin - data.bbox.minX * scale + (canvasWidth - margin * 2 - bboxW * scale) / 2;
    const offsetY = margin - data.bbox.minY * scale + (viewportHeight - margin * 2 - bboxH * scale) / 2;

    const positions = data.positions[safeFrame];
    const phase = data.phases[safeFrame];
    if (!positions || !phase) return;

    drawSettleReplayFrame(ctx, {
      positions,
      radii: data.radii,
      labels: data.labels,
      phase,
      palette,
      transform: { scale, offsetX, offsetY },
    });
  }, [data, safeFrame, canvasWidth, viewportHeight, palette]);

  const label = phaseLabel(data.phases, safeFrame);

  return (
    <div className="flex size-full flex-col gap-3">
      <div className="flex-1">
        <canvas
          ref={canvasRef}
          className={`
            rounded-md border border-zinc-300/40 bg-white/30
            dark:border-zinc-600/40 dark:bg-white/5
          `}
        />
      </div>
      <div className="flex flex-col gap-1.5 px-2">
        <input
          type="range"
          min={0}
          max={totalFrames - 1}
          value={safeFrame}
          onChange={(e) => setFrame(Number(e.target.value))}
          className="w-full"
        />
        <div
          className={`
            flex items-center justify-between font-mono text-xs text-zinc-700 tabular-nums
            dark:text-zinc-300
          `}
        >
          <span>
            frame {safeFrame + 1} / {totalFrames}
          </span>
          <span>{label}</span>
        </div>
      </div>
    </div>
  );
};

export const DebugSettleReplay: Story = {
  // SettleReplay drives its own canvas; the picker controls don't apply,
  // so disable the panel for this one story to keep the UI honest.
  parameters: {
    controls: { disable: true },
    actions: { disable: true },
    docs: {
      description: {
        story:
          'Records every iteration of `layoutSettle` and lets you scrub through with the slider. Frame 1 = red (initial random scatter). Next ~500 frames = blue (gravity + repulsion + wall + damping). Final 20 = purple (PBD relaxation). Coordinates are auto-fit so the scatter and the settled cluster both stay on screen.',
      },
    },
  },
  render: () => <SettleReplayCanvas viewportHeight={520} canvasWidth={1024} />,
};
