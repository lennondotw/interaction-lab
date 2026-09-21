# Native inertia and programmatic scroll takeover

Research snapshot: 2026-09-21, implementation at `a9f7a00`. This note records browser capabilities and
experiments, not a shipped fix or a cross-browser behavior contract.

## The failure being investigated

In With Message Input, fling toward history and request Scroll to bottom while the finger has already
lifted but content is still moving. In the Chromium reproduction, a subsequent upward inertia scroll
cancels catch-up before its first spring write. The same command after inertia settles reaches bottom.
A second run using a native CDP touch tap on the button also reproduced the cancellation.

Reading the actual scroll position, deciding who may interrupt catch-up, and stopping native movement
are three separate responsibilities. Ignoring an event in the controller does not stop the browser's
default scrolling. Conversely, a position notification is not proof of a new user gesture.

## Identifying inertia

- Chrome/Edge 151+ expose `WheelEvent.momentum`. Treat absent support as **unknown**, not `false`.
  Safari and Firefox do not currently expose it. This updates the older assumption that no browser
  exposes wheel inertia. See [Chrome 151](https://developer.chrome.com/release-notes/151) and
  [compatibility data](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/WheelEvent.json).
- Touchscreen inertia need not produce any wheel events. After release, `scroll` has no gesture ID or
  inertia flag. Touch lifecycle tracking gives context, not certain attribution of each position change.
  `pointercancel` is not equivalent to finger release.
- `isTrusted` identifies browser-dispatched events, not whether a scroll was user- or program-driven.
  Delta decay and timing are heuristics. `scrollend` reports completion, not the source of a movement.
- macOS AppKit exposes [phase](https://developer.apple.com/documentation/appkit/nsevent/phase-swift.property)
  and [momentumPhase](https://developer.apple.com/documentation/appkit/nsevent/momentumphase).
  A trackpad's `mayBegin` can expose contact before movement; DOM wheel events are not a full equivalent.

## Preventing movement

A non-passive listener can cancel a **cancelable** wheel event, including inertia when identifiable.
Adding that listener midway does not retroactively cancel earlier events or guarantee future cancelability.
After a touch fling is released there may be no touchmove left to cancel, and scroll itself is not cancelable.
Changing touch-action during an existing gesture is not a cancellation API.
See the [Pointer Events draft](https://www.w3.org/TR/pointerevents/).

Writing scrollTop or using `scrollTo({ behavior: 'instant' })` is not a portable way to clear inertia.
WebKit's March 2026 [change and regression tests](https://github.com/WebKit/WebKit/pull/61534) deliberately
preserve user momentum across programmatic position changes. This is engine evidence, not verification
of the Safari release installed on a particular device.

Native applications have additional options: AppKit can filter local events by momentum phase;
UIKit has [stopScrollingAndZooming](<https://developer.apple.com/documentation/uikit/uiscrollview/stopscrollingandzooming()>).
Neither is a Web API or automatically applies to arbitrary DOM overflow containers inside a WebView.

## Measured stop experiments

Chromium 153.0.8010.12, headless mobile emulation, 430 × 1000 viewport, DPR 3. CDP synthesizes a native
touch fling (`preventFling: false`); this is not a synthetic DOM scroll event. Each intervention runs
80ms after touchend, twice per method. These tests isolate stopping native movement: they do not start
the catch-up spring at the same time. No wheel or post-intervention touchmove events occurred.

| Intervention                                                              | Observed result                                              |
| ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| None                                                                      | Another 230–236px of upward movement                         |
| Instant write of current position or current position + 1px               | Inertia continued                                            |
| Add non-passive touchmove/wheel/scroll listeners and cancel when possible | Inertia continued                                            |
| Set touch-action to none                                                  | Inertia continued                                            |
| Overflow hidden, force layout, restore synchronously                      | Inertia continued                                            |
| Overflow hidden, restore in next rAF                                      | Inertia continued                                            |
| Overflow hidden, restore after two or four nested rAFs                    | Stopped in both trials per method; 19–36px residual movement |
| Overflow hidden, restore after 100ms                                      | Stopped in both trials; 19–20px residual movement            |

For successful trials, sampled positions were constant from 50ms after intervention onward, including
after overflow restoration. The hidden state may need to reach rendering/compositing; this is an
inference from timing, not a guaranteed two-frame protocol. Residual movement rules out claiming an
atomic freeze. No width change was observed in this environment; classic scrollbars may behave differently.

The overflow technique remains a workaround requiring physical iOS and trackpad validation, including
offset continuity, restoration, nested scrollers, and immediate response to a new gesture. Do not turn
the experimental delay into a production constant or a passing cross-browser regression assertion.

## Reproduce locally

Start Storybook separately. These scripts are manual research tools and are not included in CI or the
chat regression runner. They import the repository's Playwright dependency and launch a separate browser.

```sh
# Command during inertia, command after settling, and native button tap during inertia.
STORYBOOK_URL=http://localhost:6009 node scripts/research/chat-inertia-repro.mjs

# All stop experiments, two trials each.
STORYBOOK_URL=http://localhost:6009 node scripts/research/chat-inertia-stop.mjs

# Optional subset and output override.
METHODS=baseline,hidden-two-frames OUTPUT=artifacts/research/subset.json \
  node scripts/research/chat-inertia-stop.mjs
```

Raw events and frame samples go to ignored `artifacts/research/`; the command reproduction also saves
a screenshot. The committed [numeric snapshot](../../../../../scripts/research/chat-inertia-observations.json)
preserves the original experiment results without treating them as golden expectations.

## Candidate direction, not yet implemented

An explicit bottom command should establish programmatic ownership; subsequent position observations
must still be consumed without automatically being classified as a fresh interruption. New intentional
input must remain able to interrupt. On supported wheel paths, momentum supplies stronger attribution.
Stopping native movement is a separate platform concern; ignoring its notifications alone cannot guarantee
a smooth trajectory. Validate the overflow workaround on target devices before adopting it.

[Architecture index](../README.md)
