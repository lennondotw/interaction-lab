# Known issue: a View Transition commit hides and freezes every overlay on the page

**Date:** 2026-08 · **Status:** confirmed, spec-mandated; half of it has no author-side fix · **Applies to:** Chromium 141.0.7390.37, `Demos/BufferedSplitLayoutViewTransition`

`buffered-split-layout-view-transition` commits its layout inside
`document.startViewTransition`. For the length of that commit, an overlay that
has nothing to do with the split — a portalled toast, a modal dialog — is
painted over by the split's panes and stops responding to clicks. Neither is
recoverable with `z-index`, and one of them is not recoverable at all.

The two halves have different causes and different outcomes, which is why they
are measured separately. The input half has a third consequence measured further
down: the commit cannot be interrupted, only discarded.

**Paint.** The UA stylesheet gives the document element
`view-transition-name: root`, and groups are ordered by paint order, so `root`
becomes the _first_ child of `::view-transition`. Everything unnamed collapses
into that one group. Any element that _is_ named becomes a later sibling and
paints above it. The panes are named; an overlay is not; so the panes win, at
any DOM `z-index`. Naming the overlay fixes this.

**Input.** Every captured element stops hit-testing for the duration. `root` is
captured, so that is the whole document. Naming the overlay does _not_ help
here — naming is what makes an element captured, so it opts into the same
suppression it was trying to escape.

## Measured

Overlay vs a commit parked mid-animation:

| Case                       | hit frozen | click frozen | click after | foreign px idle | foreign px frozen | opacity frozen |
| -------------------------- | ---------- | ------------ | ----------- | --------------- | ----------------- | -------------- |
| C1 portalled fixed toast   | `html`     | no           | yes         | 0%              | **43.9%**         | 1              |
| C2 modal dialog, top layer | `html`     | no           | yes         | 0%              | **43.9%**         | 1              |
| C3 same toast, but named   | `html`     | **no**       | yes         | 0%              | **0%**            | 1              |

Resizing while a commit is in flight:

| Case                                   | settled | ready→finished | `finished`  | commits started |
| -------------------------------------- | ------- | -------------- | ----------- | --------------- |
| C4 parked commit, then resize          | yes     | 29ms           | `fulfilled` | 1               |
| C5 parked commit, left alone (control) | **no**  | —              | `pending`   | 1               |
| C6 live commit, then resize            | yes     | **30ms**       | `fulfilled` | 1               |
| C7 live commit, left alone (baseline)  | yes     | **446ms**      | `fulfilled` | 1               |
| C8 ten resizes, 60ms apart             | —       | —              | —           | **1**           |

Interrupting a commit:

| Case                                        | pointer arrives | keyboard arrives | painted scaleX | dom visual | commits started |
| ------------------------------------------- | --------------- | ---------------- | -------------- | ---------- | --------------- |
| C9 parked toggle, then pointer and keyboard | **no**          | **yes**          | **0.5926**     | **1100px** | 2               |

`foreign px` is the share of the overlay's own rect not painted in the overlay's
own colour. The overlay is a flat colour block with no text, so anything above
zero is another layer painting into it.

- **C1** — A `position: fixed` toast at `z-index: 2147483647`, appended to
  `body` the way a portal would. Untouched when idle (0% foreign, clickable);
  mid-commit **43.9%** of it is covered. `__screenshots__/c1-frozen.png` shows
  what by: the left pane's blurred paragraph text, painting straight through the
  toast. The toast itself is not blurred — it is in `root`, under the pane group.
- **C2** — The same rect as a `dialog.showModal()`, so it is in the top layer,
  which normally beats everything on the page. Identical **43.9%**. Being in the
  top layer buys nothing, because the top layer is captured _into_ the root
  snapshot rather than left above it.
- **C3** — The same toast with `view-transition-name` and a group `z-index` of
  30, above the panes' 10 and the metrics panels' 20. Foreign pixels drop to
  **0%** — the paint half is fixed. `click frozen` is still **no**. This is the
  finding worth carrying: the workaround for the visual problem does not touch
  the input problem, and cannot.

Across all three, `opacity frozen` reads `1` and `hit after` is back to
`overlay`. The suppression is invisible to anything that inspects computed
style, and it is transient — which together are why this is easy to ship and
hard to notice.

- **C4/C5** — A parked commit never settles on its own (**C5**, `pending` after
  3s). Resizing during one settles it in **29ms** (**C4**). C5 is what makes C4
  attributable: something outside the animation ended the transition.
- **C6/C7** — Unparked, the same interruption cuts a **446ms** cross-dissolve to
  **30ms**. The commit does not play; it cuts.
- **C8** — Dragging a window edge for real — ten resize events 60ms apart —
  starts **one** commit, not ten. The component's own 200ms debounce never fires
  mid-burst, so the abort is nearly unreachable by dragging. It needs a discrete
  resize landing 200ms after a pause but inside the next ~450ms: a keyboard
  appearing, a window snap, devtools opening.

- **C9** — The two input modes disagree. A pointer click on the toggle does not
  arrive mid-commit; a keypress on the same focused button does, and starts a
  second transition that skips the first. And there is nothing to hand over:
  what is painted is the pane at **0.5926** scale, read off
  `::view-transition-image-pair`, while the component's own
  `--split-leading-visual-width` already reads **1100px**. The state the user is
  looking at exists only in the pseudo-element, so the second transition captures
  a live DOM that is already at the first animation's end and starts from
  somewhere the user never saw. A view transition can be discarded but not
  retargeted, which is the one thing a FLIP or a spring does for free.

In every aborted case `finished` **fulfils**. Skipping rejects `ready`, but
`ready` has already fulfilled by then, so the rejection lands on a settled
promise and nothing observes it. An aborted commit and a completed one are
indistinguishable from the author's side.

## Why

All of it is in [CSS View Transitions Level 1](https://drafts.csswg.org/css-view-transitions-1/).

The view transition layer paints above everything including the top layer, and
§4.2 says why that does not save top-layer content: _"the intent of the feature
is to be able to capture the contents of the page, which includes the top layer
elements."_ §7.7 does the capturing — for the document element it renders _"the
region of document (including its canvas background and any top layer content)
that intersects the snapshot containing block"_. So a modal dialog is inside the
`root` snapshot, which is C2.

§7.7.1 punches named descendants out of it — _"if descendant is captured in a
view transition, then skip painting descendant"_ — and §7.3.1 orders the groups
by paint order, _"such that the element at the bottom of the paint stack
generates the first pseudo child of `::view-transition`"_. The document element
is at the bottom, so `root` is first, so every named group paints above every
unnamed thing. That is C1, and C3 is the same rule used deliberately.

The input half is the last paragraph of §4.2: during the `animating` phase the
boxes generated by a captured element _"and its element contents … are not
painted (as if they had `opacity: 0`) and do not respond to hit-testing (as if
they had `pointer-events: none`)"_. As if — not actually — which is why
`opacity` still computes to `1`.

The abort is §7.8: if the snapshot containing block size no longer matches the
size recorded when the transition started, the UA skips it. The freeze that
makes C4 measurable comes from the same step, which treats a **paused**
animation as an active one, so parking every pseudo-element animation holds the
phase at `animating` indefinitely.

## What we do about it

Nothing. The demo is an experiment and says so; the note lives in
[its README](../../apps-web/app-storybook/src/demos/buffered-split-layout-view-transition/README.md).

The demo's own debug overlays are C3 — named, with a hand-assigned group
`z-index`. They get away with the half that stays broken only because they are
`pointer-events: none` already, so losing hit-testing costs them nothing. A real
overlay does not have that excuse.

If any of this is ever productised, the thing to reach for is a snapshot layer
confined to the component's own stacking context rather than the document's —
element-scoped view transitions — because C3 shows the per-overlay workaround
tops out at the paint half. Short of that, the honest options are to not run a
view transition on a path the user did not aim at the split (the resize commit
is already masked by a 6px blur, so it has little to lose), or to drop View
Transition for a real double buffer and keep the whole thing in normal DOM.

## Reproducing

Start Storybook, then run the probe:

```bash
pnpm --filter @monorepo/app-storybook dev
node archive/2026-08-view-transition-overlay-stacking/probe.mjs
```

It needs `pnpm exec playwright install chromium`. It drives the real `Expanded`
story with one viewport resize — the component's own debounced commit path — so
it cannot drift from what ships. The overlays are the probe's instrument, not
part of the demo: each case appends one to `body`, as a portal would.

`foreign px` is sampled by decoding the screenshot through a canvas in a scratch
page, so the probe keeps the archive's no-dependencies rule. The rect is inset
2px before sampling, because the overlay's own antialiased edge reads as foreign
at every threshold.

To watch instead of measure, open the story, park a commit by hand, and resize:

```js
document.head.insertAdjacentHTML(
  'beforeend',
  '<style>::view-transition-group(*),::view-transition-image-pair(*),::view-transition-old(*),::view-transition-new(*){animation-play-state:paused!important}</style>'
);
```

The next resize will stop mid-commit and stay there.
