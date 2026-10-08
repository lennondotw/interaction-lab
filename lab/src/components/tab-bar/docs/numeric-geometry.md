# Numeric layout geometry

The destination, the painted footprint, and the action under a pointer are separate values. The
[geometry model](../tab-geometry.ts) names their rectangles so input does not have to infer layout
policy from an animated DOM measurement.

## CSS still owns size allocation

The hidden sizing row continues to resolve natural widths with the browser's flex algorithm. We do
not replace its fractional distribution with an approximate division formula. It supplies available
width, every natural tab width, gap, add width, and close basis. Held widths cap those destinations.
The close basis comes from an absolute `basis-7` probe: it participates in neither flex allocation nor
gap counting. Its default is 28 px; JavaScript reads CSS instead of copying the number.

After measuring and resolving all destinations, `useTabLayout` publishes a `TabStripGeometry` snapshot
and dispatches spring targets in the same layout pass. Snapshot equality avoids a state update when
measurement has not changed. This React state stores the result of external browser measurement; it
is not a mirror of animation progress. New semantic controls are established before paint. The row
filters obsolete measured IDs during the intermediate render before the next measurement, rather
than pairing titles by array index across a close or reorder.

## Coordinates and prefix sums

Rectangles use CSS pixels relative to the strip's left edge. A tab's input is its stable ID, width,
leading gap, close capacity, and presence. In DOM presentation order:

```text
left[i] = previousRight + gap[i]
right[i] = left[i] + width[i]
titleWidth[i] = max(0, width[i] - closeCapacity[i])
rawCloseLeft[i] = right[i] - closeCapacity[i]
clippedClose[i] = [max(left[i], rawCloseLeft[i]), right[i])
addLeft = lastRight + addGap
stripWidth = addLeft + addWidth
```

An empty strip has the add rectangle at zero and no leading gap. Rectangles are half-open; zero-width
controls cannot be hit. Gaps belong to neither neighboring action. A frozen slot can extend left of
its tab during presence, but only its intersection with the tab is a visible input alias. The X's
14 px icon size does not enlarge that clipped hit rectangle.

Final geometry contains only logical IDs. Presentation geometry reads persistent MotionValues,
including retained exits. The hook reads presentation DOM **order**, because AnimatePresence owns
where exits remain among survivors; Map insertion order is not that order after arbitrary updates.
It does not read animated DOM widths or close rectangles to determine geometry. Only the strip's
page origin/height is measured to convert client coordinates into this local coordinate system.

## Close capacity is a lifecycle value

[The capacity controller](../tab-close-capacity.ts) owns a MotionValue separate from width/gap. Its
ordinary value is `min(CSS basis, current width)`. Entry holds `min(CSS basis, destination width)`;
exit holds the capacity current at logical removal. A retained ID returning to presence resumes
ordinary capacity. Width completion ends entry; gap completion does not. Immediate layout ends
entry too. Completion ownership remains the spring controller's responsibility.

The painted title remains `flex-1 min-w-0`; the numeric-capacity close slot is `shrink-0`, centered,
and in flow. Ordinary compression therefore retains the original two stages: title to zero, then
close capacity to zero. `justify-end` on the tab keeps a frozen overflowing slot right anchored.
No extra close spring, absolute per-tab positioning, or scale transform is introduced.

## Scheduling and cost

Width/gap/capacity subscriptions schedule one coalesced `preRender` input refresh. Pixel animation
continues through MotionValues. React interaction state changes only when the resolved hovered,
pressed, or focused control changes; it does not receive the whole strip geometry every frame.
Resource cleanup cancels scheduled refreshes and removes subscriptions/window listeners.

Destination measurement, prefix sums, and action/feedback hit resolution are O(n). The component remains a mounted
small-tab-strip design; this refactor does not add virtualization. Numerical input bounds and painted
browser flex bounds can differ by fractional quantization, so verification compares their edges with
subpixel tolerance, not exact raster equality.

Evidence: [geometry tests](../__tests__/tab-geometry.test.ts),
[capacity tests](../__tests__/tab-close-capacity.test.ts), and
[browser verification](./verification.md). The destination budgets, 25/1 spring, velocity handoff,
shared frame origin, resize cancellation, and release/repeat clocks are unchanged.

[Architecture index](../README.md)
