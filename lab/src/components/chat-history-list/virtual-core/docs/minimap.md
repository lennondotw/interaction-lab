# Minimap

The playground's canvas overview of the whole list. Its view is state of its own; its drawing is split into three layers.

## View

The minimap has state of its own that cannot be derived from the list: whether it fits the
whole list or is zoomed, and which part of the list it shows. It lives on the playground model
(`model.minimap`) and the state panel shows it, so it is never hidden inside a component.

Defined behaviour, each rule covered by
[`minimap-view.test.ts`](../debug/__tests__/minimap-view.test.ts):

- **Fitted.** The whole list plus a 10px safe margin at each end fills the canvas. The scale is
  recomputed from the current height and total every frame, so resizing the minimap or
  changing the list keeps it fitted.
- **Zoomed.** Cmd + wheel stores an absolute scale, up to one pixel per pixel. Resizing the
  minimap or changing the total keeps that scale and the content at the top edge; only how much
  shows below changes.
- **Fitting catches up with a zoom.** When fitting would show at least as much as the zoom (the
  canvas grew, or the total shrank), the view returns to fitted and forgets the zoom. Shrinking
  again later keeps it fitted.
- **Following.** The view follows the list viewport only when the list reports that it moved,
  and once when the canvas first gets a size. It pans just far enough to keep the frame the safe
  margin inside the canvas. Scrolling the minimap with the wheel is left alone until the list
  moves again.

### Decision: fitting catches up with a zoom

Two behaviours were considered for a zoom that fitting has caught up with:

1. **Keep the zoom.** The effective scale is raised to fitting while the stored zoom survives,
   and the zoom comes back if the canvas shrinks or the total grows again.
2. **Return to fitted.** The stored zoom is dropped as soon as fitting shows as much.

We chose the second. Once the view shows the whole list it is indistinguishable from fitted, so
a stored zoom would be state nobody can see, and it would reappear unexpectedly. In this
playground the total changes all the time: forgetting measurements drops it sharply and
measuring rows raises it again, which under the first behaviour made the zoom silently switch
off and on. The cost is that a temporary resize loses the zoom, which one Cmd + wheel restores.

## Layers

The minimap is split so its geometry is tested without a canvas:

| Layer    | File                                                  | Responsibility                                                            |
| -------- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| View     | [`minimap-view.ts`](../debug/minimap-view.ts)         | Zoom, the visible part of the list, following, scrolling; pure functions. |
| Scene    | [`minimap-scene.ts`](../debug/minimap-scene.ts)       | Shapes in CSS pixels built from the core and a settled view.              |
| Renderer | [`minimap-renderer.ts`](../debug/minimap-renderer.ts) | Snaps shapes to device pixels and draws them; the only code using canvas. |

[`virtual-core-minimap.tsx`](../debug/virtual-core-minimap.tsx) only wires them to the DOM:
each frame its painter settles the view, builds the scene and renders it. A retained-mode
library such as Konva was considered and not used: a node per row costs more than drawing a few
thousand rectangles directly at 120 fps, its per-shape events and transforms are not needed, and
it would not make the geometry any easier to test. Replacing the renderer is the whole cost of
switching later.

[`debug/__tests__`](../debug/__tests__/) covers the view (fitting, safe margins, following,
scrolling, zooming around the pointer, absolute zoom), the scene built from a real core (frame
and line positions, rows filling the canvas mid-list, flash fading), and the renderer against a
recording context (inner-side edges, half-pixel snapping).

[Index](../../README.md)
