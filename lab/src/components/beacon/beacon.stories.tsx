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
// Every control here is a two-state toggle whose label changes length, so
// every one of them is a width change waiting to re-centre the column the
// target sits in — the same shift the fixed-size note above exists to
// avoid. The beacon would follow that shift faithfully and read as lag in
// the thing being demonstrated.
//
// Both labels are therefore always in the DOM: the inactive one in a
// zero-height `visibility: hidden` stack that still contributes its
// intrinsic width, so the button sizes to the wider of the two and stops
// resizing on toggle. `visibility: hidden` rather than `display: none`
// because only the former keeps the box in flow to be measured; `h-0` +
// `leading-0` keep it from contributing height, `overflow-clip` from
// being scrolled into. Taking both labels as props rather than a
// hand-written list of variants is what keeps the hidden set from
// drifting away from what the button actually renders.
// ---------------------------------------------------------------------------

const HIDDEN_LABELS_CLASS = 'invisible flex h-0 flex-col overflow-clip leading-0';

interface ToggleButtonProps {
  on: boolean;
  /** Label while `on`. */
  onLabel: string;
  /** Label while not `on`. */
  offLabel: string;
  onToggle: () => void;
}

const ToggleButton: FC<ToggleButtonProps> = ({ on, onLabel, offLabel, onToggle }) => (
  <button className={BUTTON_CLASS} onClick={onToggle} type="button">
    {on ? onLabel : offLabel}
    <span className={HIDDEN_LABELS_CLASS}>
      <span>{onLabel}</span>
      <span>{offLabel}</span>
    </span>
  </button>
);

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
  /**
   * Overrides {@link STORY_ORIGIN}. Only for the stories whose point is
   * what a frame that doesn't describe this layout costs.
   */
  origin?: BeaconOrigin;
}

// Storybook's `layout: 'centered'` centres the story in the viewport on
// both axes, and the column below centres its own children — so every
// target in these stories is at a fixed offset from the viewport's
// centre and at a viewport-dependent offset from its corner. The centre
// is therefore the frame that describes this layout: resize the window
// and the beacons don't move at all, rather than moving by half the
// delta and being chased there.
//
// It applies to a column of stacked children too, not just a single
// centred one: the column's own size is fixed (the notes and rows below
// are pinned for exactly that reason), so each child's offset from the
// centre is a constant even when it isn't at the centre.
const STORY_ORIGIN: BeaconOrigin = { x: 'center', y: 'center' };

const Frame: FC<FrameProps> = ({ children, onEmpty, origin = STORY_ORIGIN }) => (
  <BeaconProvider followerProps={{ className: FOLLOWER_CLASS, onEmpty }} origin={origin}>
    <div className="flex flex-col items-center gap-6">{children}</div>
  </BeaconProvider>
);

// ---------------------------------------------------------------------------
// A stage the origin stories can resize on demand, standing in for a
// window resize without needing one. Its own provider, so the stages in a
// story are independent and can disagree about the origin.
//
// `containerRef` puts measurements and the follower in the stage's
// coordinate space; `renderFollower={false}` plus an explicit
// `<BeaconFollower/>` inside is how the follower ends up in the DOM
// subtree its `position: absolute` resolves against.
//
// A consequence worth knowing before reaching for the window: resizing it
// does nothing to these stories. The frame is the stage, and the stage's
// size comes from the slider, not the viewport — a window resize slides
// the whole stage across the page without changing its `clientWidth` or
// the target's `offsetLeft` inside it, so the beacon's position doesn't
// change and there is nothing for a spring to chase. Drag the slider to
// resize the frame itself. (Nothing extra is wrapped around the stage to
// achieve that; the caption wrapper below is not a containing block.) The
// stories that do respond to the window are the ones with no container at
// all, which measure against the viewport.
//
// No `overflow-hidden`: a follower that lags does so *past* the stage's
// edge, and clipping the evidence at the boundary would hide the biggest
// part of the effect these stories exist to show.
// ---------------------------------------------------------------------------

const STAGE_CLASS = `
  relative rounded-[6px] border border-dashed border-black/15
  dark:border-white/20
`;

const STAGE_LABEL_CLASS = `
  absolute top-2 left-3 font-mono text-[11px] text-black/35
  dark:text-white/35
`;

// Fixed height so a caption that rewraps as the stage narrows can't
// change the row's height and slide the stages around mid-drag. Sized for
// the longest caption at the narrowest stage, which is where they wrap
// hardest — keep captions short enough to fit and leave the prose to the
// story's own note.
const CAPTION_CLASS = 'h-16 font-mono text-[11px] leading-[1.5]';
const CAPTION_MATCH_CLASS = 'text-black/40 dark:text-white/40';
const CAPTION_MISMATCH_CLASS = 'text-black/75 dark:text-white/85';

const RANGE_CLASS = 'w-[420px] cursor-ew-resize accent-black/50 dark:accent-white/60';

interface StageProps {
  /** Inside the stage: the layout it uses and the origin it claims. */
  label: string;
  /** Under the stage: what to expect from that pairing while dragging. */
  caption: string;
  /** Whether the claimed origin actually describes the layout. Drives caption emphasis. */
  match: boolean;
  width: number;
  height?: number;
  origin?: BeaconOrigin;
  children: ReactNode;
}

const Stage: FC<StageProps> = ({ label, caption, match, width, height = 176, origin, children }) => {
  const stageRef = useRef<HTMLDivElement>(null);
  return (
    <div className="flex shrink-0 flex-col gap-2" style={{ width }}>
      <div ref={stageRef} className={STAGE_CLASS} style={{ width, height }}>
        <BeaconProvider containerRef={stageRef} renderFollower={false} origin={origin}>
          <span className={STAGE_LABEL_CLASS}>{label}</span>
          {children}
          <BeaconFollower className={FOLLOWER_CLASS} />
        </BeaconProvider>
      </div>
      <p className={cn(CAPTION_CLASS, match ? CAPTION_MATCH_CLASS : CAPTION_MISMATCH_CLASS)}>{caption}</p>
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
        <ToggleButton offLabel="push · #2" on={second} onLabel="pop · #2" onToggle={() => setSecond((v) => !v)} />
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
        <ToggleButton
          offLabel="raise · critical"
          on={critical}
          onLabel="dismiss · critical"
          onToggle={() => setCritical((v) => !v)}
        />
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
        <ToggleButton
          offLabel="push · only beacon"
          on={enabled}
          onLabel="pop · only beacon"
          onToggle={() => setEnabled((v) => !v)}
        />
        <Target
          label={enabled ? 'only beacon · active' : 'only beacon · inactive'}
          width={280}
          height={120}
          enabled={enabled}
        />
        <p className={NOTE_CLASS}>
          {enabled
            ? 'active — the outline tracks the target. Resize the window: the target re-centres and the outline stays glued to it, because this story measures from the viewport’s centre and nothing moved in that frame.'
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
          <Stage
            caption="Centred layout, corner origin. x is half the stage’s width."
            label="origin · start"
            match={false}
            width={width}
          >
            <div className="flex h-full items-center justify-center">
              <Target height={72} label="lags" width={140} />
            </div>
          </Stage>
          <Stage
            caption="Same layout, centre origin. x is 0 at every width."
            label="origin · center"
            match
            origin={{ x: 'center' }}
            width={width}
          >
            <div className="flex h-full items-center justify-center">
              <Target height={72} label="doesn’t" width={140} />
            </div>
          </Stage>
        </div>
        <p className={NOTE_CLASS}>
          Drag slowly, then quickly. The left outline’s lag scales with drag speed — that’s a spring doing its job on a
          target that shouldn’t have moved. Only x changes frame here; the stage’s height is fixed, so y has nothing to
          gain from it.
        </p>
      </div>
    );
  },
};

// ---------------------------------------------------------------------------
// Three layouts, used by the two stories below to pair each one with a
// right and a wrong origin. Each pins its target somewhere the
// container's own size does or doesn't reach: the top-left corner is
// reached by neither axis, the centre by half of each, the far corner by
// all of each.
// ---------------------------------------------------------------------------

type StageLayout = 'corner' | 'centre' | 'far-corner';

const StageContent: FC<{ layout: StageLayout }> = ({ layout }) => {
  if (layout === 'centre') {
    return (
      <div className="flex h-full items-center justify-center">
        <Target height={52} label="centred" width={132} />
      </div>
    );
  }
  const corner = layout === 'corner';
  return (
    <Target
      className={corner ? 'absolute top-9 left-4' : 'absolute right-4 bottom-4'}
      height={52}
      label={corner ? 'top-left' : 'bottom-right'}
      width={132}
    />
  );
};

const SizeControl: FC<{ value: number; onChange: (next: number) => void }> = ({ value, onChange }) => (
  <input
    className={RANGE_CLASS}
    max={300}
    min={180}
    onChange={(e) => onChange(e.target.valueAsNumber)}
    type="range"
    value={value}
  />
);

/** Both axes off one slider, so a drag exercises x and y at once. */
const stageHeight = (width: number): number => Math.round(width * 0.62);

// The rule, stated three times. Each stage claims the origin its own
// layout actually holds still against, and all three are lag-free through
// the same drag — including the corner one, which is what the default
// `'start'` origin is for. There is no "best" origin: the corner stage
// would lag under a centre origin exactly as the centre stage lags under
// a corner one.
export const OriginMatch: Story = {
  name: 'Origin · match',
  render: function Render() {
    const [width, setWidth] = useState(260);
    const height = stageHeight(width);
    return (
      <div className="flex flex-col items-center gap-6">
        <SizeControl onChange={setWidth} value={width} />
        <div className="flex items-start gap-6">
          <Stage
            caption="Corner-pinned, corner origin. Both offsets are constants."
            height={height}
            label="top-left · start"
            match
            width={width}
          >
            <StageContent layout="corner" />
          </Stage>
          <Stage
            caption="Centred both axes, centre origin. Always reports (0, 0)."
            height={height}
            label="centred · center"
            match
            origin={{ x: 'center', y: 'center' }}
            width={width}
          >
            <StageContent layout="centre" />
          </Stage>
          <Stage
            caption="Far-corner pinned, far-corner origin. Its inset is fixed."
            height={height}
            label="bottom-right · end"
            match
            origin={{ x: 'end', y: 'end' }}
            width={width}
          >
            <StageContent layout="far-corner" />
          </Stage>
        </div>
        <p className={NOTE_CLASS}>
          Drag as fast as you like: none of the three outlines separates from its target, because none of the three
          beacons reports a changing position. The origin isn’t a smoothing setting — it decides whether a resize is
          movement at all.
        </p>
      </div>
    );
  },
};

// The same three layouts, all claiming the corner origin. The claim is
// only true for one of them, and the error is proportional to how much of
// the container's size the layout actually consumes: none for the corner,
// half the delta for the centre, all of it for the far corner. The
// outlines don't just lag — they lag by different amounts in the same
// drag, which is the tell that the frame is wrong rather than the spring
// being slow.
//
// Worth keeping as a story because a wrong origin is worse than no
// origin: it reads as configured, the beacon reports numbers that look
// plausible, and nothing warns. The only check is whether the layout
// really holds that fraction still.
export const OriginMismatch: Story = {
  name: 'Origin · mismatch',
  render: function Render() {
    const [width, setWidth] = useState(260);
    const height = stageHeight(width);
    const corner: BeaconOrigin = { x: 'start', y: 'start' };
    return (
      <div className="flex flex-col items-center gap-6">
        <SizeControl onChange={setWidth} value={width} />
        <div className="flex items-start gap-6">
          <Stage
            caption="Correct. Nothing to chase."
            height={height}
            label="top-left · start"
            match
            origin={corner}
            width={width}
          >
            <StageContent layout="corner" />
          </Stage>
          <Stage
            caption="Wrong by half: centring spends half of each axis."
            height={height}
            label="centred · start"
            match={false}
            origin={corner}
            width={width}
          >
            <StageContent layout="centre" />
          </Stage>
          <Stage
            caption="Wrong by all of it: the far corner spends the whole axis."
            height={height}
            label="bottom-right · start"
            match={false}
            origin={corner}
            width={width}
          >
            <StageContent layout="far-corner" />
          </Stage>
        </div>
        <p className={NOTE_CLASS}>
          Both axes move here, so the two wrong stages lag diagonally. Fixing this is not a spring change: give each
          beacon the origin its layout holds still against and all three behave like the left one.
        </p>
      </div>
    );
  },
};

// The handoff again, with one of the two origins wrong on both axes.
//
// Both targets are centred in the same flex column, on both axes, so the
// *layout* is identical for both — only the claim differs. #1 says
// `{ start, start }`, which is false for a centred element and costs it
// half of every drag on each axis; #2 says `{ center, center }`, which is
// true and costs it nothing. Same stage, same drag, same spring: the only
// variable is the frame, which is the cleanest version of the argument the
// other origin stories make by varying the layout instead.
//
// The slider drives width and height together, so #1 lags diagonally and
// there is no axis left where a wrong claim happens to be harmless — the
// earlier version pinned the stage's height, which quietly let y be
// correct in either frame.
//
// It also puts the frame conversion under load. In `Origin · handoff` the
// springs are at rest at the moment of the swap, so continuity is easy;
// here you can drag the slider and toggle mid-flight, handing over from a
// frame the surface is *actively lagging in* to one it can't lag in. The
// conversion is of the spring's current value, not the target's, so what
// it has to preserve is the lag itself — the outline should keep whatever
// gap it had and glide from there, rather than snapping onto the new
// target or jumping by the difference between the frames.
export const OriginHandoffCentred: Story = {
  name: 'Origin · handoff · one wrong',
  render: function Render() {
    const [width, setWidth] = useState(400);
    const [second, setSecond] = useState(false);
    return (
      <div className="flex flex-col items-center gap-6">
        <div className="flex items-center gap-4">
          {/*
            Narrower range than the other handoff story: the height follows
            the width here, and the stacked column stops clearing the
            stage's own label below ~300 (measured 1px of clearance at 260).
          */}
          <input
            className={RANGE_CLASS}
            max={480}
            min={300}
            onChange={(e) => setWidth(e.target.valueAsNumber)}
            type="range"
            value={width}
          />
          <ToggleButton offLabel="push · #2" on={second} onLabel="pop · #2" onToggle={() => setSecond((v) => !v)} />
        </div>
        <Stage
          caption="Same layout for both. Only #1’s claim about it is wrong."
          height={stageHeight(width)}
          label="both centred · one wrong origin"
          match={false}
          width={width}
        >
          {/*
            Flex centring is box-model centring, so `offsetLeft` / `offsetTop`
            report the centred position and both beacons measure the same
            layout. #2 stays mounted while inactive so the column can't
            reflow on toggle — the handoff has to be the only thing that
            changes.
          */}
          <div className="flex h-full flex-col items-center justify-center gap-5">
            <Target height={44} label="#1 · claims start" origin={{ x: 'start', y: 'start' }} width={196} />
            <Target
              enabled={second}
              height={44}
              label="#2 · claims center"
              origin={{ x: 'center', y: 'center' }}
              width={196}
            />
          </div>
        </Stage>
        <p className={NOTE_CLASS}>
          {second
            ? 'On #2, whose claim is true on both axes: drag at any speed and the outline stays on it. Pop back to #1 mid-drag — the lag returns, from wherever the surface was.'
            : 'On #1, whose claim is false on both axes: drag and the outline trails diagonally, by half of each delta. Push #2 mid-drag to hand over to the frame that can’t lag.'}
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
          <ToggleButton offLabel="push · #2" on={centred} onLabel="pop · #2" onToggle={() => setCentred((v) => !v)} />
        </div>
        <Stage
          caption="Two frames, one follower. The swap converts between them."
          label="mixed origins"
          match
          width={width}
        >
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

// ---------------------------------------------------------------------------
// Scroll — the case the origin can't fix.
//
// An origin removes a resize from the measurement because a resize can
// leave the element's position unchanged *in the right frame*. Scrolling
// can't be absorbed that way: relative to the viewport, a scrolled
// element genuinely moves, and no reference point inside the viewport
// makes it stationary. There is no origin that fixes this, which makes it
// the counterexample to reaching for one.
//
// What does fix it is the other choice — which box is the frame. Measured
// against a scroll container, `layoutOffsetRelativeTo` deliberately stops
// at the container and leaves its own scroll in (see `layout-offset.ts`),
// because the follower is `position: absolute` inside it and is carried by
// the same scroll. The coordinate then doesn't change at all while
// scrolling, so there is nothing to animate and nothing to lag.
//
// Two stories, because the two scrollers people actually have behave
// differently in one respect: a bounded panel can be the container
// directly, while a scrolling *page* has to have its content wrapped for
// there to be a container to point at.
// ---------------------------------------------------------------------------

const SCROLL_PANEL_CLASS = `
  relative h-52 overflow-auto rounded-[6px] border border-dashed border-black/15
  dark:border-white/20
`;

const SCROLL_PANEL_WIDTH = 300;

interface ScrollPanelProps {
  label: string;
  caption: string;
  match: boolean;
  /**
   * When false the provider is given no `containerRef`, so the frame is
   * the viewport and the follower renders `position: fixed` — which also
   * means the panel's `overflow` doesn't clip it, since a fixed element's
   * containing block is the viewport rather than the scroller. Seeing it
   * drift outside the panel is part of the point: it was never part of
   * the scrolled content.
   */
  framedByPanel: boolean;
  /** Push the second target, to hand over inside the scrolled flow. */
  second: boolean;
}

const ScrollPanel: FC<ScrollPanelProps> = ({ label, caption, match, framedByPanel, second }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  // Taller than the panel, with both targets near the top so they are on
  // screen before you scroll and leave the frame if you scroll far. #2
  // stays mounted while inactive so the flow can't reflow on toggle.
  const content = (
    <>
      <span className={STAGE_LABEL_CLASS}>{label}</span>
      <div className="flex h-130 flex-col items-center gap-5 pt-14">
        <Target height={52} label="#1 · in flow" width={180} />
        <Target enabled={second} height={52} label="#2 · in flow" width={180} />
      </div>
    </>
  );
  return (
    <div className="flex shrink-0 flex-col gap-2" style={{ width: SCROLL_PANEL_WIDTH }}>
      <div ref={panelRef} className={SCROLL_PANEL_CLASS} style={{ width: SCROLL_PANEL_WIDTH }}>
        {framedByPanel ? (
          <BeaconProvider containerRef={panelRef} renderFollower={false}>
            {content}
            <BeaconFollower className={FOLLOWER_CLASS} />
          </BeaconProvider>
        ) : (
          <BeaconProvider followerProps={{ className: FOLLOWER_CLASS }}>{content}</BeaconProvider>
        )}
      </div>
      <p className={cn(CAPTION_CLASS, match ? CAPTION_MATCH_CLASS : CAPTION_MISMATCH_CLASS)}>{caption}</p>
    </div>
  );
};

// Two identical scroll panels holding identical content. The only
// difference is which box the beacon is measured against, and it decides
// whether scrolling is movement.
//
// Left, framed by the panel: the coordinate is the target's offset inside
// the scrolled content, which scrolling doesn't change, and the follower
// is absolutely positioned in that same content — so it is carried along
// by layout, not by a spring. Measured 0px of error on every frame of a
// 400px scroll, with the follower's `transform` never changing.
//
// Right, framed by the viewport: the same scroll moves the target across
// the viewport, so the coordinate changes by the full scroll delta and the
// spring chases it. This is worse than the resize case rather than
// comparable — a resize moves a centred element by half the delta, a
// scroll moves it by all of it.
export const ScrollFrame: Story = {
  name: 'Scroll · frame',
  render: function Render() {
    const [second, setSecond] = useState(false);
    return (
      <div className="flex flex-col items-center gap-6">
        <ToggleButton offLabel="push · #2" on={second} onLabel="pop · #2" onToggle={() => setSecond((v) => !v)} />
        <div className="flex items-start gap-6">
          <ScrollPanel
            caption="Framed by the panel. Scrolling doesn’t change the coordinate."
            framedByPanel
            label="frame · the panel"
            match
            second={second}
          />
          <ScrollPanel
            caption="Framed by the viewport. Scrolling is the full delta of movement."
            framedByPanel={false}
            label="frame · the viewport"
            match={false}
            second={second}
          />
        </div>
        <p className={NOTE_CLASS}>
          Scroll inside each panel. No origin helps the right one: relative to the viewport the target really did move.
          Its outline isn’t clipped either — a fixed follower was never part of the scrolled content. Toggle mid-scroll
          to add a handoff to the fight.
        </p>
      </div>
    );
  },
};

const PAGE_SCROLL_HEIGHT = 1700;

// The same lesson for the scroller people don't think of as one: the page.
//
// `layout: 'fullscreen'` and a page taller than the frame, so the story
// itself scrolls. Both columns hold the same target; the left one's
// provider points at the wrapper around the page content, the right one
// has no container and lands on the viewport.
//
// The instructive part is what the fix looks like here. The wrapper is not
// a scroll container — the document scrolls — but registering it is still
// enough: the walk stops there, so the document's scroll never gets
// subtracted, and the follower becomes an absolutely positioned element in
// the page flow that scrolls with everything else. The reflex for page
// scroll is to reach for `position: fixed`, and that is exactly the
// version that lags.
export const ScrollPage: Story = {
  name: 'Scroll · page',
  parameters: { layout: 'fullscreen' },
  render: function Render() {
    const pageRef = useRef<HTMLDivElement>(null);
    const [second, setSecond] = useState(false);
    return (
      // Centred like a real page column, and `pageRef` stays the wrapper
      // that gets registered — so it must also stay the nearest positioned
      // ancestor of the follower. `mx-auto` on this same element keeps both
      // roles in one box instead of adding a `relative` layer between them.
      <div ref={pageRef} className="relative mx-auto w-180 px-10 pt-16" style={{ height: PAGE_SCROLL_HEIGHT }}>
        <p className="font-mono text-[11px] leading-[1.7] text-black/45 dark:text-white/45">
          Scroll the page. Both columns hold the same two targets in the same flow; only the frame differs. The left
          follower is an absolutely positioned element inside the wrapper its provider was pointed at, so the page
          carries it. The right one is fixed to the viewport, so every scrolled pixel is a pixel it has to catch up.
        </p>
        <div className="mt-90 flex flex-col items-center gap-6">
          <ToggleButton offLabel="push · #2" on={second} onLabel="pop · #2" onToggle={() => setSecond((v) => !v)} />
          <div className="flex gap-10">
            {/*
              The follower must be a DOM descendant of `pageRef` and must not
              find a nearer positioned ancestor, or its `position: absolute`
              would resolve against the wrong box — hence no `relative` on
              the rows or the columns between here and there.
            */}
            <BeaconProvider containerRef={pageRef} renderFollower={false}>
              <div className="flex flex-col gap-3" style={{ width: 260 }}>
                <Target height={56} label="#1 · page content" width={260} />
                <Target enabled={second} height={56} label="#2 · page content" width={260} />
                <p className={cn(CAPTION_CLASS, CAPTION_MATCH_CLASS)}>Carried by the page. Nothing to animate.</p>
              </div>
              <BeaconFollower className={FOLLOWER_CLASS} />
            </BeaconProvider>
            <BeaconProvider followerProps={{ className: FOLLOWER_CLASS }}>
              <div className="flex flex-col gap-3" style={{ width: 260 }}>
                <Target height={56} label="#1 · viewport" width={260} />
                <Target enabled={second} height={56} label="#2 · viewport" width={260} />
                <p className={cn(CAPTION_CLASS, CAPTION_MISMATCH_CLASS)}>Fixed to the viewport. Chases every pixel.</p>
              </div>
            </BeaconProvider>
          </div>
        </div>
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
// The trade-off is that freezing keeps a *stale* box while no
// measurement is running — but "stale" is relative to the frame it was
// frozen in. This story measures from the viewport's centre, which is the
// frame its centred layout holds still in, so a window resize moves the
// frozen outline and the target by the same amount and the freeze
// survives it. Staleness only shows for movement the frame doesn't
// absorb, and a frame that absorbs the wrong things is what `Origin ·
// mismatch` is about.
export const LoseLastBeaconFreeze: Story = {
  name: 'Lose Last · freeze',
  render: function Render() {
    const [enabled, setEnabled] = useState(true);
    return (
      <Frame onEmpty="freeze">
        <ToggleButton
          offLabel="push · only beacon"
          on={enabled}
          onLabel="pop · only beacon"
          onToggle={() => setEnabled((v) => !v)}
        />
        <Target
          label={enabled ? 'only beacon · active' : 'only beacon · inactive'}
          width={280}
          height={120}
          enabled={enabled}
        />
        <p className={NOTE_CLASS}>
          {enabled
            ? 'active — the outline tracks the target. Resize the window: the target re-centres and the outline stays glued to it, because this story measures from the viewport’s centre and nothing moved in that frame.'
            : 'inactive — the outline is frozen on the last measured box and no measurement is running. Resize the window: the freeze survives it, because a centred target’s position in the centre frame is the one thing a resize doesn’t change. Push again to resume measuring.'}
        </p>
      </Frame>
    );
  },
};

// The same freeze, in a frame that doesn't describe the layout — which is
// what makes a frozen box actually go stale, and is the demonstration the
// centre origin above quietly took away.
//
// The content is centred exactly as before; only the frame is the
// viewport's corner. While a beacon is active that difference is invisible
// at rest and shows only as resize lag. Pop it and the difference becomes
// permanent: no measurement is running, the frozen coordinate is an offset
// from a corner, and the target's distance from that corner is precisely
// what a resize changes. The outline is left behind by half the delta and
// stays there until something measures again.
//
// The pair is the useful part. Freezing geometry is only safe in a frame
// the layout preserves, so `onEmpty: 'freeze'` and the origin are not
// independent choices — freeze inherits whatever the frame guarantees.
export const LoseLastBeaconFreezeCorner: Story = {
  name: 'Lose Last · freeze · corner frame',
  render: function Render() {
    const [enabled, setEnabled] = useState(true);
    return (
      <Frame onEmpty="freeze" origin={{ x: 'start', y: 'start' }}>
        <ToggleButton
          offLabel="push · only beacon"
          on={enabled}
          onLabel="pop · only beacon"
          onToggle={() => setEnabled((v) => !v)}
        />
        <Target
          enabled={enabled}
          height={120}
          label={enabled ? 'corner frame · active' : 'corner frame · inactive'}
          width={280}
        />
        <p className={NOTE_CLASS}>
          {enabled
            ? 'active — measured from the viewport’s corner, which this centred layout does not hold still in. Resize the window and the outline trails the target instead of staying glued. Now pop it, then resize.'
            : 'inactive — frozen on a corner-relative coordinate with nothing measuring. Resize the window: the target re-centres, the outline does not, and the gap is permanent. Compare with the centre-framed story, where the same pop and resize keeps it glued.'}
        </p>
      </Frame>
    );
  },
};
