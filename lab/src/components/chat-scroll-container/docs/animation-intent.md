# Animation intent and natural reflow

An existing bubble should rewrap immediately when its container changes width. A new message should
still enter smoothly, including when insertion and resizing overlap.

## Separate intent from measurement

The list model declares animation work through committed item changes: insertion, explicit content
edits, and changes to owned gaps. The insertion manager measures affected bodies and animates their
temporary footprints. A ResizeObserver reports geometry; it does not create animation intent.

| Change                                     | Settled row                                                 | Already animating row                            |
| ------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------ |
| Container reflow, image load, or font load | Accept natural dimensions and refresh the measurement cache | Update the existing animation's target           |
| Explicit content or gap change             | Animate from the cached footprint when dimensions change    | Retarget from the current footprint and velocity |
| New item                                   | Create an entrance slot                                     | Not applicable                                   |

This avoids guessing why a ResizeObserver fired. Browser-driven reflow stays responsive and does not
turn settled history into hundreds of new springs. Asynchronous content that needs animated growth
must express that change through the item model rather than relying on observation alone.

## Preserve work already in progress

Active slots temporarily fix their widths. On a viewport width change, release those widths to measure
the new wrapping while keeping their current heights in place. Releasing height during measurement
could briefly shrink the scroll range and clamp the reader's position.

A changed height or gap target inherits the current footprint and velocity. If those targets are
unchanged, refresh geometry without restarting the spring clock. Completion removes temporary
overrides and returns the row to natural layout. Stable rows need no fixed-width reset or per-row
animation; CSS reflows them and the observer refreshes their cached measurements.

Scroll ownership remains separate. Natural reflow still notifies the scroll controller, and detached
reading uses the [reading anchor](./reading-anchor.md). Skipping a bubble animation does not mean
skipping position compensation.

## Verification and boundaries

The [resizable-window regression](../../../../../scripts/test-chat-resize-window.mjs) checks that
settled bubbles remain idle through repeated width changes, while an active insertion continues and
finishes at its new natural size. The [layout-transaction regression](../../../../../scripts/test-chat-layout-transactions.mjs)
checks that a later explicit edit animates from the refreshed baseline.

The observer watches intrinsic bodies, not animated slots, so slot growth cannot invalidate its own
target. Width changes can still require browser layout and observer delivery across all mounted rows;
this policy avoids unnecessary animations, not the cost of reflow or the need for future virtualization.

Implementation: [insertion manager](../chat-insertions.ts). Related design:
[local invalidation](./local-invalidation.md) and [layout slots](./layout-slots.md).

[Architecture index](../README.md)
