# Tab bar design decision registry

This registry makes individual decisions discoverable across the architecture notes. Each linked note
contains the rationale, current implementation, and evidence boundary. Entries describe the current
contract; observed browser numbers are examples, not new universal constants.

## Layout and identity

| Decision                                                             | Reason                                                                           | Detail                                                |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Host owns stable IDs, logical order, and active-tab replacement      | Presence identity must survive motion without duplicating the host list.         | [Integration](../README.md)                           |
| Measure an invisible flex row with the final logical tab count       | Entering zero widths and retained exits must not feed destination sizing.        | [Final layout](./final-layout-measurement.md)         |
| Read CSS bases and spacing instead of duplicating them in JavaScript | CSS remains the sizing source, including fractional browser layout.              | [Sizing tokens](./final-layout-measurement.md)        |
| All titles share a base width; tabs can shrink to zero               | Title length does not change tab allocation or create a min-content floor.       | [Final layout](./final-layout-measurement.md)         |
| Resolve all destinations before starting changed springs             | A new tab grows directly to its compressed destination while survivors compress. | [Measurement ordering](./final-layout-measurement.md) |
| Observe the independent target row                                   | Animated footprints cannot invalidate their own targets.                         | [Measurement ordering](./final-layout-measurement.md) |
| Each tab owns its leading gap; the add button owns its own gap       | Entry and exit can collapse width and adjacent space together.                   | [Footprints](./presence-and-footprints.md)            |
| Logical close precedes visual removal                                | Surviving destinations can be computed while the removed tab still collapses.    | [Presence](./presence-and-footprints.md)              |
| Remove only after width and gap are both zero, checked after render  | Avoid leftover space, early unmount, and arbitrary exit timeouts.                | [Presence](./presence-and-footprints.md)              |

## Animation clocks and lifecycle

| Decision                                                              | Reason                                                                             | Detail                                            |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------- |
| Use angular frequency 25 and damping ratio 1                          | Shared physical response with explicit pixel/velocity handoff.                     | [Physics](./spring-parameters.md)                 |
| Preserve absolute footprint and analytic generator velocity           | Rapid retargets retain position and momentum at each playback rate.                | [Handoff](./spring-parameters.md)                 |
| Publish targets synchronously, start in preRender                     | Consecutive operations see current intent; handoff samples the shared frame.       | [Batch timing](./animation-batch-timing.md)       |
| Coalesce pending targets to the latest one                            | Several changes before a frame need only one physical start.                       | [Spring lifecycle](./spring-lifecycle.md)         |
| Keep unchanged targets' existing clocks                               | Observation and re-render do not invent animation intent.                          | [Spring lifecycle](./spring-lifecycle.md)         |
| Apply playback speed before rounding the new frame origin             | Speed rebasing must not undo elapsed-millisecond clock alignment.                  | [Spring lifecycle](./spring-lifecycle.md)         |
| Guard completion by the still-owned animation identity in a microtask | An old completion cannot clear a replacement created in the same frame.            | [Completion ownership](./spring-lifecycle.md)     |
| Clear pending state and cancel queued starts before jump or stop      | Deferred work cannot restart after resize, reduced motion, or cleanup.             | [Cancellation](./spring-lifecycle.md)             |
| Skip a zero-distance start only if the value is inactive              | A moving value at its new destination can still have meaningful velocity.          | [Spring lifecycle](./spring-lifecycle.md)         |
| Keep + in normal flow                                                 | Its location reflects the real row budget rather than independent compensation.    | [Batch timing](./animation-batch-timing.md)       |
| Allow small rest and CSS quantization residues                        | Controller conservation and painted fractional geometry have different tolerances. | [Numerical evidence](./animation-batch-timing.md) |
| Resize immediately interrupts every width/gap spring                  | The row follows current container constraints without spring lag.                  | [Animation intent](./animation-intent.md)         |
| Width changes win over concurrent tab changes                         | One layout pass must apply a consistent immediate resize policy.                   | [Change reasons](./animation-intent.md)           |
| Reduced motion and initial mount use immediate layout                 | Final geometry appears before paint without an entrance transition.                | [Animation intent](./animation-intent.md)         |

## Closing and pointer intent

| Decision                                                             | Reason                                                                    | Detail                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------- |
| Close budgets use destination widths                                 | Fast consecutive closes should not depend on the current animation frame. | [Close targets](./close-targets.md)                |
| Preserve survivor widths when a right neighbor exists                | The next close target moves into the closed tab's destination edge.       | [Middle closes](./close-targets.md)                |
| Tail closing redistributes the old tab span, including internal gaps | Preserve the tail edge while the base-size cap permits.                   | [Tail closes](./close-targets.md)                  |
| Cap expansion at each tab's base size                                | Cursor preservation cannot enlarge tabs beyond their natural capacity.    | [Close targets](./close-targets.md)                |
| Snapshot close widths only during holding or waiting                 | Keyboard closes outside hover do not invent pointer intent.               | [Hover hold](./hover-hold.md)                      |
| New tabs inherit held compression even with free space               | A held close-friendly layout persists across insertion.                   | [Held destinations](./final-layout-measurement.md) |
| Held widths are caps under the current natural constraint            | More tabs or a smaller container can still compress further.              | [Held destinations](./final-layout-measurement.md) |
| Hover covers occupied tabs, gaps, and the add rectangle              | Empty container space and diagnostic controls do not extend the hold.     | [Hover region](./hover-hold.md)                    |
| Release 500 ms after leave; return cancels the whole timer           | Every later leave gets a full delay.                                      | [Hover hold](./hover-hold.md)                      |
| Close does not synthesize leave or renew waiting                     | Keyboard use does not move the pointer or change the original deadline.   | [Hover hold](./hover-hold.md)                      |
| Resize retains held caps, hold status, and the deadline              | Hover intent outlives spring interruption.                                | [Hover and resize](./hover-hold.md)                |

## Close-slot and title geometry

| Decision                                                                                  | Reason                                                                              | Detail                                             |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------- |
| Numeric capacity reproduces title-first, then close compression                           | X stays centered when the tab is narrower than the close basis.                     | [Close-slot flex](./close-button-layout.md)        |
| The X keeps its SVG size and can be clipped                                               | Compression changes capacity without deforming the icon.                            | [Close-slot flex](./close-button-layout.md)        |
| Entrance freezes min(close basis, final tab width)                                        | Its slot represents the destination, not a transient zero-width tab.                | [Entrance slot](./close-button-layout.md)          |
| Exit freezes current numeric close capacity once                                          | Closing clips the existing slot rather than repeatedly recentering it.              | [Exit slot](./close-button-layout.md)              |
| Use justify-end for overflowing fixed slots                                               | Right-edge anchoring persists after title width reaches zero.                       | [Right-edge anchoring](./close-button-layout.md)   |
| Restore ordinary capacity on width completion, not gap completion or a threshold crossing | Presence geometry and ordinary compression have explicit ownership.                 | [Close-slot transitions](./close-button-layout.md) |
| Immediate resize/reduced motion ends the entry phase                                      | A final-state jump also restores normal flex geometry.                              | [Close-slot transitions](./close-button-layout.md) |
| Clip text directly; keep padding inside the viewport                                      | The clipping edge reaches the separator without ellipsis or an outer padding inset. | [Title clipping](./title-clipping.md)              |
| Detect overflow in JavaScript and expose a boolean data attribute                         | CSS applies the fade only to real visible overflow.                                 | [Overflow detection](./title-clipping.md)          |
| Fade the last 20 px from 100% to 50% opacity                                              | Indicate clipped text while preserving separate icon and stroke layers.             | [Title mask](./title-clipping.md)                  |
| One tab outline and one inset 1 px separator own idle strokes                             | Nested translucent borders must not thicken or darken shared edges.                 | [Strokes](./strokes-and-focus.md)                  |

## Geometry, interaction, and presentation

| Decision                                                                | Reason                                                                                            | Detail                                                  |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Keep CSS flex measurement for destination allocation                    | Preserve fractional distribution and CSS sizing ownership.                                        | [Numeric geometry](./numeric-geometry.md)               |
| Probe close basis outside flex allocation                               | Read declared capacity without adding a footprint or gap.                                         | [Numeric geometry](./numeric-geometry.md)               |
| Store one final geometry snapshot after measurement                     | Semantic controls move before springs; equality avoids redundant state updates.                   | [Numeric geometry](./numeric-geometry.md)               |
| Use prefix sums of numeric width/gap/capacity for painted hits          | Animated DOM size must not become a second geometry source.                                       | [Numeric geometry](./numeric-geometry.md)               |
| Read presentation DOM order, not Map insertion order                    | AnimatePresence places retained exits among survivors.                                            | [Numeric geometry](./numeric-geometry.md)               |
| Render semantic labels by stable ID, not snapshot array index           | Intermediate measured snapshots cannot mislabel a removed/reordered tab.                          | [Numeric geometry](./numeric-geometry.md)               |
| Keep one native button tree at final layout                             | Immediate next-target input with one keyboard/accessibility owner.                                | [Semantic ownership](./interaction-and-presentation.md) |
| Paint noninteractive aria-hidden divs and icons                         | Visual motion does not duplicate input, focus, or announcements.                                  | [Semantic ownership](./interaction-and-presentation.md) |
| Accept both final and visibly clipped X positions                       | Moving presentation remains actionable while final targets are ready.                             | [Arbitration](./interaction-and-presentation.md)        |
| Final X wins cross-ID overlap; visible X wins over title                | Resolve conflicting actions deterministically and preserve fast close intent.                     | [Arbitration](./interaction-and-presentation.md)        |
| Final/painted add aliases follow X and precede titles                   | Moving + stays actionable without stealing a close target.                                        | [Arbitration](./interaction-and-presentation.md)        |
| Keep half-open positive-width rectangles and inactive gaps              | Shared edges have one owner; clipped overflow cannot become an invisible hit target.              | [Numeric geometry](./numeric-geometry.md)               |
| Exclude removed IDs from both semantic and painted input                | Visual lifetime must not extend logical action lifetime.                                          | [Semantic ownership](./interaction-and-presentation.md) |
| Record stable control/ID at pointer down; resolve again on release      | Geometry changes cannot accidentally activate a different target.                                 | [Press lifecycle](./interaction-and-presentation.md)    |
| Route pointer release once; native detail-zero click owns keyboard/AT   | Preserve native activation without duplicate callbacks.                                           | [Press lifecycle](./interaction-and-presentation.md)    |
| Capture primary pointer; cancel on loss, cancellation, or blur          | A press has an explicit resource/input lifetime.                                                  | [Press lifecycle](./interaction-and-presentation.md)    |
| Share presentation hover/press and semantic focus by control/ID         | Pointer feedback stays under the cursor, independently of final action priority.                  | [Shared feedback](./interaction-and-presentation.md)    |
| Read current active ID through context outside presence                 | Retained exits must not preserve stale active/feedback render props.                              | [Shared feedback](./interaction-and-presentation.md)    |
| Use max(final extent, painted extent) for the hover envelope            | Neither useful surface disappears from hold during transition.                                    | [Hover envelope](./hover-hold.md)                       |
| Resolve cached pointer coordinates when footprints change               | Stationary pointer follows painted geometry without synthetic leave.                              | [Stationary pointer](./interaction-and-presentation.md) |
| Keep springs in MotionValues; update React only on control changes      | Geometry refresh must not become a whole-strip frame render loop.                                 | [Scheduling](./numeric-geometry.md)                     |
| Detect pointer hover/pressed only in presentation geometry              | A final hit for another ID must not highlight a visually displaced control.                       | [Feedback ownership](./interaction-and-presentation.md) |
| Keep down-action identity separate from down-feedback identity          | Final-layout input and painted feedback can intentionally name different IDs.                     | [Press lifecycle](./interaction-and-presentation.md)    |
| Clear pointer-pressed paint when it leaves its original painted control | A neighbor must not inherit someone else's held press.                                            | [Shared feedback](./interaction-and-presentation.md)    |
| Apply hover opacity only to text/icon layers                            | Composite content once; opaque currentColor avoids extra alpha at stroke intersections.           | [Shared feedback](./interaction-and-presentation.md)    |
| Explicitly center the title div with flex and give its viewport min-w-0 | Removing the native button's vertical centering must not move text 6 px upward or break clipping. | [Title clipping](./title-clipping.md)                   |
| Match pressed content opacity to hover for now                          | Preserve press/action ownership without a separate active visual treatment.                       | [Shared feedback](./interaction-and-presentation.md)    |

## Input and demonstration

| Decision                                                                | Reason                                                                                      | Detail                                                  |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Own repeat after 400 ms, then every 80 ms                               | Close/navigation cadence does not depend on operating-system repeat settings.               | [Keyboard helper](./keyboard-shortcuts.md)              |
| Repeat Shift+W and arrows, including Option arrows; add once on Shift+T | Navigation/closing support holds without repeated accidental additions.                     | [Bindings](./keyboard-shortcuts.md)                     |
| Ignore native repeats without triggering or renewing timers             | Only the helper's physical-press lifecycle owns repetition.                                 | [Keyboard helper](./keyboard-shortcuts.md)              |
| Refresh callbacks without recreating the helper                         | Repeated closes use the latest active tab while retaining the hold clock.                   | [Keyboard lifecycle](./keyboard-shortcuts.md)           |
| Stop on release, modifier change, composition, blur, and cleanup        | Repetition ends when its input owner or chord is lost.                                      | [Keyboard lifecycle](./keyboard-shortcuts.md)           |
| Keep exact modifiers and defaultPrevented ownership                     | Competing controls can consume their shortcuts without accidental TabBar dispatch.          | [Input scope](./keyboard-shortcuts.md)                  |
| Display status, size, and space independently                           | Hover intent, base-size compression, and free room are different facts.                     | [Instrumentation](./stories-and-instrumentation.md)     |
| Classify size/space from resolved destinations with a 1 px tolerance    | Labels reflect the change immediately rather than tracking entrance width.                  | [Instrumentation](./stories-and-instrumentation.md)     |
| Expose four playback rates through shared controls and Storybook args   | Inspect motion without resetting list/selection or slowing input timers.                    | [Stories](./stories-and-instrumentation.md)             |
| Show waiting without a countdown                                        | Reveal implicit intent without adding time-dependent diagnostic UI.                         | [Stories](./stories-and-instrumentation.md)             |
| Reveal the existing final semantic row through a story-only toggle      | Compare final hit targets with moving paint without duplicate controls or production state. | [Interaction overlay](./stories-and-instrumentation.md) |
| Use blue selection and amber close/add debug rectangles                 | Explain target ownership while keeping presentation hover/press foreground-only.            | [Interaction overlay](./stories-and-instrumentation.md) |

The [behavior contracts](./behavior-contracts.md) map outcomes to evidence. The
[verification guide](./verification.md) distinguishes unit regressions, source-derived behavior, and
session browser observations. Neither this registry nor the display labels add production state.

[Architecture index](../README.md)
