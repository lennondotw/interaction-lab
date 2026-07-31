# Sticky Scroll Remapping

Native `position: sticky` produces a velocity profile with two sharp corners: the pinned layer
tracks scroll at `1x`, stops dead at the pin point, sits at `0x` for the whole plateau, then
resumes at `1x` on release. Those two corners are what makes a long sticky reading section feel
mechanical.

This component keeps the native sticky layout untouched and applies a compensating `translateY`
to its child. `getRemappedStickyDisplacement` describes the displacement curve we actually want —
`1x`, a smootherstep deceleration, a slow `0.08x` drift across the plateau, a smootherstep
acceleration, `1x` again — and `getStickyScrollCompensation` returns
`nativeDisplacement - remappedDisplacement`, the per-frame delta the child layer has to carry.

The remap preserves the integral of the native profile, so both endpoints are fixed: compensation
is exactly `0` at `progress = 0` and `progress = 1`. Entering and leaving the track never jumps.

## The Two Pipeline Problem

The rendered position of the content is the sum of two values produced by two different pipelines:

- The sticky offset is computed by the browser's scroll/compositor thread. It tracks scroll
  exactly, with no main-thread involvement.
- The compensation `translateY` is computed on the main thread. `useScroll` measures inside
  Motion's `read` step and the transform is committed in the same frame's `render` step, so Motion
  itself adds no extra latency — but the value only reaches the screen if the main thread makes
  that frame's commit.

When the main thread misses a frame, the compositor still redraws with the newer scroll offset
applied to the sticky constraint, while the transform holds its previous value. The compensation
no longer cancels the right amount of native motion, and the residual shows up as pixels.

## Error Magnitude

The error is `|d(compensation)/d(scroll)| * scrollVelocity * desyncDuration`. Measured on the
curve (100dvh viewport, 200dvh track):

| Scroll position   | Compensation | `d(comp)/d(scroll)` |
| ----------------- | ------------ | ------------------- |
| `0 – 0.65vh`      | `0`          | `0`                 |
| `0.95vh`          | `43.8px`     | `+0.443`            |
| `0.999vh` (pin)   | `68.6px`     | `+0.571`            |
| `1.001vh`         | `68.8px`     | `-0.423`            |
| `1.5vh` (drift)   | `0`          | `-0.080`            |
| `1.999vh`         | `-68.8px`    | `-0.423`            |
| `2.001vh` (unpin) | `-68.6px`    | `+0.571`            |

Peak slope is `0.574` and peak compensation is `0.069 * viewportHeight`. One dropped frame
(16.7ms) therefore costs:

| Scroll velocity | Frame displacement | Error at pin/unpin | Error mid-drift |
| --------------- | ------------------ | ------------------ | --------------- |
| `1000 px/s`     | `17px`             | `~10px`            | `~1px`          |
| `3000 px/s`     | `50px`             | `~29px`            | `~4px`          |
| `6000 px/s`     | `100px`            | `~57px`            | `~8px`          |

The distribution matters more than the peak. Across the drift plateau the slope is only `0.08`, so
a dropped frame there is invisible. At the pin and unpin points it is `0.574`, which is exactly
where the eye is already tracking the text coming to rest. The symptom is not continuous
shimmer — it is a hitch at the moment of pinning and releasing, where the content runs at native
speed for the stale frame and then snaps back onto the curve.

## Why The Coloured Variant Is Worse

`ProgressiveText` is per-grapheme, so the specimen mounts 290 `motion.span` elements.
`SmoothRemap` writes 290 `opacity` values per frame; `SmoothRemapWithColor` adds 290 `color`
writes, and `color` triggers paint across a full-viewport layer.

All of those writes share the `render` step with the compensation transform. The story with the
highest main-thread cost is therefore also the story most likely to expose the desync — the two
are causally linked, not coincidental.

## Other Desync Sources

- **Mobile `dvh`**: when the URL bar collapses, `measure()` re-reads `viewportHeight` and
  `sectionHeight` and the whole remap curve shifts. The native sticky layout changes too, but
  through the other pipeline.
- **iOS momentum scrolling**: the compositor keeps producing frames over a longer window than the
  main thread can commit, so the desync lasts more than one frame.

## Candidate Solutions

1. **Move the remap onto the compositor.** Drive the child layer with a scroll-driven animation
   (`ViewTimeline` plus `element.animate()`), with keyframes sampled from
   `getRemappedStickyDisplacement`. Both the sticky offset and the compensation then live on the
   compositor and cannot desync by construction. Native scroll, native accessibility, no
   main-thread budget dependency. Needs a fallback for browsers without scroll-driven animation
   support (Chromium shipped it in 115; Safari and Firefox followed much later).

   The progressive text can stay in JS: a lagging reveal has no spatial reference to betray it,
   because nothing in the frame tells you which grapheme _should_ be lit. Geometry is the only
   thing that needs to be frame-exact.

2. **Flatten both pipelines onto the main thread.** Take over scrolling so the CSS side is also
   driven from a main-thread-written scroll offset. This is the Lenis path — see below.

3. **Reduce slope sensitivity.** Raising `DRIFT_VELOCITY` or lengthening
   `TRANSITION_VIEWPORT_RATIO` lowers the `0.574` peak, and the error falls linearly with it. It
   does not fix the desync, and it weakens the corner removal that justifies the component.

4. **Cut per-frame cost.** Replace the per-grapheme `color` animation with a paragraph-level
   `background-clip: text` gradient mask: a handful of property writes per frame instead of ~580.
   This does not fix the desync either, but it removes the main cause of the dropped frames that
   expose it — and it is a prerequisite for solution 2, not an optional extra.

5. **Not a solution: JS-driving only the sticky layer.** Replacing `position: sticky` with a
   JS-written transform on the same element does not unify anything. The surrounding page — the
   placeholders, the scroll rulers — still scrolls on the compositor, so the desync just moves
   from "pinned layer versus viewport" to "pinned layer versus page".

## The Lenis Path

`useLenisSmoothScroll` implements solution 2. Lenis intercepts wheel and touch input, integrates
its own target offset, and calls `window.scrollTo()` from a frame callback. The document scroll
position becomes a main-thread-written value, so `position: sticky` and the compensation transform
read the same number in the same frame. Failure mode changes from "the pinned layer slips 29px
against the viewport and snaps back" to "the whole page pauses for a frame" — uniform latency,
which is an order of magnitude more forgiving perceptually.

Two things have to be right or it does not help:

- **Real scroll only.** Lenis must run in its native-scroll mode. In the older
  translate-the-wrapper approach the document never scrolls, and `position: sticky` stops working
  entirely.
- **One frame loop.** With `autoRaf: true`, Lenis and Motion own separate `requestAnimationFrame`
  callbacks and registration order decides whether Motion reads this frame's scroll offset or the
  previous one — while the end-of-frame sticky layout always uses the new one. That is a
  systematic one-frame lag. It is a gentler artifact than the original (smooth velocity, no
  discontinuity, equivalent to evaluating the curve at `s - Δs`) but there is no reason to keep
  it. So we pass `autoRaf: false` and advance Lenis from Motion's `setup` step, which runs before
  every `read` job in the same frame, including the `useScroll` measurement.

## What Lenis Costs

- **Scrolling joins the main-thread critical path.** The 290 `color` writes previously only made
  the compensation late; with Lenis they stall the entire page. Solution 4 becomes mandatory.
- **The lerp does not bound the per-frame error.** At the default `lerp: 0.1` with 2000px left to
  travel, a single frame moves 200px — more than a native wheel notch. Smooth does not mean small.
- **Native scroll behaviour is replaced**: scrollbar dragging, keyboard paging, find-in-page
  scrolling, and anchor jumps all now go through Lenis. `prefers-reduced-motion` users should not
  get hijacked scrolling at all, so the scene bails out of both the remap and Lenis in that case.
- **Touch is the weak spot.** Only `syncTouch` puts touch scrolling on the same pipeline, and it
  costs the native rubber-band and URL-bar behaviour. Leaving it off — the usual choice — means
  mobile keeps the original problem, on top of the `dvh` geometry shifts.

Net: Lenis is the right tool if changing the scroll feel is itself desirable. If the only goal is
removing the hitch, solution 1 is more targeted and has a higher robustness ceiling.

## Stories

| Story                          | Demonstrates                                                          |
| ------------------------------ | --------------------------------------------------------------------- |
| `NativeSticky`                 | Baseline. `y` is `0`, so there is no desync channel at all.           |
| `SmoothRemap`                  | The remap, with the two-pipeline desync exposed at pin/unpin.         |
| `SmoothRemapWithLenis`         | Same remap, scroll flattened onto the main thread.                    |
| `SmoothRemapWithColor`         | Adds 290 per-frame `color` writes, which makes dropped frames likely. |
| `SmoothRemapWithColorAndLenis` | Same, under Lenis — where that paint cost stalls the page instead.    |

Comparing `NativeSticky` and `SmoothRemap` at the same scroll velocity isolates the desync from
ordinary jank: only the second has a stale-transform path.
