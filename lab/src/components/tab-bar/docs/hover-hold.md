# Hover holding and release

Hover holding preserves a close-friendly width budget until the pointer has been outside the tab
strip for 500 ms. Its lifetime represents pointer intent and is independent of spring lifetime.

## The occupied envelope

The hover surface extends from the first tab through the furthest final or painted add edge:
`max(finalStrip.width, presentationStrip.width)`. It includes gaps and the span between moving/final
controls. It excludes unrelated empty container width, fieldset padding, diagnostics, and speed
controls. Empty state still contains the add rectangle; retained exits can temporarily extend the
painted extent.

[The interaction hook](../use-tab-interaction.ts) caches non-touch pointer coordinates and checks
membership on pointer movement/entry and footprint changes. It calls enter/leave only when membership
changes. This keeps a stationary pointer's hold consistent with the same two surfaces used for
[hit arbitration](./interaction-and-presentation.md). Touch does not enter this policy. The envelope
can genuinely move away from the pointer as layout changes, which still starts waiting.

## State transitions

| Event                 | New state | Width snapshot and timer                                           |
| --------------------- | --------- | ------------------------------------------------------------------ |
| Initial mount         | `natural` | No held widths or release timer.                                   |
| Enter the region      | `holding` | Cancel any pending release; do not capture widths merely on entry. |
| Leave the region      | `waiting` | Start a fresh 500 ms release delay.                                |
| Return during waiting | `holding` | Cancel the delay completely.                                       |
| Leave again           | `waiting` | Start a full new 500 ms delay, not the previous remainder.         |
| Delay expires         | `natural` | Clear held widths, then report the natural state.                  |

Entering can show `holding` at natural base size with no held-width snapshot yet. Closing captures a
budget when the state permits holding. The status does not by itself imply compressed widths.

## Closing and resizing do not synthesize leave

`shouldHoldWidths()` is true in `holding` and `waiting`. A close preserves that existing intent but
does not call `leave()`, create a timer in `natural`, or renew a waiting deadline. Keyboard shortcuts
do not move the pointer; closing with Shift+W must not change `holding` to `waiting` by itself.

Container resize stops spring animations but retains the held map, current hold state, and existing
release deadline. Envelope membership is reevaluated after the geometry change; a genuine exit can still affect
the controller normally, independently of spring cancellation. A later timer expiry can initiate the usual held-width release animation.

The [React hook](../use-tab-hover-hold.ts) keeps one controller instance and refreshes the optional host
callback through a ref. Re-rendering does not restart timers. State notifications occur on transitions;
mount does not notify `natural`. Cleanup clears any pending timer so an unmounted component cannot
later release a hold.

Verification: [hover controller tests](../__tests__/tab-hover-hold.test.ts) cover indefinite holding,
500 ms expiry, return/leave reset, keyboard close outside, close during waiting, no rearming after
expiry, and cleanup. Actual hover hit geometry and resize/deadline interaction are browser checks in
the [verification guide](./verification.md). The UI intentionally has no countdown display.

[Architecture index](../README.md)
