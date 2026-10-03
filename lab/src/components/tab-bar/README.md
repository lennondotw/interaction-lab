# Tab bar motion architecture

This index documents the current TabBar implementation, including the small layout, input, and visual
decisions that affect its behavior. Each note explains the mechanism, its rationale, boundaries, and
source or verification references. The notes describe the working implementation; they do not imply
that every browser scenario has an automated regression test.

## Ownership

| Concern                                                                      | Owner                                              |
| ---------------------------------------------------------------------------- | -------------------------------------------------- |
| Tab identity, order, titles, active selection, and logical insertion/removal | Host through controlled props                      |
| Natural destination widths and CSS spacing                                   | Independent hidden flex sizing row                 |
| Held destination widths and release intent                                   | Hover-hold controller and width snapshot           |
| Current pixel widths, leading gaps, velocity, and visual lifetime            | Footprint springs and AnimatePresence              |
| Close-slot geometry during entry and exit                                    | Close-layout hook                                  |
| Shortcut dispatch and repeat clock                                           | Shared keyboard helper and TabBar bindings         |
| Status, size, space, and speed demonstration                                 | Story composition and display-only instrumentation |

The logical tab list changes immediately. A removed tab can still have a visible footprint while it
exits, and a newly added tab can have its final destination established while its current width is zero.
Hover holding is independent of that motion: stopping springs does not release the hold.

## Design notes

| Topic                                                                  | Scope                                                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [Micro-decision registry](./docs/design-decisions.md)                  | Individual layout, animation, hover, clipping, keyboard, and instrumentation choices.            |
| [Spring scheduling and lifetime](./docs/spring-lifecycle.md)           | Pending targets, callback coalescing, cancellation ordering, and completion ownership.           |
| [Animation batch timing](./docs/animation-batch-timing.md)             | Shared frame samples, integer clock alignment, rapid-close conservation, and numerical evidence. |
| [Final layout measurement](./docs/final-layout-measurement.md)         | Independent flex row, CSS size tokens, measurement ordering, and held destinations.              |
| [Presence and footprint ownership](./docs/presence-and-footprints.md)  | Leading gaps, simultaneous entry/exit, visual lifetime, and zero-footprint removal.              |
| [Spring parameters and continuity](./docs/spring-parameters.md)        | 25/1 physics, pixel/velocity handoff, playback scaling, and rest thresholds.                     |
| [Preserving close targets](./docs/close-targets.md)                    | Middle versus tail closing, destination budgets, base-size cap, and empty state.                 |
| [Hover holding and release](./docs/hover-hold.md)                      | Actual hover rectangle, 500 ms leave delay, keyboard independence, and cleanup.                  |
| [Animation intent and resize interruption](./docs/animation-intent.md) | Change-reason priority, immediate reflow, stopping all active springs, and reduced motion.       |
| [Close-button geometry](./docs/close-button-layout.md)                 | Flex compression, centered X, fixed entry/exit slots, and restoration.                           |
| [Title clipping and overflow mask](./docs/title-clipping.md)           | Inner padding, real overflow detection, clipping, and the 20 px alpha ramp.                      |
| [Stroke and focus ownership](./docs/strokes-and-focus.md)              | One outer stroke, one separator, alpha hierarchy, and accessible controls.                       |
| [Held keyboard shortcuts](./docs/keyboard-shortcuts.md)                | Repeat timing, ignored native repeats, modifier ownership, and fresh callbacks.                  |
| [Stories and instrumentation](./docs/stories-and-instrumentation.md)   | Display-only status dimensions, destination classification, and speed controls.                  |
| [Behavior contracts](./docs/behavior-contracts.md)                     | Expected results mapped to their evidence and remaining verification boundaries.                 |
| [Verification guide](./docs/verification.md)                           | Focused unit commands and reproducible browser scenarios.                                        |

## Integration

Use stable, unique IDs and immutable tab-list updates. The host chooses which tab becomes active after
closing; the component reports the requested action without maintaining a second logical list.

```tsx
<TabBar
  tabs={tabs}
  activeId={activeId}
  onSelect={setActiveId}
  onAdd={addTab}
  onClose={closeTab}
  animationSpeed={1}
  onHoldStateChange={setHoldState}
/>
```

`tabs` contains `{ id, title }` items; `activeId` is a tab ID or `null`. `animationSpeed` is a positive
playback multiplier, defaulting to 1. `onHoldStateChange` is optional and reports transitions among
`natural`, `holding`, and `waiting`; it does not emit an initial `natural` notification. `className`
customizes the outer fieldset. These contracts are declared in [the public types](./tab-bar.types.ts)
and exported through [the component index](./index.ts).

The host supplies available width. The component uses an equal CSS base size, allows compression below
the close-slot size, and does not offer scrolling or virtualization. The story's adjacent-active-tab
selection and sequential new IDs are demonstration policies, not component requirements.

## Module boundaries

[TabBar](./tab-bar.tsx) wires controlled props, the sizing row, hover region, shortcuts, and add button.
[AnimatedTab](./animated-tab.tsx) renders each tab, while [TabTitle](./tab-title.tsx) owns text overflow.
The layout, footprint, close-slot, hover, and keyboard hooks own their respective browser resources and
cleanup. Pure close-width, held-width, change-reason, spring, and hover controllers are tested separately.

This split keeps measured destinations out of presentation code and keeps display-only story labels
out of production layout decisions. Structural refs and footprint registrations are invariants:
violations fail at their use site rather than silently substituting a zero measurement.
