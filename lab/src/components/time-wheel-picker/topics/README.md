# Topics

Why this component looks the way it does, in the pieces that took a decision.

Three layers carry that, and they do not repeat each other:

|                         | holds                                                   |
| ----------------------- | ------------------------------------------------------- |
| docblocks in the source | why **this line** is written this way, next to the line |
| `topics/`               | why the **design** is this way, readable end to end     |
| `archive/2026-08-*`     | the **numbers**, and a probe that can be re-run         |

A topic is settled unless it says otherwise. An open one states what is unknown and what
would have to be measured, rather than guessing — the point of writing it down is that the
question survives being put aside.

| topic                                                                               | status   |                                                                                                       |
| ----------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| [Scrolling without a scroller](./scrolling-without-a-scroller.md)                   | settled  | one offset, no scroll container, and why the endless loop rules native scroll out                     |
| [Telling a tap from a drag](./tap-or-drag.md)                                       | settled  | one surface, two gestures: the 3px sticky threshold, and resolving a tap by hit-test                  |
| [Drum geometry](./drum-geometry.md)                                                 | settled  | the prism and its two cylinders, the auto height, and why angle and height are shape and window       |
| [Two typeahead modes](./typeahead-two-modes.md)                                     | settled  | prefix matching and numeric accumulation behind one interface, per column                             |
| [Release velocity across input devices](./release-velocity-across-input-devices.md) | **open** | whether one velocity window suits both a finger and a mouse, and whether desktop flinging is worth it |
