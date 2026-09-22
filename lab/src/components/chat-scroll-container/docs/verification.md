# Chat motion verification

Run browser regressions against a live development Storybook. The scripts import development modules
and use independent Playwright pages; a static production build is not an equivalent test target.

From the repository root:

```sh
pnpm exec playwright install chromium
pnpm test:chat
# Focused CI gate (also useful for a quicker local check):
pnpm test:chat:ci
# Or reuse an existing development server:
STORYBOOK_URL=http://localhost:6010 pnpm test:chat
# Run a focused regression directly:
STORYBOOK_URL=http://localhost:6010 node scripts/test-chat-contracts.mjs
```

`test:chat` starts an isolated Storybook on port 6199 (override with `CHAT_TEST_PORT`) unless
`STORYBOOK_URL` is supplied. It runs the browser regressions serially, fails on the first failure,
limits each script to three minutes, and stops only processes it owns. Logs and artifacts produced
in that run are collected under `artifacts/chat-tests/`. No failed attempt is silently retried.

The CI **Chat interaction contracts** job runs `test:chat:ci` in Chromium and gates deployment. That
focused suite covers the shared state contracts, debug geometry, scroll policy, send flight, and typing
handoff. The default `test:chat` command remains the complete local suite, including slow playback
matrices, composer/typing overlap, catch-up, history insertion, bottom-line sampling, 10,000-row layout
transactions, and generic insertion variants. CI selection changes execution cost only; every script
remains directly runnable and part of the documented behavior contracts.

The [behavior contracts](./behavior-contracts.md) identify the intended outcomes these regressions
protect. Synthetic events exercise controller branches; real browser interactions and frame samples
cover the composed stories. Neither alone reproduces every native trackpad gesture.

## Geometry and flight

[Flight checks](../../../../../scripts/test-chat-send-flight.mjs) sample short, bulleted, and long text
at narrow and wide widths. They check departure geometry, natural text dimensions, top inset,
overshoot coherence, historical sends, consecutive sends, interruption, and handoff.

Manually use **With Message Input** at 0.25x: send one character, several lines, and two rapid identical
messages. Send again from earlier history. The shape should finish once; later placement compensation
must not restart it. The copy should disappear when the real row aligns. Compare outline on/off using
measured body bounds; debug decoration is not evidence of a changed layout box by itself.

## Per-item debugging

Enable **Bubble debug** in the composed stories, or pass `debugBubbles` to the container.
Annotations show item identity, visual phase (`idle`, `entering`, `exiting`, `crossfading`,
`replacing`, `flying`, or `handoff`), and whether the item's layout slot is animating.
`handoff` means the visible entrance/flight clock finished but its real layout anchor is not yet ready.
The typing dots keep cycling even when the typing item's entrance/layout reports idle.

Outgoing annotations sit outside the visual's left edge; incoming/typing annotations sit outside its
right edge. Date/status labels provide an intrinsic text anchor. Generic content keeps its full body
as the anchor: the annotation's right edge coincides with the content's right edge and may overlap it.
Right-side annotations use left-aligned text; left-side and inset-right annotations use right-aligned text.

The small, translucent monospace text is an inert, accessibility-hidden absolute child of the actual
visual. Native scrolling therefore moves it together with that visual without JS coordinate tracking.
The list's content clipping bounds scrollable overflow. Flight/entrance owners register their actual
carriers and phase; the badge transfers with ownership, and flight supplies inverse scale so debug
text stays readable. Visual clones discard copied annotations before taking ownership.

Only visible bodies and active carriers have their debug state refreshed. This loop reads no geometry;
CSS owns placement and inherited opacity. Disabling debug removes annotations, observers, and the frame
callback. This instrumentation still has a cost while enabled; it is not a performance profiler.

[Debug checks](../../../../../scripts/test-chat-item-debug.mjs) cover layout and scroll extent invariance,
synchronous native scrolling, content overlap alignment, unscaled flight text, interruption cleanup,
typing reversal/replacement, and label alignment.

## Scrolling and composer

- [Wheel stability](../../../../../scripts/test-chat-wheel-stability.mjs): settled Resizable Message Input,
  With Message Input, and Long List preserve a full 240px upward movement without reverse frames or
  controller position writes. Wheel and native smooth-scroll continuation run separately; the latter must
  include intermediate frames. Local full suite only, with frame evidence on success and assertion failure.

- [Touch takeover](../../../../../scripts/test-chat-touch-takeover.mjs): touch/mouse/pen contact policy, delayed scroll reconciliation, overflow restoration on cancellation/disposal, superseding commands, reduced motion, and real Chromium flings with programmatic and native-button takeover. Local full suite only; iOS simulator evidence is in [the research record](./inertia-ios-experiments.md).

- [Interaction contracts](../../../../../scripts/test-chat-contracts.mjs): explicit flight cancellation and non-cancellation signals, pending departures, both mouse-press policies in fixtures and real stories, zero-displacement downward wheel restoration at 2px/20px, downward catch-up takeover inside/outside 2px with delayed scroll notification and real-wheel frame sampling, pointer-held restoration, atomic typing replacement boundaries, geometry, and disposal.
- [Velocity checks](../../../../../scripts/test-chat-scroll-velocity.mjs): retarget carries measured velocity at 0.25x and 1x; the response must differ from a restart at rest. Tolerances allow animation-frame sampling and do not assert strict velocity continuity.

- [Scroll policy checks](../../../../../scripts/test-chat-scroll.mjs): initial positioning, threshold
  escape/restoration, local/remote insertion, keyboard and pointer control, composer resizing, and reduced motion.
- [History scroll checks](../../../../../scripts/test-chat-history-scroll.mjs): outgoing history insertion at 8px/100px above bottom preserves detached reading position, while a subsequent local send still catches up.
- [Catch-up checks](../../../../../scripts/test-chat-catch-up.mjs): 8px/100px upward escape followed by one or two sends at 0.1x/1x; projected target stability, layout/frame continuity, final bottom alignment, and flight handoff. Controller fixtures force both faster and slower layout expansion. See the [continuity contract](./catch-up-continuity.md); frame bounds are regression checks, not a proof of strict mathematical continuity.
- [Scroll ownership checks](../../../../../scripts/test-chat-scroll-ownership.mjs): callback ordering,
  fractional/integer clamps, native interruption, and the interrupted automatic-reply flight scenario.

[Bottom-line checks](../../../../../scripts/test-chat-bottom-line.mjs) inject a visible, zero-height
line at the content end, after messages and typing but before composer clearance. Starting fully
settled, they sample animation frames through typing entry/exit/reopening, replacement, append,
history insertion, and composer send at 0.1x and 1x. The line must stay within 1 CSS px of its starting
position, with at most 1 CSS px total excursion, and reported state must remain `following`. The
pixel tolerance accounts for native scroll rounding; an `animating` catch-up fails even within it.
The probe checks that the marker adds no scroll extent and that layout actually changes during each
sequence. This is a settled-bottom invariant, not a claim about sends from detached history or changes
to composer clearance. Frame samples are saved to `/tmp/chat-bottom-line.json`; use `HEADED=1` to watch
the amber line in the test browser. The test does not add a permanent marker to the component.

At 20px debug threshold, scroll upward slightly while still inside the zone: following must remain
cancelled. A later downward return can restore eligibility. The scroll policy regression types and deletes lines through 1 → 2 → 3 → 2 → 1 at 1x/0.1x, starting settled or detached 8px/220px above bottom. It samples every animation frame and observes reported state changes: settled following remains pinned within 1 CSS px, detached scroll position stays within 1 CSS px, and neither state changes during resizing. Each step also verifies the composer height and matching bottom clearance. The single-line composer is 35px by design.

The [composer release checks](../../../../../scripts/test-chat-composer-release.mjs) sample the reset
commit and subsequent frames at 1x/0.1x: a three-line composer clears without the former 34px backward
clamp, including consecutive sends, typing, catch-up from 100px above bottom, and upward interruption.
The spacer retains outstanding compensation after flight cancellation, then returns to measured
clearance. A focused layout fixture checks batch-independent projection, duplicate delivery, overlapping
releases, reduced motion, and disposal. Samples are saved to `/tmp/chat-composer-release.json`.

The [flight/composer checks](../../../../../scripts/test-chat-flight-composer.mjs) exercise ordinary
1 → 2 → 3 → 2 → 1 line edits during a live flight at 0.1x, starting pinned or 100px above bottom,
and after upward cancellation. They assert immediate clearance, projected-target changes, intermediate
follow state, pinned or detached position, and aligned normal handoff. A separate boundary case shrinks
a detached three-line composer 8px above bottom, then grows it again: native clamping must not reacquire
following. Samples are saved to `/tmp/chat-flight-composer.json`. Exact frame trajectories and strict
velocity continuity are deliberately not asserted; velocity retargeting has separate coverage.

In **Automatic Replies**, use 0.25x, send `Hey!`, scroll upward about 100px, then send the multiline
[bullet preset](./demo-conversation.md). The flight must settle without a rescue scroll.

## Layout and typing

- [Insertion checks](../../../../../scripts/test-chat-insertion.mjs): middle insertion, typing during
  sends, replacement expansion, anchors, and interruption.
- [Generic item checks](../../../../../scripts/test-chat-items.mjs): non-message items and their shared layout.
- [Typing exit checks](../../../../../scripts/test-chat-typing-exit.mjs): collapse, reopening, crossfade,
  interruption, and reduced motion.
- [Typing handoff checks](../../../../../scripts/test-chat-typing-handoff.mjs): immediate, partial, settled,
  long-reply, and reopened replacements at 0.1x, including footprint and inherited velocity.
  Geometry samples use Motion's frame timestamp rather than observer delivery time. A deliberate
  60ms delay after handoff guards against false velocity failures on a busy main thread; the
  trajectory tolerance remains 0.8px.
- [Exit/insertion checks](../../../../../scripts/test-chat-typing-exit-insertion.mjs): receive and history insertion during an active typing exit; the new slot starts at zero, existing rows and typing retain their positions at commit, and the content end remains pinned.
- [Layout transaction checks](../../../../../scripts/test-chat-layout-transactions.mjs): the 8px-to-3px
  neighbor gap, immediate observed growth/shrinkage, explicit content animation from the updated baseline,
  and geometry-read budgets with 100 and 10,000 mounted rows.
- [Resizable window checks](../../../../../scripts/test-chat-resize-window.mjs): continuous width/height
  resizing at 1x and 0.1x keeps following pinned without entering catch-up. Bottom-zone restoration
  leaves the remaining pixel untouched until the next layout change; active catch-up still retargets
  and reaches the bottom. Repeated reflow leaves
  settled bubbles idle; an active insertion keeps its progress and finishes at its new natural size.
  A nearly clipped reading message keeps its bottom and identity through single-step and continuous
  width round trips, including container translation. Frame samples cover insertion before and after
  that message through final layout handoff: anchor identity and bottom stay stable, and detached intent
  remains intact. Insertion above compensates scrollTop; insertion below leaves it unchanged.
  Real wheel scrolling reselects the anchor. **Show anchor element** highlights the
  manager's candidate with an inert rectangular overlay (compensation uses it only while detached).
  Also covers resizer capture, missed releases, cancellation, and keyboard input. Included in the local
  full suite, not the CI smoke suite.

In a fresh **Insert In History** story at 0.1x with outlines enabled, insert outgoing before the last
item: the old neighbor's gap must not vanish before its slot animates. Then turn typing on and immediately
receive with typing off. Replacement must inherit the partly expanded slot without a height or offset jump.
Also test ordinary receive while typing stays on, and exit followed by rapid re-entry.

The large-row fixture isolates layout-manager measurement cost. It does not benchmark React rendering,
all flight copies, overall browser frame time, or a virtualized integration.

The [automatic-reply checks](../../../../../scripts/test-chat-auto-replies.mjs) exercise the composed conversation flow and guide as an optional, separately invoked demo regression. They are not part of `test:chat`.

## Parameters

[Spring conversion unit tests](../../../../../packages/utils/src/__tests__/spring-parameters.test.ts)
cover the physical/dynamics helper. [Reply-plan unit tests](../__tests__/chat-demo-replies.test.ts) cover
preset/fallback determinism. Verify reduced motion separately from slow playback; a 0.1x animation is
not the accessibility behavior. The typing-dot loop and reply timers do not use playback scaling.

[Architecture index](../README.md)
