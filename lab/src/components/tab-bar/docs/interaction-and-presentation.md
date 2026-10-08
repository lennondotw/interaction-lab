# Interaction and presentation

TabBar uses one semantic button tree at final layout and one noninteractive painted tree following
the springs. Separating them lets the next close target become available immediately during rapid
closing while retaining a clickable alias for an X that is visibly still moving.

## One semantic owner

[TabInteractionRow](../tab-interaction-row.tsx) contains native select/close/add buttons at final widths
and gaps. `opacity-0` hides their paint without removing native focus or accessibility. It is absolute
only at the **row** level; its tabs and buttons use normal flex flow. There is one accessible label,
keyboard focus stop, and action handler per control. Labels, `aria-pressed`, shortcut hints, and native
title tooltips stay on these buttons. This preserves the existing button semantics rather than adding
an ARIA tabpanel model.

The animated row is `aria-hidden` and `pointer-events-none`, and paints divs/icons instead of buttons.
Sizing probes are also hidden/noninteractive. A removed ID disappears from the semantic row at
logical removal; its retained presentation cannot accept input. There is no second focusable X.

## A visible X remains actionable

[The interaction hook](../use-tab-interaction.ts) handles pointer input on the enclosing strip and
resolves local coordinates against both geometries. It forwards the resulting stable ID to the same
controlled callback used by native keyboard/assistive actions. No synthetic click is sent to a clone.

The priority is deliberate:

1. A final close rectangle.
2. An eligible painted close rectangle, clipped by its current tab.
3. Final then painted add rectangles.
4. Final then painted title rectangles.

A final X wins when it overlaps another ID's painted X. Otherwise, a visible X takes priority over a
final title at the same position. Add aliases precede titles but cannot cover a close target. Gaps
with no overlapping action remain inactive. These policies make animation-period input intentionally
different from the old animated-button-only tree; all settled geometry/actions remain equivalent.
They also mean an overlapping visible control can lose priority. This is deterministic ownership,
not a promise that every painted shape can independently win at the same coordinate.

The strip's pointer surface includes both final and painted occupied extents. A visible alias outside
the final semantic row can therefore receive input through the strip itself. Interaction does not
feed back into destination allocation.

## Press and native activation

Primary pointer down resolves a control, focuses its real native button without a pointer focus
ring, stores the action control/ID, its pointer ID, and the presentation control at press-down, then
captures the pointer on the strip. Pointer up resolves again and activates only the same control/ID.
Moving outside or resolving a different action at release cancels activation; pointer cancellation,
lost capture, or window blur cancels the press immediately. This prevents a press on one X from closing its neighbor after the layout changes. Removed IDs lose pressed/focused paint
and cannot activate even while their visual footprint remains.

Pointer activation is dispatched on release by this one route. Native `click` handles only
`detail === 0`, retaining Space, Enter, and assistive activation without dispatching a second action
for the same pointer click. Right/secondary pointers do not start this route. Touch can activate a
control but does not enter the hover-hold policy.

## Shared feedback and active state

Feedback and activation use different hit results. `hovered` follows only eligible, visibly clipped
presentation rectangles (`hitTabPresentation`). Pointer `pressed` records that presentation result
at down and remains painted only while the pointer still hits that same painted control. Crossing
away clears it rather than highlighting the neighbor as pressed. The action result and native focus
can name a different ID because final X has action priority; this must not move pointer feedback to
an X that is not beneath the cursor. Keyboard Space/Enter feedback follows the native focused ID.

One shared state exposes `data-hovered`, `data-pressed`, and `data-focus-visible` to the painted tree.
Hover/pressed alter only content-layer opacity, never the whole control rectangle. The title viewport
and each X/+ SVG own `opacity`; inherited neutral-950 / dark neutral-50 stays fully opaque, including
SVG `currentColor`. Idle opacity is 70%; hover and pressed are both 100%. This stage has no distinct
active/pressed appearance. Applying alpha after compositing the whole SVG prevents its crossing
strokes from double-compositing color alpha. Separators, outer strokes, and focus rings remain on
opaque parent slots with their own independent styling. A removed ID
gets no pointer feedback even while its exit is visible. Keyboard focus keeps the 70% outline. There
is no independent CSS hover/active on the invisible semantic row.

Focus is owned by the real native button. Tab/native focus capture and keyboard input update the
painted focus ring; pointer focus suppresses it. This draws the ring on the visible control rather
than at an invisible final position. Active selection remains the host's controlled `activeId`,
independent of focus. Both layers consume its current value. A context outside AnimatePresence also
updates retained exits, whose captured render props would otherwise preserve stale active styling.
Presence excludes exits from selection and feedback.

## Stationary pointer and holding

The hook caches non-touch client coordinates and resolves them again on footprint changes. A
stationary pointer highlights the next eligible X only once its painted rectangle reaches that
coordinate; final input can already be ready before this visual handoff. Hold membership
uses the envelope `[0, max(final occupied width, painted occupied width))`, including gaps and both
add extents, at the strip's actual height. This avoids an early release while either useful surface is
still occupied. It can include the span between two add positions; it does not extend to unrelated
empty container width or story diagnostics.

Only a membership transition calls the existing enter/leave controller. Keyboard closing, selection,
or state rendering does not synthesize leave. Geometry can still genuinely move the envelope away
from a stationary pointer. Resize retains hold intent/deadline; the resized envelope can independently
produce a real membership change. The 500 ms release delay remains real time at every playback rate.

Evidence: [geometry tests](../__tests__/tab-geometry.test.ts) establish action arbitration, presentation-only
feedback, clipping, removed-ID exclusion, and stable-ID comparison. Native event routing, focus,
capture cancellation, stationary hover, and presence integration require the [browser scenarios](./verification.md); the unit suite
does not claim to simulate the browser's pointer/focus event system.

[Architecture index](../README.md)
