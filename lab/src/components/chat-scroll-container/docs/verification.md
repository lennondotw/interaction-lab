# Chat motion verification

Run browser regressions against a live development Storybook. The scripts import development modules
and use independent Playwright pages; a static production build is not an equivalent test target.

From the repository root, for example:

```sh
STORYBOOK_URL=http://localhost:6010 node scripts/test-chat-send-flight.mjs
STORYBOOK_URL=http://localhost:6010 node scripts/test-chat-layout-transactions.mjs
STORYBOOK_URL=http://localhost:6010 node scripts/test-chat-typing-handoff.mjs
```

These are focused regression entry points, not a promise that every behavior is covered by CI or that
every script runs automatically. This documentation change does not itself rerun the full browser suite.

## Geometry and flight

[Flight checks](../../../../../scripts/test-chat-send-flight.mjs) sample short, bulleted, and long text
at narrow and wide widths. They check departure geometry, natural text dimensions, top inset,
overshoot coherence, historical sends, consecutive sends, interruption, and handoff.

Manually use **With Message Input** at 0.25x: send one character, several lines, and two rapid identical
messages. Send again from earlier history. The shape should finish once; later placement compensation
must not restart it. The copy should disappear when the real row aligns. Compare outline on/off using
measured body bounds; debug decoration is not evidence of a changed layout box by itself.

## Scrolling and composer

- [Scroll policy checks](../../../../../scripts/test-chat-scroll.mjs): initial positioning, threshold
  escape/restoration, local/remote insertion, keyboard and pointer control, composer resizing, and reduced motion.
- [Scroll ownership checks](../../../../../scripts/test-chat-scroll-ownership.mjs): callback ordering,
  fractional/integer clamps, native interruption, and the interrupted automatic-reply flight scenario.

At 20px debug threshold, scroll upward slightly while still inside the zone: following must remain
cancelled. A later downward return can restore eligibility. At a settled bottom, grow/shrink/grow the
composer; while detached, repeat without being pulled down. The single-line composer is 35px by design.

In **Automatic Replies**, use 0.25x, send `Hey!`, scroll upward about 100px, then send the multiline
[bullet preset](./demo-conversation.md). The flight must settle without a rescue scroll.

## Layout and typing

- [Insertion checks](../../../../../scripts/test-chat-insertion.mjs): middle insertion, typing during
  sends, replacement expansion, anchors, and interruption.
- [Generic item checks](../../../../../scripts/test-chat-items.mjs): non-message items and their shared layout.
- [Typing exit checks](../../../../../scripts/test-chat-typing-exit.mjs): collapse, reopening, crossfade,
  interruption, and reduced motion.
- [Typing handoff checks](../../../../../scripts/test-chat-typing-handoff.mjs): immediate, partial, settled,
  long-reply, and reopened replacements at 0.1x, including footprint and velocity continuity.
- [Layout transaction checks](../../../../../scripts/test-chat-layout-transactions.mjs): the 8px-to-3px
  neighbor gap, intrinsic growth/shrinkage, and geometry-read budgets with 100 and 10,000 mounted rows.

In a fresh **Insert In History** story at 0.1x with outlines enabled, insert outgoing before the last
item: the old neighbor's gap must not vanish before its slot animates. Then turn typing on and immediately
receive with typing off. Replacement must inherit the partly expanded slot without a height or offset jump.
Also test ordinary receive while typing stays on, and exit followed by rapid re-entry.

The large-row fixture isolates layout-manager measurement cost. It does not benchmark React rendering,
all flight copies, overall browser frame time, or a virtualized integration.

The [automatic-reply checks](../../../../../scripts/test-chat-auto-replies.mjs) exercise the composed conversation flow and guide.

## Parameters

[Spring conversion unit tests](../../../../../packages/utils/src/__tests__/spring-parameters.test.ts)
cover the physical/dynamics helper. [Reply-plan unit tests](../__tests__/chat-demo-replies.test.ts) cover
preset/fallback determinism. Verify reduced motion separately from slow playback; a 0.1x animation is
not the accessibility behavior. The typing-dot loop and reply timers do not use playback scaling.

[Architecture index](../README.md)
