# Composer measurement and bottom clearance

The composer owns editing geometry; the story connects that geometry to list clearance and sending. `ChatScrollContainer` does not contain a composer or automatically install the flight hook.

## Decision and why

The textarea resets its height and reads `scrollHeight` on input, controlled-value updates, and width changes. The composition uses `useChatComposerSpace` to measure the complete composer form after textarea layout effects and on observed size changes. Its `bottomSpace` value supplies the form height plus the requested gap. `ChatScrollContainer` renders an independent trailing spacer after all items and typing, replacing its default bottom padding. This presentation-only row is not a message and does not affect grouping.

Initial bottom positioning occurs on the scroll controller's first observer delivery, after layout effects and composer clearance are available. It writes the bottom before paint without a catch-up animation. Later composer resizing tracks the current bottom immediately while following; active catch-up receives a new target, while detached reading preserves its position within the available range.

Sending captures the source box before appending and clearing the draft. The demo's Send button first fills the textarea, then uses two animation-frame callbacks before submission so resizing and clearance can settle. This scheduling belongs to the demo button, not every manual send.

## Sending transfers released space

Call `preserveOnReset()` immediately before clearing the composer in the same synchronous send operation. The hook measures the resulting form and commits its height with a unique release identity before paint. The list retains the previous clearance until that measured update arrives; it never renders a smaller base clearance without its compensating height.

The trailing spacer owns both current clearance and outstanding reset compensation:

```text
spacer height = measured composer clearance + sum(current release heights)
final spacer height = measured composer clearance
```

If clearing three lines releases 34px, the measured clearance decreases by 34px while a new release starts at 34px. One DOM write preserves the total footprint at that boundary. Each release then springs to zero with the shared layout spring (28 / 1), including playback scaling. Its negative remaining height participates in final-bottom prediction, so catch-up and flight placement do not target temporary space that will disappear.

The release belongs to the space exchange, not a message ID or item type. A send that also inserts a date or several messages releases space once. Consecutive resets retain separate releases and their existing clocks. Editing a new draft changes only base clearance; it does not overwrite outstanding releases. Ordinary editing has no release identity and follows the immediate resize policy above.

Upward input can cancel follow and flight without removing layout compensation. Releases finish independently; reduced motion settles them immediately, and unmount unregisters them and stops future writes. The controller preserves detached reading within the available native scroll range. Layout and scroll animations need not have identical velocities.

Enter submits unless Shift is held or IME composition is active. Shift+Enter keeps the native newline. Whitespace-only drafts are rejected, but accepted drafts are sent without trimming their contents.

## Evidence

- Implementation: [composer composition and send timing](../chat-scroll-container.stories.tsx).
- Space ownership: [measurement hook](../use-chat-composer-space.ts) and [release lifecycle](../chat-bottom-space.ts).
- Related implementation: [textarea sizing](../../message-input/message-input.tsx) and [initial layout / resize policy](../../scroll-anchor/scroll-anchor-controller.ts).
- History: [cf8d1de](https://github.com/lennondotw/interaction-lab/commit/cf8d1de); later changes are reflected in the current implementation.
- Validation: [relevant checks](./verification.md#scrolling-and-composer).

[Architecture index](../README.md)
