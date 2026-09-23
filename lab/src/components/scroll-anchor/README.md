# Scroll anchor

Headless bottom-following and reading-anchor preservation for a scrolling list. It renders no
visuals: the host owns the markup and styles; this component owns programmatic scrolling and the
viewer's intent. The chat list builds on it; the wireframe story exercises it without bubbles.

## What it decides

| Concern                                                            | Mechanism                                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Whether new content may move the viewport                          | Explicit `following` / `animating` / `detached` intent              |
| Whether a decreasing `scrollTop` is user escape or a browser clamp | One observation cursor shared by layout callbacks and scroll events |
| Where catch-up should land while layout is still expanding         | Projected bottom from content height plus pending layout            |
| Keeping a detached reader's place when space changes above them    | Reading anchor snapshot and compensation with a rounding remainder  |
| Which gestures interrupt, and which restore, following             | Wheel, keyboard, mouse and touch policies; touch inertia takeover   |

The design rationale lives with the chat architecture notes, which still describe this behavior in
depth: [bottom following](../chat-scroll-container/docs/bottom-following.md),
[scroll ownership](../chat-scroll-container/docs/scroll-ownership.md),
[reading anchor](../chat-scroll-container/docs/reading-anchor.md) and
[catch-up continuity](../chat-scroll-container/docs/catch-up-continuity.md) and
[input and inertia ownership](../chat-scroll-container/docs/input-and-inertia-ownership.md).

## Layers

| Module                                                         | Role                                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [`scroll-anchor-controller.ts`](./scroll-anchor-controller.ts) | Framework-free controller over a viewport and content element. Tested directly in browser. |
| [`reading-anchor.ts`](./reading-anchor.ts)                     | Anchor capture (binary search over ordered rows) and the pre-change snapshot.              |
| [`pending-layout.ts`](./pending-layout.ts)                     | Registry of height still to come from running layout animations; final bottom projection.  |
| [`use-scroll-anchor.ts`](./use-scroll-anchor.ts)               | React hook: lifecycle, options, automatic anchor snapshots, `data-scroll-anchor-mode`.     |
| [`scroll-anchor.tsx`](./scroll-anchor.tsx)                     | Compound `ScrollAnchor` / `ScrollAnchorViewport` / `ScrollAnchorContent`, no styles.       |

## Integration

Direct children of the content element are the rows a reading anchor can attach to. Row boxes
must be ordered and non-overlapping. After a DOM change the host committed, call `layoutChanged`
in the same layout effect and say what the change means. Changes the host does not report, such
as reflow or loaded media, are still compensated from the tracked anchor when the controller's
resize observer sees them; reporting a change explicitly is only needed to express intent
(`follow`) or to reconcile a change that leaves the content size unchanged.

```tsx
const handle = useRef<ScrollAnchorHandle>(null);

useLayoutEffect(() => {
  if (previousRows.current === rows) return;
  previousRows.current = rows;
  handle.current?.layoutChanged({ follow: appendedByViewer });
}, [rows]);

<ScrollAnchor ref={handle} threshold={2} skipRow={(row) => 'entering' in row.dataset}>
  <ScrollAnchorViewport className="…">
    <ScrollAnchorContent className="…">{rows.map(renderRow)}</ScrollAnchorContent>
  </ScrollAnchorViewport>
</ScrollAnchor>;
```

| `layoutChanged` field | Meaning                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `follow`              | Catch up to the bottom regardless of current intent (the viewer's own new content).              |
| `animated`            | One tick of an animated layout sequence; reconciled even when integer geometry looks unchanged.  |
| `clearance`           | Trailing clearance changed; reconciled even when the content height is unchanged.                |
| `anchor`              | Reading anchor from before the change. Omitted: the tracked snapshot. `null`: do not compensate. |

A host that animates footprints publishes their remaining height through
`registerLayoutTransition` (or one live set through `registerPendingLayout`) so catch-up targets
the final bottom. The viewport dispatches `scroll-anchor-interrupted` when user input takes
scrolling away; dependent visuals can end themselves on it.

`useScrollAnchor(viewport, content, options)` also works on host markup without the compound
parts. It takes the mounted elements, typically from callback refs held in state, and recreates
the controller when either element changes; the **Bare hook** story shows it. A following
viewport tracks every layout change directly; catch-up keeps its velocity and projected target.

## Debugging

`onStateChange` reports mode, distance, velocity, position, projected target and the last intent
transition once per frame. The **Wireframe** story shows all of it, highlights the current reading
anchor row, labels each entering row's slot progress, and styles the viewport border from
`data-scroll-anchor-mode`.

## Boundaries

No virtualization, no arbitrary transforms that reorder row boxes, and no preservation of a removed
anchor. Native input is never prevented. Convergence assumes a mounted viewport and finite layout
changes; a real user interruption is intentional and ends any catch-up.
