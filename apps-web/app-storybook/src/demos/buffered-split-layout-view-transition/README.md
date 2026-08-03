# Buffered Split Layout View Transition

This demo explores a buffered split layout strategy. The core idea is to separate immediate interaction feedback from expensive committed content layout.

During live interaction, the panes respond visually without recomputing the real content layout. The expensive layout work is deferred to a commit phase.

Before reusing anything here, read [Known Issue: View Transition Breaks Overlay Stacking](#known-issue-view-transition-breaks-overlay-stacking). Every commit temporarily breaks overlay stacking across the whole page, not just inside this component.

## Size Model

The component tracks two kinds of width:

- `visual width`: the pane width the user sees right now.
- `locked/layout width`: the width used by the real content layout.

During live interaction, only the `visual width` changes. The content layer keeps its existing `locked/layout width` and is compressed or stretched with `scaleX(...)` to match the current visual width.

Blur is applied after the content layer has been scaled, not before. This keeps the blur radius independent from the pane scale, so the blur strength does not get diluted by horizontal compression.

## Manual Resize

When the user drags the divider:

1. `pointerdown` immediately enters live resize.
2. The left and right pane shells update their visual width in real time.
3. The content layers keep their locked layout width and use `scaleX(...)` to match the live visual width.
4. Both content layers enter a 6px blur.
5. No real content layout commit happens while dragging.
6. `pointerup` commits the final target layout.
7. The expensive real content reflow happens once, and only once, after the drag ends.
8. The commit uses View Transition old/new snapshots for cross-dissolve.
9. Blur exit is synchronized with the cross-dissolve and stays slightly slower, so the reflow is not exposed without blur.

The point of this path is not to make per-frame layout cheaper. It is to reduce real content layout work during the drag to zero and concentrate it into one commit at the end.

## Window Resize

Browser window resize does not expose a reliable release signal, so this path uses a debounce fallback.

The first resize event acts as the leading edge. The component immediately enters the same live resize feedback used by manual resize: it updates `visual width`, `scaleX(...)`, and blur.

Continuous resize events keep updating only the live visual state. They do not commit the real content layout every frame.

When the trailing debounce fires, the component performs one committed layout update. The commit animation strategy matches manual resize: View Transition cross-dissolve plus blur exit.

In short, the leading edge provides immediate feedback, and the trailing edge persists the real layout.

## Expand And Collapse

Right pane expand and collapse uses Motion FLIP. The right pane does not need blur in this path because its width is not being visually compressed by the resize strategy.

Left pane expand and collapse uses a handwritten FLIP-like sequence:

1. View Transition captures the target layout snapshot.
2. The left pane quickly enters blur.
3. A short cross-dissolve switches to the target snapshot scaled back to the current width.
4. That target snapshot transforms to the final width.
5. After it reaches the final layout, blur exits slowly.

This path uses a fast-in, slow-out rhythm: blur enter and cross-dissolve are short, while blur exit is longer.

## View Transition Role

This demo does not rely on View Transition's default geometry animation. The default animation is disabled because it can introduce uncontrolled scale and position changes.

View Transition is used mainly for two things:

- Capturing old/new snapshots around a DOM update.
- Letting named regions participate as independent snapshots via `view-transition-name`.

The actual fade, transform, and blur timing is controlled by this component's CSS and JS.

## Known Issue: View Transition Breaks Overlay Stacking

This is serious and deliberately unmitigated. This demo is an experiment, so it does not carry the guards a real component would need.

Checked against [CSS View Transitions Level 1](https://drafts.csswg.org/css-view-transitions-1/) — section numbers below refer to that spec — and then measured in Chromium. The numbers, the screenshots, and a runnable probe are in [archive/2026-08-view-transition-overlay-stacking](../../../../../archive/2026-08-view-transition-overlay-stacking/README.md).

### What the spec says

- The view transition layer paints above everything, top layer included. `::view-transition` "generates a new stacking context, called the view transition layer, which paints after all other content of the document (including any content rendered in the top layer)" (§4.2).
- Top layer content is still captured, not omitted. When the captured element is the document element, the UA renders "the region of document (including its canvas background and any top layer content) that intersects the snapshot containing block" (§7.7). A modal `dialog` or a `popover` therefore lands _inside_ the `root` snapshot.
- Named elements are punched out of the snapshot that would otherwise contain them: "if descendant is captured in a view transition, then skip painting descendant" (§7.7.1).
- Group order is paint order, frozen at capture time. The capture walks elements in paint order "such that the element at the bottom of the paint stack generates the first pseudo child of `::view-transition`" (§7.3.1).
- Old is a bitmap, new is not: the transition runs "using a static visual capture of the old state, and a live capture of the new state" (§1).
- Captured elements go dark and inert where they actually live. During the `animating` phase the boxes generated by a captured element "and its element contents … are not painted (as if they had `opacity: 0`) and do not respond to hit-testing (as if they had `pointer-events: none`)" (§4.2).

### The defect

Not "the overlay disappears", and not "the overlay freezes". The document element carries `view-transition-name: root` from the UA stylesheet, so it sits at the bottom of the paint stack and becomes the _first_ group in the view transition layer. Everything without its own name — every overlay included — collapses into that one flat group.

Any element that does have a name generates a later sibling group, which paints above `root`. So for the length of every commit the two panes paint above every overlay on the page, whatever its DOM `z-index`. No `z-index` on the overlay can win, because it is not a sibling of the pane groups — it is inside `root`.

Measured: a `position: fixed` toast at `z-index: 2147483647` has **43.9%** of its own rect painted over mid-commit, and a `dialog.showModal()` — in the top layer, which normally beats everything — measures identically. What covers them is the left pane's blurred paragraph text.

This demo then makes it unconditional by assigning group `z-index` by hand (`10` on the pane groups, `20` on the metrics). Those numbers are not decoration. The two pane sections are DOM siblings, so default paint order gives left-pane, left-metrics, right-pane, right-metrics — and the right pane covers the left pane's metrics. Restoring the intended order means rebuilding it by hand for the whole page, in numbers that are a private convention of this component. An overlay portalled outside it has no way to know which rung to claim.

The frozen old bitmap is a latent problem here rather than a live one. `root`'s old and new pseudos both get `animation: none`, so the live new state covers the static old one at full opacity and the ghost never shows. Re-enable any root animation and an overlay's old bitmap cross-fades underneath its live self.

### Input dead zone

Easier to miss than the visual glitch, worse, and the half with no fix. Because `root` is captured, the whole document stops hit-testing for the duration of the transition (§4.2). Every commit makes the entire page — including the buttons of any open dialog — unclickable for `VIEW_TRANSITION_MS` (420ms), or `TOGGLE_LAYOUT_MS` (500ms) on the toggle path. `?motionDebug=slow` multiplies that by four.

Giving the overlay a `view-transition-name` fixes the paint (measured: foreign pixels drop from 43.9% to 0%) and does **not** fix this. It cannot: naming is what makes an element captured, so it opts into the same suppression it was trying to escape. Measured both ways — a named overlay is still unclickable mid-commit.

Nothing about it is observable from script either. The overlay's computed `opacity` still reads `1` mid-commit; the spec's wording is "as if", not a style change.

### The animation cannot be interrupted

This falls out of the dead zone, and it is worse than it first sounds, because the two input modes disagree.

Pointer input is gone for the duration, so a mouse user cannot interrupt a commit at all — not the divider, not the toggle, nothing. A click mid-commit lands on `<html>`.

Keyboard input is not gone. Focus survives the transition and activation does not hit-test, so a focused toggle button still fires on Enter or Space. Measured: pointer does not arrive mid-commit, keyboard does, and each keypress starts another transition.

Which is where it stops being a mere inconsistency. `startViewTransition` is a document-level singleton, so the second call skips the first — and there is nothing to hand over. Measured mid-toggle: what is painted is the pane scaled to **0.5926**, read off `::view-transition-image-pair`, while the component's own `--split-leading-visual-width` already reads **1100px**, the end state. The intermediate state the user is looking at exists _only_ in the pseudo-element's transform. The DOM jumped to the end the moment the update callback ran.

So an interrupted commit cannot be retargeted, only discarded. The second transition captures the live DOM as its "old" state, and the live DOM is already at the end of the first animation — so it starts from a place the user never saw. There is no equivalent of a FLIP or spring interruption, where the new animation picks up the current visual state and its velocity, because under View Transition that state is not a value anywhere; it is a bitmap and a transform on a pseudo-element that the next transition cannot read.

[buffered-split-layout-blur-commit](../buffered-split-layout-blur-commit/README.md) does not have this problem, and not by being careful about it — its toggle animates plain numbers, so the current visual geometry is always a readable value and an interrupted toggle simply re-animates from wherever it is.

### Window resize is still the worst path

§7.8 has a rule aimed straight at this path: if the snapshot containing block size changes mid-transition, the UA skips the transition. Measured, that cuts a **446ms** cross-dissolve to **30ms** — the commit does not play, it cuts.

Two things about it are worth knowing, and neither is what you would guess. It is **not** reachable by dragging a window edge: ten resize events 60ms apart start exactly _one_ commit, because the 200ms debounce never fires mid-burst. What reaches it is a discrete resize landing after a pause but inside the next ~450ms — a keyboard appearing, a window snap, devtools opening. And it is **not** observable: skipping rejects `ready`, but `ready` has already fulfilled by then, so the rejection lands on a settled promise and `finished` fulfils normally. An aborted commit and a completed one are indistinguishable from here.

That sits on top of the fact that a resize commit has no causal relation to the split at all. It lands 200ms after the fact, once attention is already back on the overlay. Someone who never touched the divider sees their dialog drop behind the panes and stop taking clicks.

One last consequence of the same root cause: View Transition is a document-level singleton, so if an overlay runs its own transition, whichever `startViewTransition` comes second skips the first.

Escaping any of this properly means confining the snapshot layer to the component's own stacking context instead of the top layer — element-scoped view transitions — rather than patching it at this level.

The cheaper escape is to not need a snapshot. [buffered-split-layout-blur-commit](../buffered-split-layout-blur-commit/README.md) is this demo with View Transition removed and nothing put in its place: the same size model, the same one-commit-per-gesture buffering, the reflow hidden by the 6px blur alone. It measures 0% overlay occlusion and keeps overlays clickable, which places the whole of this section on the cross-dissolve rather than on the buffering.

## Debug Overlay

The left and right debug overlays explain the internal state:

- `visual`: the current visual width.
- `locked`: the current locked layout width.
- `content locked`: the width used by the real content layout.
- `scale`: the ratio between visual width and locked width.
- `preferred`: the stored split ratio.
- `mode`: the current interaction mode, either `idle`, `dragging`, or `window resize`.

The debug overlays do not participate in blur and do not animate. They enter View Transition only to keep their stacking order during a commit: without a name of their own they would fall into the `root` group and be covered by the pane snapshots. See [Known Issue](#known-issue-view-transition-breaks-overlay-stacking) — they are the in-component instance of that problem, and the only one this demo bothers to fix. They get away with the half that stays broken only because they are `pointer-events: none` already, so losing hit-testing costs them nothing.
