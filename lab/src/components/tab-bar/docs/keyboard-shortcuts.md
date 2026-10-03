# Held keyboard shortcuts

The repository owns repeat timing rather than relying on operating-system key repeat. This gives
switching and closing a predictable hold cadence while adding remains one action per physical press.

## Bindings and repeat clock

[useTabKeyboard](../use-tab-keyboard.ts) uses the shared
[createHeldKeyboardShortcuts](../../../../../packages/utils/src/keyboard-shortcuts.ts) helper.

| Chord                            | Action                           | Helper repeat |
| -------------------------------- | -------------------------------- | ------------- |
| Shift+T                          | Request one new tab              | Disabled      |
| Shift+W                          | Request closing the active tab   | Enabled       |
| Shift+Left / Shift+Right         | Select the previous/next tab     | Enabled       |
| Shift+Alt+Left / Shift+Alt+Right | Same navigation; Option on macOS | Enabled       |

The first action fires on the original keydown. Repeating bindings fire again after 400 ms, then every
80 ms through recursive timeouts. Navigation stops at each end rather than wrapping. A null active
ID prevents navigation/closing; adding remains available. These timers are not animation-speed-scaled.

## Ignore native repeat without resetting owned repeat

The helper matches a case-insensitive `event.key` and exact modifiers. Unspecified modifiers mean
false, so extra Ctrl/Meta/Alt do not accidentally match. Held presses are tracked by physical
`event.code`, allowing keyup to release the original press even if modifier state changed.

A matched event is prevented, then `event.repeat` or an already-held physical code returns without
triggering or resetting a timer. An OS repeat received without an original keydown cannot create a
hold. For Shift+T this prevents repeated additions; for other bindings it leaves the helper's clock in
control. Already-consumed events are not intercepted.

Releasing the physical key stops its timer. Changing modifier state releases incompatible held chords,
including releasing Shift before W or an arrow. Composition stops repetition. Window blur and hook
cleanup stop all holds; no action continues after the window loses ownership.

## Refresh actions without renewing the hold

One helper instance survives React renders. Its `update()` replaces bindings/callbacks in a layout
effect and releases any held chord that is no longer bound. Repeat ticks look up the current binding,
so repeated closes use the new active ID and latest list instead of repeatedly closing a stale ID.
Refreshing callbacks does not restart the 400 ms delay.

Bindings call the same close path as pointer closing. They never call hover `leave()`; only a real
pointer exit starts waiting. The helper is generic and exported from utils; it does not depend on
TabBar or its hover state.

## Input scope

Listeners currently attach to `window`, not a focused tab-bar root. There is no automatic editable-
element exclusion or multi-instance focus router. An owner such as the resize handle can consume an
event first; `defaultPrevented` prevents a competing shortcut action. Hosts mounting multiple bars or
using these chords in editors must establish their intended event ownership explicitly.

Verification: [shared keyboard tests](../../../../../packages/utils/src/__tests__/keyboard-shortcuts.test.ts)
cover repeat cadence, native repeats, single-add behavior, fresh callbacks, modifiers, composition,
consumed events, and cancellation. Browser checks distinguish shortcut dispatch from actual pointer
movement and verify navigation/active-tab host behavior.

[Architecture index](../README.md)
