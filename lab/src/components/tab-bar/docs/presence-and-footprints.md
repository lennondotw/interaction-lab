# Presence and footprint ownership

A tab owns two animated pixel footprints: its width and the gap on its left. Keeping these in normal
flow lets neighboring tabs and the add button move through layout, without scaling their contents.

## Leading space belongs to the tab

The visible row has no CSS `gap`. Each [AnimatedTab](../animated-tab.tsx) uses animated `marginLeft`.
The first tab targets zero gap; other tabs target the measured gap. A new tab starts with width and
leading gap both zero, then expands them together with the same spring parameters. The add button
owns a separate gap spring: its destination is one gap for a nonempty row and zero for an empty row.

This ownership also makes removal unambiguous. The removed tab's width and its own left gap collapse
together. The surviving first tab can retarget its gap to zero when the old first tab disappears.
There is no leftover fixed flex gap after an item reaches zero width.

## Logical removal precedes visual removal

The host removes an ID from `tabs` immediately. `AnimatePresence initial={false} mode="sync"` retains
its visual tab in flow while the hidden sizing row already represents the post-close logical list.
All surviving width destinations and the exiting zero-width/zero-gap destinations are established
together. Initial tabs skip entrance; tabs added later start from zero.

The [footprint hook](../use-tab-footprint.ts) uses `usePresence` to release the retained tab only when
both MotionValues equal zero. Width/gap changes schedule this check in Motion's `postRender` phase,
so the zero styles are painted into the DOM before the presence hold is released. An initial check
also covers a tab closed before its first entering frame and immediate reduced-motion/resize updates.
Removal has no fixed timeout and is not tied to the hover delay.

Exiting tabs are marked `data-exiting` in the aria-hidden, noninteractive painted tree. Their semantic
buttons are removed immediately, and hit arbitration excludes their IDs, preventing actions and focus
on a tab that the host has already removed. Current active/feedback context also excludes exits. Cleanup cancels queued removal checks, unsubscribes listeners, removes the
footprint registration, and stops its width/gap springs.

## Consecutive operations retain identity

Stable ID keys retain existing MotionValues across additions, closes, and selection changes. A growing
tab can be closed before it finishes entering: it starts its exit from its current width and velocity,
not from its prior destination or zero. Incoming positive velocity can briefly continue growth after
the close request; this follows the [handoff contract](./spring-parameters.md).

The close icon has a separate [presence geometry policy](./close-button-layout.md). The tab footprint
continues to animate real layout width; there is no general FLIP transform or content-scale animation.

Verification: [spring tests](../__tests__/tab-spring.test.ts) cover simultaneous expansion/compression,
width/gap collapse, and growing-to-exiting handoff. Presence timing, input exclusion, and zero-before-
unmount behavior require the browser scenarios in the [verification guide](./verification.md).

[Architecture index](../README.md)
