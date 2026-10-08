# Behavior contracts

These contracts distinguish layout destinations, current animation footprints, and pointer holding.
The evidence column identifies the current automated or browser coverage, rather than assuming that
a controller unit test proves its complete DOM integration.

| Trigger                                       | Expected behavior                                                                                                            | Evidence                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Initial mount                                 | Existing tabs and gaps use final widths before paint.                                                                        | Immediate-path spring tests; browser initial layout.           |
| Add without needing compression               | New width and left gap grow from zero toward the base destination.                                                           | Spring and target-width tests; browser entry.                  |
| Add requiring compression                     | Compute every final width first; existing tabs compress as the new tab/gap expands.                                          | Target-width and coordinated spring tests; browser layout.     |
| Add during compressed holding with free space | New tab inherits held compression rather than expanding to the larger natural target.                                        | Target-width tests.                                            |
| Add during natural-size holding               | New tab may remain base size; insertion does not imply compressed size.                                                      | Target-width tests.                                            |
| Repeated additions exhaust held spare space   | Further compression affects both existing and new tabs.                                                                      | Target-width tests.                                            |
| Retarget active motion                        | Retain current absolute footprint and analytic velocity.                                                                     | Spring tests at all four speeds.                               |
| Repeat the same destination                   | Keep the owned animation and its clock.                                                                                      | Spring tests.                                                  |
| Close with a right neighbor during hold       | Survivor widths stay unchanged; the removed width and left gap collapse.                                                     | Close-width tests; browser presence/close target.              |
| Close the tail during hold                    | Preserve the old tab span until the base-size cap prevents expansion.                                                        | Close-width tests.                                             |
| Close outside a hold                          | Use natural post-close destinations; do not create waiting.                                                                  | Hover-controller tests; browser shortcuts.                     |
| Close during waiting                          | Preserve the existing release deadline.                                                                                      | Hover-controller tests.                                        |
| Close before entrance finishes                | Exit inherits current footprint/velocity and retains DOM until width and gap are zero.                                       | Spring tests; browser presence timing.                         |
| Ordinary compression below close basis        | Title reaches zero first; numeric close capacity then shrinks with X centered.                                               | Capacity/geometry tests; browser geometry probe.               |
| Entrance / exit crosses close basis           | Reveal destination-sized entry slot / clip current-sized exit slot; retain right-edge alignment even below its frozen width. | Capacity/geometry tests; browser geometry probe.               |
| Leave and return within 500 ms                | Cancel release; the next leave starts a full new delay.                                                                      | Hover-controller tests; browser hover.                         |
| Any container-width change                    | Interrupt all width/gap springs, including entry and exit, and apply final held/natural layout.                              | Change-reason and immediate spring tests; browser integration. |
| Resize during holding or waiting              | Retain held caps, state, and original deadline; real pointer events still apply.                                             | Browser integration and controller source.                     |
| Reduced motion                                | Apply final footprints immediately, including an unchanged destination still moving.                                         | Immediate spring tests; hook source.                           |
| Change playback speed                         | Preserve animation position/identity/velocity; keep input timers in real time.                                               | Spring tests; browser controls and release delay.              |
| Hold Shift+W or arrows                        | Original action, then 400 ms delay and 80 ms helper repeats; fresh active/list callbacks.                                    | Shared keyboard tests; browser shortcut dispatch.              |
| Hold Shift+T / receive OS repeats             | Add once per physical press; ignore native repeat events.                                                                    | Shared keyboard tests.                                         |
| Title overflows                               | Clip without ellipsis; apply only the title's last-20-px 100%-to-50% mask.                                                   | Browser attribute/visual inspection.                           |
| Idle title/close boundary                     | Paint one 1 px separator without stacked outer strokes.                                                                      | Browser visual inspection.                                     |
| Motion is in progress                         | Story size/space already describe destinations, not temporary widths.                                                        | Browser instrumentation check; target-width source/tests.      |
| Unmount                                       | Stop springs, release keyboard/hover timers, observers, and presence callbacks.                                              | Controller cleanup tests and hook source.                      |

The scheduling contract additionally distinguishes requested destinations from deferred starts:

| Trigger                                                  | Expected behavior                                                                 | Evidence                                                            |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Several targets before a frame                           | Publish the latest intent synchronously; create one start toward it at preRender. | Coalescing spring regression.                                       |
| Old spring completes in the replacement frame            | Keep the replacement owner active and suppress obsolete completion.               | Completion-ownership regression.                                    |
| Immediate update with a queued start                     | Cancel pending start before jumping, including an identical destination.          | Pending/immediate cancellation regression.                          |
| Stop with a queued start                                 | The queued callback cannot create new animation work after cleanup.               | Pending cleanup regression.                                         |
| New width completes before its gap                       | Restore ordinary close capacity; gap does not gate this transition.               | Capacity controller tests and browser probes.                       |
| Current value equals a changed target while still moving | Preserve the handoff's velocity; equality alone cannot declare rest.              | Spring-controller source; no dedicated equality-crossing assertion. |

The separated interaction contract adds these animation-period guarantees:

| Trigger                                                  | Expected behavior                                                                                                     | Evidence                                                       |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Add or close changes destinations                        | One semantic button tree moves to final geometry before paint; painted tree follows springs.                          | Browser addition/rapid-close probes; snapshot source.          |
| Pointer is over final X while paint lags                 | Dispatch the final control ID; hover/pressed follow the painted control under the pointer.                            | Geometry tests; fixed-coordinate browser closes.               |
| Pointer is over visible X outside all final X rectangles | Dispatch the eligible visible ID, bounded by current clipping.                                                        | Geometry tests; browser tiny-entry click.                      |
| Final X overlaps another visible X                       | Final ID wins; visible X otherwise wins over titles.                                                                  | Geometry tests.                                                |
| Logical ID is removed while footprint persists           | No semantic control, action, active stroke, or feedback for that exit.                                                | Geometry tests; browser close/selection checks.                |
| Down and up resolve different control/ID                 | Cancel instead of activating the new target.                                                                          | Stable-hit comparison test; held-click browser check.          |
| Final action X overlaps another painted X                | Final ID receives the action; only the painted ID receives pointer color feedback.                                    | Geometry tests; real held-pointer overlap probe.               |
| Hover or pointer press                                   | Whole text/icon layer opacity changes (70% idle, 100% hover/pressed); color stays opaque and backgrounds transparent. | Browser computed-style check during held pointer.              |
| Title is painted in a div                                | Text line stays centered vertically, including narrow/clipped titles.                                                 | Browser base comparison: -6 px regression, 0 px after fix.     |
| Tab/Space/Enter uses semantic buttons                    | One focus stop per control, painted focus ring, one native activation.                                                | Browser keyboard focus/Space/Enter checks.                     |
| Pointer remains stationary after close                   | Hover follows presentation geometry; hold membership follows the combined envelope.                                   | Browser successive same-coordinate closes; hook subscriptions. |
| Leave, return, wait beyond old deadline                  | Holding persists; next leave starts a new 500 ms deadline.                                                            | Hover controller tests and browser return/expiry checks.       |

See [spring lifetime](./spring-lifecycle.md) for ordering and [the decision registry](./design-decisions.md)
for individual rules across the component.

Automated entry points: [geometry](../__tests__/tab-geometry.test.ts),
[close capacity](../__tests__/tab-close-capacity.test.ts), [springs](../__tests__/tab-spring.test.ts),
[close widths](../__tests__/tab-close-layout.test.ts),
[held widths](../__tests__/tab-target-layout.test.ts),
[hover hold](../__tests__/tab-hover-hold.test.ts),
[layout reasons](../__tests__/tab-layout-change.test.ts), and
[keyboard helper](../../../../../packages/utils/src/__tests__/keyboard-shortcuts.test.ts).

Consecutive closes committed between frames also preserve a full destination's complementary
footprint within spring-rest and CSS rounding tolerances. The spring regression runs all four speeds
with fractional frame times and retained exit identity; see [batch timing](./animation-batch-timing.md).

## Deliberate boundaries

The host owns logical tab updates and active-tab replacement. IDs must remain stable and unique;
structural registrations are required. Cursor stability is a destination policy bounded by base width
and fractional geometry, not an unconditional fixed edge at every interrupted animation frame.
“Natural” hover status does not guarantee uncompressed tab size.

The component does not provide virtualized tabs, a scrolling overflow mode, content-derived tab bases,
editor-aware shortcut routing, or an ARIA tabpanel model. Current browser probes are session evidence;
they are not a persistent TabBar browser regression runner. The
[verification guide](./verification.md) lists how to repeat those checks and their limitations.

[Architecture index](../README.md)
