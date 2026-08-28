# Why StepTransition suppresses its mount animation on the child, not on AnimatePresence

**Date:** 2026-08 · **Applies to:** `motion` 12.43.0 · **Upstream bug:** yes, see below

The reported symptom: `→ → → ← ← ←` at speed lands back on step 1 and the stage is
**empty**. The counter reads `1 / 5`, Prev is correctly disabled, and nothing is
painted.

![the settled stage after the round trip, before the fix](__screenshots__/blank.png)

The card is not missing. It is in the DOM, at `opacity: 0`, `translateX(-80px)`,
`blur(8px)` — parked on its own `enter` keyframe, and it never leaves it.

## Measured

Next ×3 then Prev ×3 at a fixed gap, then 1.5s to settle. Two criteria, both read
off the composited style rather than off props:

- **BLANK** — no settled child has `opacity > 0.01`.
- **LEAK** — more than one child is still mounted after settling. Every exit is
  450ms, so a settled stage holds exactly one card.

`nodes seen` counts distinct DOM nodes, because "the card labelled 1" can be
either the original node revived in place or a fresh mount, and those have very
different explanations.

Before, from a fresh mount:

| Press gap | settled | visible | nodes seen | verdict   |
| --------- | ------- | ------- | ---------- | --------- |
| 80ms      | 1       | 1       | 4          | ok        |
| 100ms     | 1       | **0**   | 4          | **BLANK** |
| 120ms     | 1       | **0**   | 4          | **BLANK** |
| 140ms     | 1       | **0**   | 4          | **BLANK** |
| 160ms     | 1       | **0**   | 4          | **BLANK** |
| 200ms     | 1       | **0**   | 4          | **BLANK** |

After: `ok` at every gap, and mount stays `QUIET` (see below).

Three things to read off that table.

**`nodes seen` is 4 for an eight-press round trip**, so the card we return to is
the _same node_ that left — revived in place, exactly the node reuse measured in
[2026-07-step-transition-direction](../2026-07-step-transition-direction/README.md).
The bug is in the revival, not in a remount.

**80ms passes and everything slower fails**, which is the opposite of the usual
"faster is worse". The threshold is the 450ms transition against the six presses:
at 80ms the round trip is back on step 1 at t≈400ms, while step 1's exit is still
running; from 100ms up it lands at t≥600ms, after that exit has _finished_. So the
trigger is not overlap — it is being revived **after your exit animation
completed**.

**Only step 1 is ever affected.** Reaching step 2 slowly first and then running
the identical fast round trip `2→5→2` passes even on the broken component
(`START=1` in the probe). Whatever is wrong is specific to the card that mounted
on the component's very first render.

## Why

Two upstream behaviours meet, and the component's `initial={false}` is what wires
them together.

`AnimatePresence` passes `initial` down as presence context, and only on its first
render ([`AnimatePresence/index.tsx`][ap]):

```tsx
initial={!isInitialRender.current || initial ? undefined : false}
```

Motion reads that once, at visual-element **construction**, and latches it
([`use-visual-element.ts`][uve]):

```ts
blockInitialAnimation: presenceContext ? presenceContext.initial === false : false;
```

It is never recomputed. So the one child that mounts on that first render carries
`blockInitialAnimation === true` for the rest of its life — long after any notion
of "initial" has passed.

Now the revival path. When a child re-enters, `ExitAnimationFeature` branches on
whether its exit had finished ([`animation/exit.ts`][exit]):

```ts
if (this.isExitComplete) {
  /* jump every value to the resolved `initial` variant */
  this.node.animationState.reset();
  this.node.animationState.animateChanges();
} else {
  this.node.animationState.setActive('exit', false);
}
```

The `else` branch is fine, and it is the branch an 80ms round trip takes.

The `isExitComplete` branch jumps the element to its `initial` target — for us
`enter`, i.e. `x: -80, opacity: 0, blur(8px)` — and then asks the animation state
to animate on from there. But `reset()` sets an internal `wasReset` flag, and
`animateChanges` treats that flag exactly like a first render
([`animation-state.ts`][as]):

```ts
if ((isInitialRender || wasReset) && visualElement.blockInitialAnimation) {
  shouldAnimateType = false;
}
```

For our step-1 card `blockInitialAnimation` is still `true`, so the `animate`
→ `center` leg is vetoed. The element has been jumped to `enter` and told not to
animate out of it. It stays invisible, off to the left, forever — and because its
exit promise never resolves again, `AnimatePresence` also stops flushing its
exiting batch, which is where the stray `LEAK` nodes in early runs came from.

Every other card mounts on a later render, gets `presenceContext.initial ===
undefined`, and so has `blockInitialAnimation === false` — the veto does not apply
and the same revival works. Hence "only step 1".

## The fix

Suppress the mount animation from the child instead, so no child ever receives
presence context with `initial: false`:

```tsx
// `directions` is empty until the first navigation, which is exactly the render
// the first step mounts on.
const initial = Object.keys(directions).length === 0 ? false : 'enter';

<AnimatePresence mode="popLayout" custom={directions}>
  <motion.div key={step} initial={initial} animate="center" exit="exit" … />
</AnimatePresence>
```

`initial={false}` on a `motion` component blocks the mount animation through a
different route — `animateChanges` checks `props.initial === false` only under
`isInitialRender`, not under `wasReset` — so it does not latch anything, and the
revived card animates back to `center` normally.

The mount behaviour this protects is the reason the prop was there at all, so the
probe asserts it directly: on load the first card must be composited at rest
(`|x|max = 0`, `opacity ≥ 1.00` across the first 800ms), not slide and blur in.

## This is an upstream bug

Ours is a workaround at the call site. Two things are wrong in `motion` 12.43.0:

1. `blockInitialAnimation` means "do not animate on mount", but `animation-state`
   reuses it for "do not animate after a reset". By the time a child is being
   revived it has already mounted and animated; the flag's contract is discharged.
2. `blockInitialAnimation` is computed once at construction from a presence-context
   value that `AnimatePresence` only ever sets on its own first render, and is
   never refreshed.

The narrow upstream fix is for `ExitAnimationFeature` to clear the flag before it
resets, on the branch that has already decided to replay the enter animation:

```ts
if (this.isExitComplete) {
  /* … jump to `initial` … */
  this.node.blockInitialAnimation = false; // mount is long past
  this.node.animationState.reset();
  this.node.animationState.animateChanges();
}
```

Not applied here — we do not patch `motion` in this repo, and the call-site form
is the one we want anyway.

## Reproducing

Start Storybook, then run the probe:

```bash
pnpm --filter @monorepo/lab dev
node archive/2026-08-step-transition-revive/probe.mjs
```

The probe drives the real `Components/Step transition` → Slide story through its
own buttons; the only concession to testability is the `data-testid="step-stage"`
wrapper in the story. Presses are scheduled by in-page timers rather than by the
driver, because a round trip per click would not reproduce the gap under test.

Useful knobs:

```bash
START=1 node …/probe.mjs   # revive a card that did NOT mount on the first render
RESET=dirty node …/probe.mjs   # keep leaked nodes between runs
STORY_ID=animations-steptransition--fade-mode node …/probe.mjs
node …/probe.mjs blank     # via shoot.mjs: screenshot the settled stage
```

To see the failing side, put `initial={false}` back on the `AnimatePresence` and
let Vite hot-reload it.

By hand: press `→` three times as fast as you can, then `←` three times. The stage
goes blank on step 1.

[ap]: https://github.com/motiondivision/motion/blob/v12.43.0/packages/framer-motion/src/components/AnimatePresence/index.tsx
[uve]: https://github.com/motiondivision/motion/blob/v12.43.0/packages/framer-motion/src/motion/utils/use-visual-element.ts
[exit]: https://github.com/motiondivision/motion/blob/v12.43.0/packages/framer-motion/src/motion/features/animation/exit.ts
[as]: https://github.com/motiondivision/motion/blob/v12.43.0/packages/motion-dom/src/render/utils/animation-state.ts
