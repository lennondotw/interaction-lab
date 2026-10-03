# Animation intent and resize interruption

Tab insertion, removal, and held-width release are semantic changes that animate. Container resizing
should follow the new constraint immediately, including while those animations are already running.

## Classify the change, not the observer callback

[getTabLayoutChange](../tab-layout-change.ts) compares the last layout snapshot with the new one in
this priority order:

| Condition                       | Reason      | Motion policy                                                |
| ------------------------------- | ----------- | ------------------------------------------------------------ |
| No previous snapshot            | `mount`     | Set all final footprints immediately.                        |
| Available row width changed     | `resize`    | Interrupt every spring and set final footprints immediately. |
| Tab ID count or order changed   | `tabs`      | Animate changed destinations.                                |
| Held-width map identity changed | `hold`      | Animate changed destinations.                                |
| None of the above               | `unchanged` | Keep existing animation clocks for unchanged targets.        |

Width has priority even if tab IDs change in the same commit. Equivalent arrays of the same IDs do not
create insertion intent. An initial or repeated ResizeObserver delivery is not a resize unless the
measured available width changed. Selection changes and fresh callback identities likewise do not
restart unchanged destinations.

This classifier currently considers available width, ID order, and held-map identity. It is not a
general inference system for every stylesheet, font, or DOM mutation. The layout pass still resolves
and dispatches measured targets; a changed target can move even without a changed classifier field.

## Resize takes ownership of the whole row

On resize, [useTabLayout](../use-tab-layout.ts) computes the final held/natural destinations and applies
the immediate path to every width and gap, including:

- Present tabs that are settled or currently compressing/expanding.
- Newly entering tabs, which jump to their final width and release their fixed entrance close slot.
- Removed tabs retained by presence, which jump to width zero and gap zero before removal.
- The add-button gap, even if its destination has not changed.

The spring controller must cancel even an animation already heading toward that same destination.
Checking `immediate` before the unchanged-target early return ensures that `jump()` clears its
velocity and owned animation. Direct style writes make immediate width/margin geometry available
before paint; exiting DOM is released through the usual post-render zero-footprint check.

This prevents a slow spring from leaving the strip behind the user's resize handle or exceeding the
new available width while it catches up. There is no resize debounce, waiting for drag completion,
or exception that lets an already active entrance/exit keep running.

## Hold and motion preference remain independent

Resize does not clear held caps, enter `natural`, or restart the 500 ms timer. Holding constrains the
final layout that resize applies. When waiting later expires, the release can start a new spring as
a semantic change.

`useReducedMotion() === true` also applies the immediate path to all footprints. Reduced motion does
not remove the pointer hold or alter real-time input timers. Initial layout is immediate independently
of the preference, avoiding a zero-width initial paint.

Verification: [change-reason tests](../__tests__/tab-layout-change.test.ts) cover equivalent arrays,
add/remove/reorder, width priority, and held release versus duplicate observation.
[Spring tests](../__tests__/tab-spring.test.ts) cover immediate cancellation of simultaneous entrance,
compression, exit, and gaps, including unchanged destinations at 0.1× playback. Browser checks cover
the React/presence integration and preservation of holding and waiting deadlines.

Related: [Chat's animation-intent policy](../../chat-scroll-container/docs/animation-intent.md). Both
separate intent from observation, but their active-animation policies differ: Chat retargets active
slots during reflow; TabBar deliberately interrupts every footprint on a width change.

[Architecture index](../README.md)
