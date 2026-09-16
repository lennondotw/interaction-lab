# Default visual entrance

New ordinary items fade in while moving upward from 20px below their layout position. One default serves received messages, sends without a composer, history insertion, and non-message items.

## Decision and why

A hidden real body supplies geometry; an external full-size copy follows it each render frame. One entrance progress drives opacity and the 20px-to-zero translation. The copy follows committed tail visibility, including grouping changes that occur before entrance completes.

Visual entrance and slot expansion have separate responsibilities and spring parameters. The visual can finish first, but its copy remains until its own row is no longer inserting. Then the original becomes visible and the layer is removed. This prevents a handoff to clipped measurement content inside an unfinished slot.

`entrance: 'flight'` explicitly selects the composer-flight integration. Typing replacement explicitly selects a fade-only entrance for the received message. Those choices do not change the generic gap ownership contract. Typing itself has a separate reversible lifecycle, even though its entrance uses the same visual spring and offset.

Initial history appears immediately. Reduced motion skips or completes entrance copies. These defaults describe insertion, not a generic remove/reorder animation API.

## Evidence

- Implementation: [animateChatEntrance](../chat-presence.ts).
- History: [710db97](https://github.com/lennondotw/interaction-lab/commit/710db97); later changes are reflected in the current implementation.
- Validation: [relevant checks](./verification.md#layout-and-typing).

[Architecture index](../README.md)
