# Bubble geometry contracts

The body, text box, and tail have different responsibilities. Measure the body and text box for layout and flight; the tail is a painted extension, not extra layout width or height.

## Decision and why

A message uses 14px type, 17px line height, and 8px vertical / 13px horizontal padding: one line occupies 33px. The body has a 38px minimum width. Flex centering centers the intrinsic text box at that minimum; text within it remains start-aligned when it wraps. A `1lh` minimum reserves an empty line, and `break-spaces` preserves leading/trailing spaces and blank lines.

Typing has a 45 × 33px layout box with a top-aligned 45 × 28px capsule. Its two tail circles do not enlarge layout. Bidirectional CSS comments keep the typing height and single-line message height coordinated.

The composer has 9px vertical padding and a 35px single-line height by design. Its size is independent of the 33px message. Flights measure both geometries rather than deriving one from the other. The tail curve and corner shape are optical approximations, not claims of an exact platform vector.

## Evidence

- Implementation: [bubble styles](../../message-bubble/message-bubble.module.css).
- Related implementation: [typing geometry](../../message-bubble/typing-bubble.module.css) and [composer geometry](../../message-input/message-input.css).
- History: [044754b](https://github.com/lennondotw/interaction-lab/commit/044754b); later changes are reflected in the current implementation.
- Validation: [relevant checks](./verification.md#geometry-and-flight).

[Architecture index](../README.md)
