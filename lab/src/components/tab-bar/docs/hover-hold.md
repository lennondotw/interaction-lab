# Hover holding and release

Hover holding preserves a close-friendly width budget until the pointer has been outside the tab
strip for 500 ms. Its lifetime represents pointer intent and is independent of spring lifetime.

## The actual occupied rectangle

The hover element is the visible `flex w-fit` row, from the first tab through the add button. It
includes inter-item gaps and the add-button rectangle. It excludes unused container width, fieldset
padding, diagnostic text, shortcut captions, and speed controls. With no tabs it is the add-button row.

[TabBar](../tab-bar.tsx) sends non-touch pointer enter/leave events to the controller. Touch does not
create this hover policy. The region can change size as tabs collapse or expand; a real pointer leave
caused by the changing rectangle is still a leave and can start waiting.

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
release deadline. A real pointer event following the geometry change can still affect the controller
normally. A later timer expiry can initiate the usual held-width release animation.

The [React hook](../use-tab-hover-hold.ts) keeps one controller instance and refreshes the optional host
callback through a ref. Re-rendering does not restart timers. State notifications occur on transitions;
mount does not notify `natural`. Cleanup clears any pending timer so an unmounted component cannot
later release a hold.

Verification: [hover controller tests](../__tests__/tab-hover-hold.test.ts) cover indefinite holding,
500 ms expiry, return/leave reset, keyboard close outside, close during waiting, no rearming after
expiry, and cleanup. Actual hover hit geometry and resize/deadline interaction are browser checks in
the [verification guide](./verification.md). The UI intentionally has no countdown display.

[Architecture index](../README.md)
