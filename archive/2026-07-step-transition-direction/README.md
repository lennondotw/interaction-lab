# Why StepTransition stamps a direction per step instead of keeping one

**Date:** 2026-07 · **Status:** fixed in `9c037e0` · **Applies to:** `motion` 12.23.25

The reported symptom: `1→2→3→4→5` at speed looks right, `5→4` looks right, and
then continuing `4→3→2→1` at the same speed has "all the directions wrong" —
cards visibly reversing back across the frame instead of leaving.

The component had one `direction` scalar for the whole transition, and its
variants read it:

```ts
exit: (dir: number) => ({ x: dir > 0 ? -SLIDE : SLIDE, ... })
```

That is the documented pattern. It is also wrong the moment two cards are exiting
at once, which is most of the time during fast navigation.

## Measured

Next ×4 then Prev ×4, at a fixed gap, sampling every card's composited x every
frame. The criterion is **direction reversals per card**: a legitimate card turns
at most once, at the boundary between its enter leg and its exit leg, and only
when it happens to leave towards the side it arrived from. Two or more means
something moved the target while the card was mid-flight. The threshold does not
depend on how many times we clicked or which cards were on screen.

Before (`9c037e0~1`, one shared scalar):

| Press gap | cards seen | max reversals | cards > 1 | which | verdict   |
| --------- | ---------- | ------------- | --------- | ----- | --------- |
| 60ms      | 5          | **3**         | 2         | 1 3   | REWRITTEN |
| 120ms     | 5          | **3**         | 2         | 1 2   | REWRITTEN |
| 250ms     | 5          | **3**         | 3         | 1 2 3 | REWRITTEN |
| 600ms     | 9          | 1             | 0         | —     | ok        |

After (`9c037e0`, direction stamped per step):

| Press gap | cards seen | max reversals | cards > 1 | which | verdict |
| --------- | ---------- | ------------- | --------- | ----- | ------- |
| 60ms      | 5          | 1             | 0         | —     | ok      |
| 120ms     | 5          | 1             | 0         | —     | ok      |
| 250ms     | 5          | 1             | 0         | —     | ok      |
| 600ms     | 9          | 1             | 0         | —     | ok      |

Two things to read off the table.

**600ms was always fine.** The slide transition is 450ms, so at a 600ms gap every
card has finished and been removed before the next press. The bug needs an
overlap, which is why it never showed up in slow manual testing — and why the
report is specifically about fast navigation.

**`cards seen` is the mechanism, in one column.** Five distinct DOM nodes for an
eight-press round trip at 60ms — the starting card plus the four the forward run
mounted. Steps 4, 3, 2, 1 are not re-mounted on the way back; they are the same
nodes, still exiting, revived in place. At 600ms there are nine: the starting card
plus one per press. The bug and the node reuse have the same cause.

## Why

Two upstream behaviours meet here.

An exiting child's props are frozen at the moment it was removed — that is the
entire reason `AnimatePresence`'s `custom` prop exists. It is the one live channel
into a child whose props can no longer be updated: `custom` is passed down through
the presence context and re-resolved against the variant function on every render.

And `AnimatePresence` removes exiting children as a **batch**, not individually
— measured separately in
[2026-07-animate-presence-exit-batching](../2026-07-animate-presence-exit-batching/README.md).
During fast navigation, several earlier cards are still mounted and still exiting.

Put together: one shared scalar, re-resolved for every frozen child. The first
`Prev` press flips it from `+1` to `-1`, and every card left over from the forward
run — each of them travelling left towards `x=-80` — has its exit target
re-resolved to `x=+80`. They turn around and cross back over the frame. That is
the reversal count of 3, and it is exactly what the reporter saw.

The forward run alone never shows it, because every re-resolve produces the same
`+1` and the target does not move. Only the turnaround exposes it. Which is also
why the last press before the turnaround (`5→4`) looks correct — it is the press
_after_ it that rewrites the stale cards.

## The fix

Stamp the direction per step and let each child's variants close over its own
step:

```ts
export type StepDirections = Record<number, number>;
const dirOf = (dirs: StepDirections, step: number) => dirs[step] ?? 1;

const slideVariants = (step: number): Variants => ({
  enter: (dirs: StepDirections) => ({ x: dirOf(dirs, step) > 0 ? SLIDE : -SLIDE, ... }),
  exit: (dirs: StepDirections) => ({ x: dirOf(dirs, step) > 0 ? -SLIDE : SLIDE, ... }),
});
```

`custom` still carries the live map, so the channel into frozen children stays
open — that part of the pattern is load-bearing and we keep it. What changes is
what a re-resolve can reach: each navigation stamps only its own two steps (the
one leaving and the one arriving), so a card that departed under an earlier
navigation keeps reading the stamp it left with, no matter how many times the map
is re-resolved afterwards.

This is not a workaround for a Motion bug. Re-resolving `custom` for every
exiting child is correct — it is the only way a live channel _can_ work. The bug
was in what we put on the channel: a value shared by children that no longer
share a direction.

## Reproducing

Start Storybook, then run the probe:

```bash
pnpm --filter @monorepo/app-storybook dev
node archive/2026-07-step-transition-direction/probe.mjs
```

The probe drives the real `Components/Step transition` → Slide story through its
own buttons; the only concession to testability is the `data-testid="step-stage"`
wrapper in the story. Presses are scheduled by in-page timers rather than by the
driver, because a round trip per click would not reproduce the gap under test.

To see the failing side, check out the pre-fix component and let Vite hot-reload
it:

```bash
git checkout 9c037e0~1 -- apps-web/app-storybook/src/animations/step-transition/step-transition.tsx
node archive/2026-07-step-transition-direction/probe.mjs
git checkout HEAD -- apps-web/app-storybook/src/animations/step-transition/step-transition.tsx
```

By hand: press `→` four times as fast as you can, then `←` four times. Look for
cards sliding back the way they came.

## Note on the version

Measured against `motion` 12.23.25. The batching that makes stale children
reachable is unchanged upstream and is not going away, so the per-step stamp
stays correct on newer versions too — it is not a version-gated workaround.
