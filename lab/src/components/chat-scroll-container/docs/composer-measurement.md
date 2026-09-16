# Composer measurement and bottom clearance

The composer owns editing geometry; the story connects that geometry to list clearance and sending. `ChatScrollContainer` does not contain a composer or automatically install the flight hook.

## Decision and why

The textarea resets its height and reads `scrollHeight` on input, controlled-value updates, and width changes. A separate observer measures the complete composer form, including its outer spacing. The story writes `--chat-composer-height`; list bottom padding includes that height plus the desired clearance.

Initial bottom positioning occurs on the scroll controller's first observer delivery, after layout effects and composer clearance are available. It writes the bottom before paint without a catch-up animation. Later composer resizing tracks the bottom immediately only if following was already settled; active catch-up receives a new target, while detached reading preserves its position within the available range.

Sending captures the source box before appending and clearing the draft. The demo's Send button first fills the textarea, then uses two animation-frame callbacks before submission so resizing and clearance can settle. This scheduling belongs to the demo button, not every manual send.

Enter submits unless Shift is held or IME composition is active. Shift+Enter keeps the native newline. Whitespace-only drafts are rejected, but accepted drafts are sent without trimming their contents.

## Evidence

- Implementation: [composer composition and send timing](../chat-scroll-container.stories.tsx).
- Related implementation: [textarea sizing](../../message-input/message-input.tsx) and [initial layout / resize policy](../chat-scroll-controller.ts).
- History: [cf8d1de](https://github.com/lennondotw/interaction-lab/commit/cf8d1de); later changes are reflected in the current implementation.
- Validation: [relevant checks](./verification.md#scrolling-and-composer).

[Architecture index](../README.md)
