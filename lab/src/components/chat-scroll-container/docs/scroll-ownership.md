# Scroll ownership and browser clamping

A decreasing `scrollTop` is not necessarily a user's upward scroll. Shrinking content can force the browser to the new bottom boundary.

## Decision and why

Layout callbacks and native scroll events consume one observation cursor containing position, bottom, and fractional content/viewport dimensions. Every programmatic write immediately records the actual rounded or clamped result. A later scroll event then has no unobserved movement to reinterpret.

Classify upward movement as a layout clamp only when the scroll range shrank and the resulting position is within 1px of the new bottom. Fractional measurements catch shrinkage hidden by integer `scrollHeight`. This tolerance is distinct from the configurable follow zone.

Reconcile observations before updating target caches or taking early returns, including during catch-up. Otherwise a layout callback can erase the evidence of shrinkage before its queued scroll event arrives. That can detach following and leave a flight waiting for handoff indefinitely.

Layout changes do not excuse all simultaneous scrolling: movement away from the new boundary remains user-controlled. Explicit wheel, opt-in pointer, and keyboard interruption still takes priority. No suppression timer or per-message exemption is needed.

Repeated observer notifications for already-applied geometry should not start a second scroll animation. Explicit layout ticks must still reconcile fractional movement even when integer height has not changed.

## Evidence

- Implementation: [observeScroll, write, and layoutChanged](../../scroll-anchor/scroll-anchor-controller.ts).
- History: [3a0587f](https://github.com/lennondotw/interaction-lab/commit/3a0587f); later changes are reflected in the current implementation.
- Validation: [relevant checks](./verification.md#scrolling-and-composer).

[Architecture index](../README.md)
