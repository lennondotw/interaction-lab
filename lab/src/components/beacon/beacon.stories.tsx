import { cn } from '@monorepo/utils';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useRef, useState, type FC, type ReactNode } from 'react';

import { BeaconFollower, type BeaconEmptyBehavior } from './follower.js';
import type { BeaconOrigin } from './origin.js';
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

// Fixed box: the copy changes length between states, and the stories
// live in a vertically-centred column — letting the note reflow would
// re-centre the column and move the very target the beacon is tracking.
const NOTE_CLASS = `
  h-24 w-[420px] text-center font-mono text-[11px] leading-[1.7] text-black/45
  dark:text-white/45
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
  /** Reference point the beacon measures itself from. See `origin.ts`. */
  origin?: BeaconOrigin;
  className?: string;
}

const Target: FC<TargetProps> = ({ label, width, height, priority = 'normal', enabled = true, origin, className }) => {
  const ref = useRef<HTMLDivElement>(null);
  useBeaconAnchor(ref, { priority, enabled, origin, inset: 6 });
  return (
    <div ref={ref} className={cn(TARGET_CLASS, className)} style={{ width, height }}>
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

// ---------------------------------------------------------------------------
// A stage the origin stories can resize on demand, standing in for a
// window resize without needing one. Its own provider, so the two stages
// in a story are independent and can disagree about the origin.
//
// `containerRef` puts measurements and the follower in the stage's
// coordinate space; `renderFollower={false}` plus an explicit
// `<BeaconFollower/>` inside is how the follower ends up in the DOM
// subtree its `position: absolute` resolves against.
// ---------------------------------------------------------------------------

const STAGE_CLASS = `
  relative h-44 shrink-0 overflow-hidden rounded-[6px] border border-dashed border-black/15
  dark:border-white/20
`;

const STAGE_LABEL_CLASS = `
  absolute top-2 left-3 font-mono text-[11px] text-black/35
  dark:text-white/35
`;

const RANGE_CLASS = 'w-[420px] cursor-ew-resize accent-black/50 dark:accent-white/60';

interface StageProps {
  label: string;
  width: number;
  origin?: BeaconOrigin;
  children: ReactNode;
}

const Stage: FC<StageProps> = ({ label, width, origin, children }) => {
  const stageRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={stageRef} className={STAGE_CLASS} style={{ width }}>
      <BeaconProvider containerRef={stageRef} renderFollower={false} origin={origin}>
        <span className={STAGE_LABEL_CLASS}>{label}</span>
        {children}
        <BeaconFollower className={FOLLOWER_CLASS} />
      </BeaconProvider>
    </div>
  );
};

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
        <div className="flex items-center gap-6" style={{ width: 448 }}>
          <Target label="#1 · fixed" width={300} height={140} />
          {second && <Target label="#2 · pushed" width={124} height={44} />}
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
//
// Resizing while popped is the interesting case: an inactive anchor
// stops measuring, so nothing tracks the target's new box. Under 'hide'
// that costs nothing — the follower is unmounted, and the next push
// measures fresh and fades in on the target wherever it now sits.
export const LoseLastBeaconHide: Story = {
  name: 'Lose Last · hide',
  render: function Render() {
    const [enabled, setEnabled] = useState(true);
    return (
      <Frame onEmpty="hide">
        <button className={BUTTON_CLASS} onClick={() => setEnabled((v) => !v)} type="button">
          {enabled ? 'pop · only beacon' : 'push · only beacon'}
        </button>
        <Target
          label={enabled ? 'only beacon · active' : 'only beacon · inactive'}
          width={280}
          height={120}
          enabled={enabled}
        />
        <p className={NOTE_CLASS}>
          {enabled
            ? 'active — the outline tracks the target. Resize the window: the target re-centres and the outline follows it.'
            : 'inactive — the stack is empty, so the follower unmounted and no measurement is running. Resize the window, then push again: the outline fades in on the target’s new box, never flying in from the old one.'}
        </p>
      </Frame>
    );
  },
};

// Both stages hold the same centred target and differ only in where the
// beacon measures itself from. Drag the slider to resize them together.
//
// Left, measuring from the stage's top-left corner: a centred element's
// distance from the left edge is half the stage's width, so resizing
// hands the spring a moving target and the outline trails the target for
// as long as the drag lasts. Nothing about the target moved — the frame
// did.
//
// Right, measuring from the stage's centre: the same resize moves the
// element and the frame by the same amount, both read in one
// measurement, and they cancel. The beacon's position is a constant 0 at
// every width, so there is no target to chase and no lag to tune away.
// The follower keeps up because it isn't animating: `left: 50%` is
// re-resolved by layout in the frame the stage grows in.
export const OriginResize: Story = {
  name: 'Origin · resize',
  render: function Render() {
    const [width, setWidth] = useState(400);
    return (
      <div className="flex flex-col items-center gap-6">
        <input
          className={RANGE_CLASS}
          max={480}
          min={220}
          onChange={(e) => setWidth(e.target.valueAsNumber)}
          type="range"
          value={width}
        />
        <div className="flex items-start gap-6">
          <Stage label="origin · start" width={width}>
            <div className="flex h-full items-center justify-center">
              <Target height={72} label="lags" width={140} />
            </div>
          </Stage>
          <Stage label="origin · center" origin={{ x: 'center' }} width={width}>
            <div className="flex h-full items-center justify-center">
              <Target height={72} label="doesn’t" width={140} />
            </div>
          </Stage>
        </div>
        <p className={NOTE_CLASS}>
          Drag slowly, then quickly. The left outline’s lag scales with drag speed — that’s a spring doing its job on a
          target that shouldn’t have moved. Only the x axis is re-origined here; the stage’s height is fixed, so y has
          nothing to gain from it.
        </p>
      </div>
    );
  },
};

// Two beacons in one stage, each with the origin that makes its own
// position constant: #1 is pinned to the stage's top-left, #2 is centred.
// Toggling #2 hands the follower across a change of coordinate frame —
// the springs hold a value measured from the corner and have to keep
// meaning the same place once the surface is positioned from the centre.
// The conversion happens before the swap paints, so the handoff is an
// ordinary glide with no jump at its start.
//
// Resize at either end: both are lag-free, because each beacon picked
// the frame its own layout is constant in. That is the whole rule — the
// origin is a property of how the element is laid out, which is why it
// belongs to the beacon and not to the provider.
export const OriginHandoff: Story = {
  name: 'Origin · handoff',
  render: function Render() {
    const [width, setWidth] = useState(400);
    const [centred, setCentred] = useState(false);
    return (
      <div className="flex flex-col items-center gap-6">
        <div className="flex items-center gap-4">
          <input
            className={RANGE_CLASS}
            max={480}
            min={220}
            onChange={(e) => setWidth(e.target.valueAsNumber)}
            type="range"
            value={width}
          />
          <button className={BUTTON_CLASS} onClick={() => setCentred((v) => !v)} type="button">
            {centred ? 'pop · #2' : 'push · #2'}
          </button>
        </div>
        <Stage label="mixed origins" width={width}>
          <Target className="absolute top-8 left-4" height={44} label="#1 · start" width={124} />
          {/*
            Box-model centring, per `useBeaconAnchor`'s contract: `inset-x-0`
            + `mx-auto` + a width distributes the slack between two auto
            margins, so `offsetLeft` reports the centred position. A
            `-translate-x-1/2` would centre it visually and leave the
            measurement half a box to the right.
          */}
          <Target
            className="absolute inset-x-0 bottom-6 mx-auto"
            enabled={centred}
            height={48}
            label="#2 · center"
            origin={{ x: 'center' }}
            width={168}
          />
        </Stage>
        <p className={NOTE_CLASS}>
          {centred
            ? 'The follower sits on #2 and is positioned from the stage’s centre. Resize: no lag. Pop #2 and it converts back to corner coordinates mid-glide.'
            : 'The follower sits on #1 and is positioned from the stage’s corner — the frame that makes a corner-pinned element constant. Resize: no lag either. Push #2 to cross frames.'}
        </p>
      </div>
    );
  },
};

// Same toggle, but the follower is told to stay in place when the stack
// empties. The dashed outline remains at the last position and size;
// re-pushing the beacon snaps-then-springs back from the frozen state
// (no fly-in, no remount flash). Useful when the anchored element is
// about to unmount but you want the visual anchor to linger — e.g.
// tutorial steps that remove the highlighted control.
//
// The trade-off shows up on resize: freezing keeps a *stale* box, and an
// inactive anchor no longer measures, so a window resize re-centres the
// target while the frozen outline stays where it was. That's inherent to
// freezing geometry the layout is still free to move — the next push
// remeasures and springs the outline back onto the target.
export const LoseLastBeaconFreeze: Story = {
  name: 'Lose Last · freeze',
  render: function Render() {
    const [enabled, setEnabled] = useState(true);
    return (
      <Frame onEmpty="freeze">
        <button className={BUTTON_CLASS} onClick={() => setEnabled((v) => !v)} type="button">
          {enabled ? 'pop · only beacon' : 'push · only beacon'}
        </button>
        <Target
          label={enabled ? 'only beacon · active' : 'only beacon · inactive'}
          width={280}
          height={120}
          enabled={enabled}
        />
        <p className={NOTE_CLASS}>
          {enabled
            ? 'active — the outline tracks the target. Resize the window: the target re-centres and the outline follows it.'
            : 'inactive — the outline is frozen on the last measured box, and no measurement is running. Resize the window: the target re-centres but the frozen outline stays behind. Push again and it springs back onto the target.'}
        </p>
      </Frame>
    );
  },
};
