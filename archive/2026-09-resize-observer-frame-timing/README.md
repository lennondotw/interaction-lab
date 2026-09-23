# resize observer frame timing: does a measured size have to be a frame late?

The SDF edge-trace studies painted their first frame at the wrong size: 512 CSS px, then
the real column width a frame later (343px on a phone). They sized themselves from
`@react-hookz/web`'s `useMeasure`, and the easy conclusion is that ResizeObserver is
simply late. It is not, and the question is which of the steps between "the box changed"
and "the pixels show it" actually costs the frame.

## the platform

Part 1 builds its own page, no React, and records in which frame each thing happens. The
earliest frame that could show a change is the next one for a change made in a task, and
the same one for a change made inside `requestAnimationFrame`:

| size changed in | consumer writes     | observer callback | change painted |
| --------------- | ------------------- | ----------------- | -------------- |
| a task          | inside the callback | same frame        | same frame     |
| a task          | in the next rAF     | same frame        | **+1 frame**   |
| a rAF callback  | inside the callback | same frame        | same frame     |
| a rAF callback  | in the next rAF     | same frame        | **+1 frame**   |

Chromium through Playwright. The same page run in Safari 27 through `safaridriver --mcp`
gave the same order in both cases: `change → raf → ro → painted` within one frame.

So a ResizeObserver callback always runs after layout and before paint in the frame the
size changed. The frame is lost by whoever defers the write. `useMeasure` routes its entry
through `useRafCallback`, and React then renders that state update asynchronously, so its
first size lands one to two frames after the one that needed it.

The other half is the frame order itself: **rAF callbacks run before layout**. A canvas
redrawn from rAF has already drawn the frame at the old size by the time layout and the
observer learn the new one, however promptly the observer's result is committed.

## the stories

Part 2 drives the real stories and reads each surface's CSS width and canvas bitmap in a
task posted from rAF, which runs after the frame is painted.

First painted frame after mount (CSS px, bitmap in CSS px at DPR 2):

| story            | before, 1440 / 375                     | after, 1440 / 375              |
| ---------------- | -------------------------------------- | ------------------------------ |
| clip-and-outline | 512 → 520 / 512 → 343                  | 520 / 343                      |
| on-canvas        | 512 → 520 / 512 → 343, bitmap likewise | 520 / 343, bitmap from frame 1 |
| svg-path         | 512 → 520 / 512 → 343, bitmap likewise | 520 / 343, bitmap from frame 1 |
| rect-field       | overlay 1 → 680 / 1 → 343              | 680 / 343, bitmap from frame 1 |

rect-field's overlay also changed its _content_ one frame after mount, with the size and
bitmap already right. That was not timing: an effect meant to hand layout back when
autoplay stops also ran on mount and deleted the `gap` React had written through the style
prop, which React never rewrites. The first frame traced the laid-out 24px gap, the next the
collapsed 0px one, while the Gap control still said 24. Autoplay now owns only the inline
`gap` and widths, React owns only a `--row-gap` variable the class reads, and the loop's own
layout-effect cleanup removes the inline properties; the first frame is the final one.

Live resize, 520 → 400px wide in 21 steps, painted frames showing a stale size:

| story            | before: box behind column | after: box behind column | after: bitmap behind box |
| ---------------- | ------------------------- | ------------------------ | ------------------------ |
| clip-and-outline | 40 (≤ 2 in a row)         | 0                        | —                        |
| on-canvas        | 39 (≤ 2 in a row)         | 0                        | 0                        |
| svg-path         | 37 (≤ 2 in a row)         | 0                        | 0                        |
| rect-field       | 40 (≤ 2 in a row)         | 0                        | 20 (1 per step)          |

One sampling trap cost a wrong conclusion here first. A viewport resize arrives as its own
task, and can land between a frame's paint and the sampler; reading layout then reports a
size no frame has painted, which looked like one stale bitmap per few resize steps. The
resize steps run before rAF, so the probe compares `innerWidth` in the sampler with the
value it had in rAF and excludes the mismatches instead of counting them. Every one of the
leftover "stale" frames was such a mismatch.

## what was decided

- **A square surface with nothing else to know is sized by CSS.** clip-and-outline uses
  `aspect-square w-full` and an `objectBoundingBox` clip-path, and measures nothing.
- **A surface that needs real pixels uses `useElementSize`** (`lab/src/utils`). It reads
  the content box from computed style synchronously in a layout effect, which commits
  before the first frame's rAF, and commits later ResizeObserver entries with `flushSync`,
  which lands before the frame paints. CSS still sizes the box; the measurement only sets
  canvas resolution and px conversions.
- **A rAF-drawn canvas also repaints in a layout effect when the size changes.** on-canvas
  and svg-path split drawing into a `paint` that draws the last traced state and advances
  nothing, called from rAF after stepping and, through `useEffectEvent`, whenever the
  measured size changes. That repaint runs inside the observer's `flushSync` commit, before
  paint.
- **rect-field keeps one stale bitmap frame per resize step.** Its draw re-traces from the
  shape registry, and the registry learns rect positions from ResizeObservers of its own,
  in no guaranteed order relative to the size. A synchronous redraw could trace rects that
  have not moved yet, a misaligned overlay rather than a stretched one. The box itself is
  now never behind.
