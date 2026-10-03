# Verification guide

Pure controller tests protect target calculations, spring handoff, and real-time input policy. Real
browser checks are required for flex geometry, clipping, observer ordering, pointer boundaries, and
AnimatePresence removal timing. Keep those kinds of evidence separate.

## Focused automated checks

From the repository root:

```sh
pnpm --filter @monorepo/lab exec vitest run src/components/tab-bar/__tests__
pnpm --filter @monorepo/utils exec vitest run src/__tests__/keyboard-shortcuts.test.ts
```

The [behavior-contract table](./behavior-contracts.md) maps individual mechanisms to test files. These
are controller tests, not snapshots of rendered flex geometry. When changing behavior, run the
relevant focused tests plus required repository type/lint checks. A failure also needs comparison
against the base commit before being called a new regression.

## Timing regression fixture decisions

The [spring suite](../__tests__/tab-spring.test.ts) drives Motion's real `update` and `preRender` queues
in order. Its repeated-close case stages React-like target changes 12 ms after a sampled frame, then
uses fractional frame intervals at all four playback rates. The 12 ms value is an adversarial fixture;
it is not a measured property of React or a production delay.

The fixture keeps old zero-target exits registered to test mixed animation generations, and checks
that destination intent updates before the queued start. Position-only sampling at perfectly aligned
integer times would miss both the original clock-origin defect and elapsed-time rounding differences.
Its 0.04 px conservation allowance comes from forty width/gap values times the 0.001 px rest residue;
this is a unit-fixture bound, not the story's separate 1 px diagnostic classification tolerance.

Coalescing/cancellation checks verify latest-target behavior and the absence of work after immediate
updates or stop. The completion-ownership case advances an old spring to completion in `update`,
starts a replacement in `preRender`, then drains completion microtasks before checking its owner.
These tests exercise actual scheduler and animation behavior; they do not assert private animation
options or rendered CSS pixel equality.

The retained-exit regression fails against the pre-fix implementation at all four rates, while the
base commit's original spring suite passes. Runtime changes are covered separately from documentation
link and formatting checks. The [lifecycle note](./spring-lifecycle.md) explicitly identifies details
that follow source but lack their own named assertion.

## Browser surfaces and observables

Use the locally running Storybook's `Components/Tab bar` stories: Default, Compressed, Empty,
Resizable, and HoverHolds. For the current development session the origin is `http://localhost:6012`;
the port is a launch detail, not a component requirement. An iframe URL can isolate the story:

```text
http://localhost:6012/iframe.html?id=components-tab-bar--hover-holds&viewMode=story
```

Useful observations in a browser probe:

- `[data-tab-target-layout]` and `[data-tab-target]` identify logical destinations; read
  `data-tab-width-target`, computed flex basis, column gap, and available row width.
- `[data-tab-id]` identifies actual tab footprints; inspect width and margin-left over time.
  `[data-exiting]` identifies retained removed tabs, which should be inert.
- `[data-tab-hover-region]` exposes the occupied hover rectangle and `data-hold-state`.
- The close button's rectangle, inline flex basis/shrink, and SVG center distinguish ordinary flex
  compression from a fixed presence slot.
- `[data-overflow]` identifies title masks; `[data-testid="tab-hold-status"]` exposes destination labels.

Measure CSS-pixel rectangles and allow browser fractional quantization rather than treating every
subpixel difference as drift. Sampling a few frames can demonstrate a scenario; it cannot prove the
absence of every possible transient frame.

## Scenarios to repeat

| Scenario                   | Probe and expected result                                                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial layout             | Start HoverHolds at its default 640 px window. Read available row width separately from window width; initial tab widths already equal destinations.                        |
| Coordinated addition       | Set 0.1×, add a tab, and sample old/new widths and gaps. Destination attributes change immediately while the new footprint is still small.                                  |
| Rapid handoff              | Add twice, then close before entry completes. Observe continuous footprints and retained exiting DOM, followed by zero and removal.                                         |
| Middle close               | Keep the pointer in the row and close an interior tab. Survivors retain destinations and the next close target moves into place.                                            |
| Tail close                 | Repeatedly close the last tab. Check total tab span, including internal gaps, until the base cap forces contraction.                                                        |
| Held addition with room    | Middle-close several tabs, then add while still holding. The new destination matches held compression despite available space.                                              |
| Ordinary tiny tabs         | Add enough tabs to go below the 28 px close basis. Title width is zero, close slot fits available width, and X stays centered.                                              |
| Tiny entrance              | At 0.1× add another tiny tab. Close-slot inline basis is its final capacity while the outer footprint is still smaller; release overrides after entry completes.            |
| Exit slot                  | Close a normal and a tiny tab at 0.1×. The close slot retains width and right-edge alignment even below its capacity while outer width/gap collapse, then DOM is removed.   |
| Resize during mixed motion | Start entry, survivor compression, and exit at 0.1×; resize. All present footprints match final targets, gaps settle, exiting zero tabs unmount, and entry overrides clear. |
| Resize during waiting      | Leave to start waiting, resize before 500 ms, and compare the original expiry. Resize must not renew or clear that timer.                                                   |
| Return during waiting      | Leave, return before expiry, wait longer than 500 ms, then leave again. First timer is canceled; second leave gets a full delay.                                            |
| Keyboard and hover         | Dispatch Shift+W while the pointer stays in the row, then outside it. Shortcuts alone must not create leave/waiting; avoid moving the pointer as part of the test.          |
| Helper repeat              | Hold arrows/W past 400 ms, release Shift first, and blur. Check fresh active selection and cancellation. Inject native repeats separately; they add no actions.             |
| Playback control           | Change among 0.1×/0.25×/0.5×/1.0× during motion. Count, selection, and animation position persist; hover release remains 500 ms in real time.                               |
| Title/stroke/focus         | Compare overflowing and fitting titles; inspect masks, inner padding, single separator, outer-edge alpha, active dashed stroke, and keyboard focus outlines.                |
| Reduced motion / cleanup   | Enable the preference, perform add/close, then unmount while a release/repeat is armed. Final layout is immediate and no owned work survives cleanup.                       |

For rapid-close clock coordination, also start twenty tabs at 0.25× and close twelve through Shift+W
while keeping the pointer outside the row. Destinations stay full; sample both raw inline footprints
and the add-button rectangle to distinguish clock drift from fractional CSS layout. The current
[batch-timing regression and browser comparison](./animation-batch-timing.md) cover this case.

## Recorded browser evidence and limits

Development probes on October 3, 2026 confirmed these representative cases:

- A default HoverHolds window had 606 px available row width, eight 67.25 px tab destinations, and
  4 px gaps. Held middle closes left spare room; later additions retained compressed destinations.
- Ordinary tabs around 10 px wide had zero title width and a centered 14 px X clipped by the tab.
  A tiny new tab froze a roughly 9.91 px destination close slot instead of following its near-zero
  entering footprint. Exit retained the captured close-slot width while its tab collapsed. A subsequent
  right-anchor probe confirmed that `justify-end` keeps the close slot aligned with the tab right edge
  even below its frozen capacity, including tiny entry; ordinary compression kept the X centered.
- Resizing during simultaneous slow entrance, compression, and exit settled all present footprints
  and gaps, removed the exiting tab, and cleared the entrance override. Holding remained holding;
  resizing during waiting preserved its original roughly 500 ms expiry.
- Speed changes retained the demo list and slow-motion targets, and the 500 ms release clock remained
  real time. Keyboard closes did not independently manufacture a pointer leave.

These are session probes and visual inspections, not permanent CI browser tests or exhaustive
cross-browser/DPR coverage. The numerical examples depend on the current story chrome and spacing
tokens. Title-mask alpha, stroke uniformity, presence lifecycle, and close-slot geometry need browser
verification again when their implementation changes; pure calculation tests cannot establish them.

[Architecture index](../README.md)
