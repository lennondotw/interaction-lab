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
  `[data-exiting]` identifies retained removed tabs, which must have no semantic control or hit eligibility.
- `[data-tab-hover-region]` exposes the occupied hover rectangle and `data-hold-state`.
- `[data-tab-interaction-row] [data-tab-action]` identifies the sole semantic button tree at final
  positions. `data-tab-owner` maps controls to stable IDs.
- `[data-tab-presentation-control]` identifies painted title/close/add divs; measure their widths,
  right edge, SVG center, and clipped intersection with `[data-tab-id]`.
- `data-hovered`, `data-pressed`, and `data-focus-visible` expose shared feedback, independent of the
  painted element's own CSS hover/focus. `data-active` marks current selected paint, excluding exits.
- `[data-overflow]` identifies title masks; `[data-testid="tab-hold-status"]` exposes destination labels.

Measure CSS-pixel rectangles and allow browser fractional quantization rather than treating every
subpixel difference as drift. Sampling a few frames can demonstrate a scenario; it cannot prove the
absence of every possible transient frame.

## Scenarios to repeat

| Scenario                   | Probe and expected result                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial layout             | Start HoverHolds at its default 640 px window. Read available row width separately from window width; initial tab widths already equal destinations.                      |
| Coordinated addition       | Set 0.1×, add a tab, and sample old/new widths and gaps. Destination attributes change immediately while the new footprint is still small.                                |
| Rapid handoff              | Add twice, then close before entry completes. Observe continuous footprints and retained exiting DOM, followed by zero and removal.                                       |
| Middle close               | Keep the pointer in the row and close an interior tab. Survivors retain destinations and the next close target moves into place.                                          |
| Tail close                 | Repeatedly close the last tab. Check total tab span, including internal gaps, until the base cap forces contraction.                                                      |
| Held addition with room    | Middle-close several tabs, then add while still holding. The new destination matches held compression despite available space.                                            |
| Ordinary tiny tabs         | Add enough tabs to go below the 28 px close basis. Title width is zero, close slot fits available width, and X stays centered.                                            |
| Tiny entrance              | At 0.1× add another tiny tab. Close-slot numeric width is its final capacity while the outer footprint is still smaller; resume ordinary capacity after entry completes.  |
| Exit slot                  | Close a normal and a tiny tab at 0.1×. The close slot retains width and right-edge alignment even below its capacity while outer width/gap collapse, then DOM is removed. |
| Resize during mixed motion | Start entry, survivor compression, and exit at 0.1×; resize. All present footprints match final targets, gaps settle, exiting zero tabs unmount, and entry phase ends.    |
| Resize during waiting      | Leave to start waiting, resize before 500 ms, and compare the original expiry. Resize must not renew or clear that timer.                                                 |
| Return during waiting      | Leave, return before expiry, wait longer than 500 ms, then leave again. First timer is canceled; second leave gets a full delay.                                          |
| Keyboard and hover         | Dispatch Shift+W while the pointer stays in the row, then outside it. Shortcuts alone must not create leave/waiting; avoid moving the pointer as part of the test.        |
| Helper repeat              | Hold arrows/W past 400 ms, release Shift first, and blur. Check fresh active selection and cancellation. Inject native repeats separately; they add no actions.           |
| Playback control           | Change among 0.1×/0.25×/0.5×/1.0× during motion. Count, selection, and animation position persist; hover release remains 500 ms in real time.                             |
| Title/stroke/focus         | Compare overflowing and fitting titles; inspect masks, inner padding, single separator, outer-edge alpha, active dashed stroke, and keyboard focus outlines.              |
| Reduced motion / cleanup   | Enable the preference, perform add/close, then unmount while a release/repeat is armed. Final layout is immediate and no owned work survives cleanup.                     |

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

October 8, 2026 refactor probes in the in-app browser additionally confirmed:

- A fresh eight-tab page had 17 semantic buttons and zero painted buttons, with eight 67.25 px
  footprints before interaction. During 0.1× addition, a new tab was about 5.90 px wide while its final
  close button already had 28 px capacity. Painted slot capacity also remained 28 px, clipped by the
  smaller footprint rather than recentered.
- Closing tab 2 immediately removed its semantic controls; final tab 3 became immediately actionable under the
  stationary pointer. With presentation-only feedback, tab 3 highlights only when its visible X
  reaches that coordinate. Two subsequent clicks at that same final coordinate closed tabs 3 and 4 while
  earlier exits remained. A visible entering-X alias at x≈405 was actionable even though its final
  close rectangle began at x≈445; it removed that new ID exactly once.
- Tab focus on a close button produced one matching painted focus ring. Space removed exactly one
  tab. Shift+W retained holding and immediately updated current active paint; no exit kept active
  styling. Resize during entry/exit settled survivors at their targets, removed exits, and retained
  holding. A 700 ms held pointer click across a moving alias canceled without closing any tab, and
  cleared pressed feedback.
- With forty tabs in the same 640 px window, ordinary capacity was 10.25 px, title width zero, and
  X center offset zero. A 9.40 px exiting footprint kept capacity 10.25 px and right-edge offset zero.
  A new tiny footprint around 0.95 px had target capacity 10.25 px from the start.
- Leaving showed waiting; returning before expiry canceled it and holding persisted beyond the old
  deadline. Leaving again reached natural after a fresh real-time delay. These actions physically
  moved the pointer; shortcut checks did not.
- A fresh twenty-tab page at 0.25× handled a 1.3 s Shift+W hold through the helper (seven survivors,
  thirteen retained exits at the sampled point). Sampled painted + left changed from 619 to 618.875 px,
  consistent with fractional CSS quantization rather than independent + compensation. This is a
  point sample, not an exhaustive maximum-drift trace. The existing four-rate spring conservation
  suite still supplies the continuous numeric regression evidence.

The feedback correction was verified against an actual base-commit component copied temporarily into
a separate local story (then removed). Base text-line center offset was 0 px; the first div-based
version was -6 px. Explicit flex centering and a `w-full min-w-0` clipping viewport restored 0 px.
The first foreground-color treatment returned transparent background and foreground alpha 0.5
while pressed; it was superseded by the content-layer opacity policy below.
In a slow-animation overlap at x≈240.69, painted tab 3 owned both hover and pressed feedback while
native focus/action belonged to tab 4; release removed tab 4 and retained tab 3. This validates the
intentional separation of feedback hit testing from action arbitration in a browser, beyond the
corresponding pure geometry tests.

The subsequent opacity correction moves alpha from inherited color to the entire title/SVG layer.
Colors (including SVG currentColor) are fully opaque. Only content changes opacity: 0.7 idle, 1.0
hover, 1.0 pressed. Parent slots, divider, frame, and focus outline are not dimmed. Pressed state still
exists for action/capture ownership, but has no separate visual treatment at this stage. Recheck
computed color/opacity during an actual held pointer, not just the class names. The correction probe
confirmed title and X idle opacity 0.7 with fully opaque color, held-X opacity 1, hovered-title opacity
1, idle + opacity 0.7, and parent-slot opacity 1 throughout. Backgrounds stayed transparent and the
title center offset remained 0 px.

Repeat input-specific checks in addition to the original scenarios: final X during lag, visible X
outside the final close region, ambiguous cross-ID overlap, press/release moving to a different
control, native Space/Enter, focus-visible paint, and stationary hover after removal. The new pure
capacity suite uses Motion's actual owned animation completion; geometry tests do not simulate
browser pointer capture or accessibility events. Fresh-load console checks distinguish runtime
failures from Fast Refresh errors during an intermediate hook-signature edit.

These are session probes and visual inspections, not permanent CI browser tests or exhaustive
cross-browser/DPR coverage. The numerical examples depend on the current story chrome and spacing
tokens. Title-mask alpha, stroke uniformity, presence lifecycle, and close-slot geometry need browser
verification again when their implementation changes; pure calculation tests cannot establish them.

## Release validation on October 8, 2026

Before batching the refactor for review, the full Lab suite passed 49 files / 690 tests and the shared
utilities passed 4 files / 59 tests. The Lab total includes 72 TabBar controller/geometry tests: the
new capacity and geometry suites add 25 cases to the existing 47. Repository typechecking,
type-aware lint, formatting, package-field ordering, and diff whitespace checks passed.

The story-only overlay and its explanatory legend are covered by the browser evidence in
[stories and instrumentation](./stories-and-instrumentation.md). The final legend keeps the neutral
text's lightness with chroma 0.06; the earlier 0.025 trial was too close to gray. This is a visual
explanation choice, independent of hit targets, feedback opacity, or animation state.

Pull-request and post-merge CI remain separate from these local results; their GitHub runs provide
the build, chat-contract, and deployment records for the shipped commit.

[Architecture index](../README.md)
