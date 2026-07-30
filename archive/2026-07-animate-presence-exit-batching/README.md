# Known issue: AnimatePresence removes exiting children as a batch

**Date:** 2026-07 · **Status:** confirmed upstream behaviour, partly fixed after our pinned version · **Applies to:** `motion` 12.23.25

`AnimatePresence` does not remove an exiting child when that child's own exit
animation finishes. It removes every pending child together, once the last one is
done. A fast element therefore sits in the DOM — at rest, invisible, still
holding its node — for as long as a slow sibling keeps animating. This is not a
prop; in the default `mode="sync"` it is unconditional.

That would be a curiosity if it were only about timing. It is not: the lingering
element is still a live `AnimatePresence` child, so a later re-render can reach
it. Re-adding its key does not mount anything — it revives whatever the finished
exit left behind. On 12.23.25 that revival never re-establishes `initial`, so the
card enters from the side it just left towards. Which means an unrelated
sibling's exit duration decides whether your enter animation plays forwards or
backwards.

Three scenarios separate the three states a child can be in: mounted,
exit-complete-but-mounted, and removed.

## Measured

| Scenario               | exit-done | unmount | stranded   | first x on re-entry | enters from | max frame jump | distinct nodes |
| ---------------------- | --------- | ------- | ---------- | ------------------- | ----------- | -------------- | -------------- |
| S1 batched removal     | 1256ms    | 5009ms  | **3753ms** | —                   | —           | —              | 1              |
| S2 re-entry mid-exit   | never     | never   | —          | −90                 | left        | 1              | 1              |
| S3 re-entry after exit | 6764ms    | never   | —          | **−293**            | **left**    | 13             | 1              |

Enter targets `x: 300`, exit targets `x: -300`, both linear, so x reads directly
as progress and its sign says which side an element came in from.

- **S1** — A exits in 0.5s, B in 4s, overlapping. A's `exit-done` arrives with no
  `unmount` beside it, and A sits mounted at `x=-300 o=0` for **3.75 seconds**
  before leaving with B. Nothing about A is slow; it is waiting on B.
- **S2** — A is 1.2s into a 4s exit when we put it back. Same node, no
  unmount/mount pair, and the sample opens at A's real mid-exit x (`−90`) and
  creeps back toward 0. The largest frame-to-frame step is **1px** — it resumed,
  it did not restart. Correct behaviour, and the control for S3.
- **S3** — A's 0.4s exit has already finished, but a 6s sibling is holding the
  batch open, so A is still mounted (this state only exists because of S1). We
  re-add A. Every sampled value is **negative**: it enters from the left,
  climbing from `−293` toward 0, even though `initial` says `x: 300`. Same node
  `#1`, `enter-done` fires ~0.4s later — it really did run an enter, from the
  wrong place.

S2 and S3 settle at the identical `x=0`, which is why this is sampled per frame
rather than asserted on the end state.

## Why

Each finishing child marks itself in an `exitComplete` Map, then checks whether
_every_ entry is done. Only the last one calls `setRenderedChildren`, which swaps
the whole child list at once:

- [`AnimatePresence/index.tsx#L87`](https://github.com/motiondivision/motion/blob/78681bc6fe9c1297eacec6f634bd3f13328d64a7/packages/framer-motion/src/components/AnimatePresence/index.tsx#L87)
  — the `exitComplete` Map
- [`AnimatePresence/index.tsx#L181-L200`](https://github.com/motiondivision/motion/blob/78681bc6fe9c1297eacec6f634bd3f13328d64a7/packages/framer-motion/src/components/AnimatePresence/index.tsx#L181-L200)
  — `onExit`, and the `isEveryExitComplete` gate around the single
  `setRenderedChildren` call

There is no per-child removal path, so S1's A cannot leave early. The trade is
deliberate and it is a good one: one layout re-measure and one React re-render
per flush instead of N. `onExit` fires from an animation callback, outside
React's batching, so N individual removals really would be N renders. Batching
also keeps indices stable while exiting children are spliced back into the list.

The re-entry behaviour is the part that was wrong. At 12.23.25 the exit feature
has no notion of an exit having _completed_ — `update()` unconditionally calls
`setActive("exit", !isPresent)` and lets `animate` take over from wherever the
values currently are:

- [`exit.ts#L18-L21`](https://github.com/motiondivision/motion/blob/78681bc6fe9c1297eacec6f634bd3f13328d64a7/packages/framer-motion/src/motion/features/animation/exit.ts#L18-L21)

For S2 that is exactly right, and it is why S2 resumes so cleanly. For S3 it is
the bug: taking over "from wherever the values are" means taking over from
`x=-300`.

Upstream added the missing fork:

- [`6a8d3abb9`](https://github.com/motiondivision/motion/commit/6a8d3abb91c3cfe8843110d46c7cafc112a2e944)
  (v12.36.0, 2026-03-09) — tracks `isExitComplete` and, on the completed branch,
  resets and replays the enter animation. Variant-label `initial` only.
- [`3497306f8`](https://github.com/motiondivision/motion/commit/3497306f83a299b2c4505f3da73069520153803d)
  (v12.39.0, 2026-04-03) — extends it to object-form `initial`, which is what
  this demo (and most app code) uses.

On ≥12.39 the S3 sample comes back positive. The batching itself is unchanged and
is not going away, so S1 is permanent and S3's _trigger_ still exists on any
version: a child can be at rest and still mounted.

## What we do about it

Nothing, in the demo — it is pinned at 12.23.25 on purpose, because that is what
our app code lives with today.

The consequence we did have to design around is that frozen-but-mounted children
are reachable through `custom`, which is the subject of
[2026-07-step-transition-direction](../2026-07-step-transition-direction/README.md).
If you are writing new code against this version: don't assume an element is
gone because its exit finished, and don't assume a re-entering key starts from
`initial`.

## Reproducing

Start Storybook, then run the probe:

```bash
pnpm --filter @monorepo/app-storybook dev
node archive/2026-07-animate-presence-exit-batching/probe.mjs
```

The probe drives the three real stories under
`Demos/AnimatePresence exit batching` — it presses each story's Run button, waits
for the scripted run to finish, and reads the numbers back out of the rendered
trace panel. It does not re-implement the scenarios, so it cannot drift from what
the stories show. Timings vary by a few tens of ms per run; the orders of
magnitude do not.

To watch instead of measure, open the stories and press Run. `exit-done` is
amber, `unmount` is rose; the finding in S1 is an amber line with no rose line
next to it.

## Note on the citations

Line numbers are pinned to `78681bc`, the commit tagged `v12.23.25` — the version
in this workspace's lockfile. The fix commits are cited by their own sha. Both
sets will still resolve after the tree moves on.
