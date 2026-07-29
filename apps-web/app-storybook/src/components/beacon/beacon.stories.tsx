import type { Meta, StoryObj } from '@storybook/react-vite';
import { useRef, useState, type FC, type ReactNode } from 'react';
import type { BeaconEmptyBehavior } from './follower.js';
import { BeaconProvider } from './provider.js';
import type { BeaconPriority } from './types.js';
import { useBeaconAnchor } from './use-beacon.js';

// ---------------------------------------------------------------------------
// The beacon stories demonstrate the one thing that matters about the
// system: push a beacon somewhere in the tree, and a single shared
// surface animates to follow it. Wire-frame only — no gradients, tints,
// or chrome. Application-level styling (glass, shadows, …) is a
// consumer concern and belongs at the real integration site, not here.
// ---------------------------------------------------------------------------

const FOLLOWER_CLASS = `
  rounded-md outline-2 outline-dashed outline-black/70
  dark:outline-white/80
`;

const TARGET_CLASS = `
  flex items-center justify-center rounded-[4px] border border-dashed border-black/25 px-4 py-3 font-mono text-[13px]
  text-black/60
  dark:border-white/25 dark:text-white/60
`;

const BUTTON_CLASS = `
  cursor-pointer rounded-[4px] border border-black/20 bg-white/0 px-3 py-1.5 font-mono text-[12px] text-black/70
  hover:bg-black/5
  active:bg-black/10
  dark:border-white/30 dark:text-white/80 dark:hover:bg-white/5 dark:active:bg-white/10
`;

// ---------------------------------------------------------------------------
// Reusable target — emits a beacon that wraps its own DOM bounds.
// ---------------------------------------------------------------------------

interface TargetProps {
  label: string;
  width: number;
  height: number;
  priority?: BeaconPriority;
  enabled?: boolean;
}

const Target: FC<TargetProps> = ({ label, width, height, priority = 'normal', enabled = true }) => {
  const ref = useRef<HTMLDivElement>(null);
  useBeaconAnchor(ref, { priority, enabled, inset: 6 });
  return (
    <div ref={ref} className={TARGET_CLASS} style={{ width, height }}>
      {label}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Meta — centred layout, minimal provider decorator that styles the
// follower as a dashed outline so you can see it tracking the active
// beacon.
// ---------------------------------------------------------------------------

interface FrameProps {
  children: ReactNode;
  onEmpty?: BeaconEmptyBehavior;
}

const Frame: FC<FrameProps> = ({ children, onEmpty }) => (
  <BeaconProvider followerProps={{ className: FOLLOWER_CLASS, onEmpty }}>
    <div className="flex flex-col items-center gap-6">{children}</div>
  </BeaconProvider>
);

const meta: Meta = {
  title: 'Components/Beacon',
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj;

// One target, one follower wrapping it. The simplest proof that the
// system wires up end-to-end: `useBeaconAnchor` pushes size + position
// into the store; the top-level `BeaconFollower` reads it and animates a
// fixed-position outline to match.
export const Single: Story = {
  render: () => (
    <Frame>
      <Target label="beacon · active" width={240} height={96} />
    </Frame>
  ),
};

// Toggle the second, smaller target on and off. Within the same
// priority band LIFO wins — pushing #2 lifts the follower from #1 to #2;
// popping #2 drops it back to #1. `useSpring` preserves velocity across
// the handoff so the surface glides rather than teleports.
//
// The row width is pinned to the maximum it can reach (big #1 + gap +
// small #2) so the surrounding centred layout doesn't re-centre when #2
// appears. #1 being the larger of the two keeps the visual weight
// anchored on the left regardless of toggle state, so there's no layout
// shift on the fixed target.
export const PushPop: Story = {
  render: function Render() {
    const [second, setSecond] = useState(false);
    return (
      <Frame>
        <button className={BUTTON_CLASS} onClick={() => setSecond((v) => !v)} type="button">
          {second ? 'pop · #2' : 'push · #2'}
        </button>
        <div className="flex items-center gap-6" style={{ width: 416 }}>
          <Target label="#1 · fixed" width={300} height={140} />
          {second && <Target label="#2 · pushed" width={92} height={44} />}
        </div>
      </Frame>
    );
  },
};

// Priority wins regardless of mount order. The `critical` target
// overrides the two lower-priority siblings when enabled; dismissing it
// hands the surface back to the most-recently-pushed normal / high.
export const Priority: Story = {
  render: function Render() {
    const [critical, setCritical] = useState(false);
    return (
      <Frame>
        <button className={BUTTON_CLASS} onClick={() => setCritical((v) => !v)} type="button">
          {critical ? 'dismiss · critical' : 'raise · critical'}
        </button>
        <div className="flex flex-wrap items-start gap-6">
          <Target label="normal" width={160} height={80} priority="normal" />
          <Target label="high" width={160} height={80} priority="high" />
          <Target label="critical" width={200} height={100} priority="critical" enabled={critical} />
        </div>
      </Frame>
    );
  },
};

// The only beacon gets toggled off. With `onEmpty='hide'` (default) the
// follower fades out and unmounts; a subsequent push brings it back in
// place at the target with no fly-in from origin.
//
// First-paint: even though the target is rendered immediately, the
// follower only mounts after the first anchor measurement lands. On
// initial load you should NOT see the outline appear at (0, 0) and fly
// to the target — it should just fade in over the target.
export const LoseLastBeaconHide: Story = {
  name: 'Lose Last · hide',
  render: function Render() {
    const [enabled, setEnabled] = useState(true);
    return (
      <Frame onEmpty="hide">
        <button className={BUTTON_CLASS} onClick={() => setEnabled((v) => !v)} type="button">
          {enabled ? 'pop · only beacon' : 'push · only beacon'}
        </button>
        <Target label="only beacon" width={280} height={120} enabled={enabled} />
      </Frame>
    );
  },
};

// Same toggle, but the follower is told to stay in place when the stack
// empties. The dashed outline remains at the last position and size;
// re-pushing the beacon snaps-then-springs back from the frozen state
// (no fly-in, no remount flash). Useful when the anchored element is
// about to unmount but you want the visual anchor to linger — e.g.
// tutorial steps that remove the highlighted control.
export const LoseLastBeaconFreeze: Story = {
  name: 'Lose Last · freeze',
  render: function Render() {
    const [enabled, setEnabled] = useState(true);
    return (
      <Frame onEmpty="freeze">
        <button className={BUTTON_CLASS} onClick={() => setEnabled((v) => !v)} type="button">
          {enabled ? 'pop · only beacon' : 'push · only beacon'}
        </button>
        <Target label="only beacon" width={280} height={120} enabled={enabled} />
      </Frame>
    );
  },
};
