# Chat scroll container: following, interaction, and message animation

The `With Message Input` story combines the scroll container, composer, and send flight.
The list owns layout and scrolling; a visual copy handles the transition from composer to bubble.
The story connects the flight hook explicitly; it is not built into `ChatScrollContainer`.

## List items and spacing ownership

Use `items` for a heterogeneous list of `ChatMessage`, `ChatDateItem`, `ChatStatusItem`, and `ChatContentItem`. The existing `messages`
prop remains a shorthand for a message-only list; `items` takes precedence if both are supplied.
IDs must be stable and unique across every item type. Date items use `kind: 'date'`, `dateTime`, and `label`; status items use `kind: 'status'` and `content`.
The list renders them with the exported `ChatDateLabel` and `ChatStatusLabel` components. Both share
message insertion layout, top alignment, and the default entrance. Custom items still accept React
content through `kind: 'content'`.

The list has zero gap and its item boxes touch edge to edge. Each item owns its **leading** space,
including that space in its measured footprint in both natural layout and animated layout. The first
item has no leading gap; adjacent messages from the same side use 3px, date boundaries use 16px, and other boundaries use 8px.
An item's `gapBefore` overrides that boundary's default. Outer list padding and composer clearance
remain container responsibilities. Custom content should keep its external spacing in `gapBefore`.

Inserting an item immediately updates the logical order, grouping, and tails. It can also change the
next item's leading gap; both slots transition toward their new targets in the same layout update.
Measurement and reading anchors use the generic item body, without depending on bubble markup.

Every newly inserted item uses the shared expanding layout slot and, by default, **opacity 0 to 1
with a 20px upward entrance**. Content stays full size and top aligned after its owned leading gap;
shrinking or growing the slot never bottom-aligns or clips that content. Layout uses the 28 / 1
spring; the default visual entrance uses 26 / 1. Initial history renders without entrance animation.
Composer flight and typing-to-message crossfade remain explicit special cases. Typing keeps its
reversible exit lifecycle while using the same spacing ownership and top alignment. This does not
add a general removal animation for arbitrary items.

```tsx
<ChatScrollContainer
  items={[
    { id: 'hello', variant: 'incoming', content: 'Hello.' },
    {
      id: 'date',
      kind: 'date',
      dateTime: '2026-09-15',
      label: 'Tuesday, September 15',
    },
    { id: 'reply', variant: 'outgoing', content: 'Good morning.' },
    { id: 'status', kind: 'status', content: 'Looking up the cafe…' },
  ]}
/>
```

The `Mixed Items` story inserts a date before the final item and appends a plain notice, both using
the default entrance. It also exercises the next message's gap changing when a date splits a group.

The manual stories expose both receive paths: `Receive a message` preserves typing and inserts
before the indicator using the regular upward fade. `Receive a message and turn typing off` commits
the reply and typing-off together, replacing the indicator with a crossfade. Automatic replies use
the latter behavior for their first reply. The container follows the supplied item and typing state;
it does not implicitly turn typing off when a message arrives.

## Automatic reply demonstration

The `Automatic Replies` story keeps only the composer and 0.25× / 1× animation controls.
`Automatic Replies With Guide` reuses the same `ChatDemo` and adds the happy-path inputs, expected
replies, and label cues alongside it (below it on narrow screens). The guide reads `demoConversation`
directly; the complete presenter walkthrough is also recorded in that preset's code comment. Try this
conversation in order: `Hey!`, `Coffee this afternoon?`, `Where should we meet?`, `What time?`,
and `See you there!`. Each preset returns one to three related messages. The first send inserts a
`Today` date item before the outgoing message. The coffee preset inserts a status item halfway
between its second and third replies. Labels remain in the timeline. These insertion rules belong
to the story; the list provides the reusable types, rendering, spacing, and animation.

For a taller composer, replace the short coffee invitation with this bulleted preset (paste it,
or use Shift+Enter for line breaks). Both versions match the same conversation:

```text
- Good coffee
- A quiet table outside
- A walk by the park afterward
```

Matching ignores capitalization, repeated whitespace, and final `.`, `!`, or `?` characters.
Unmatched input selects exactly one fallback using a stable text hash. The same normalized input
also produces the same 800–1200ms reply delays, including the wait after typing starts. Typing begins
after 600ms and stops with the first reply; it does not reappear between replies in that batch.
Playback controls affect motion only. Rapid sends queue complete reply plans in submission order,
and leaving the story cancels the timer. Presets and hashing live in `chat-demo-replies.ts`.

## Bottom following and user control

Following is explicit state, not a value recomputed from distance on every scroll event.

| State       | Meaning                                                                               |
| ----------- | ------------------------------------------------------------------------------------- |
| `following` | New content may keep the viewport at the bottom. No catch-up scroll spring is active. |
| `animating` | A programmatic spring is catching up to the bottom; following remains enabled.        |
| `detached`  | The user owns scrolling. Incoming messages do not pull the viewport down.             |

The bottom-zone distance is `max(0, scrollHeight - clientHeight - scrollTop)`. The component defaults
to a 2px threshold; the stories also offer 20px to expose edge cases. Being inside this zone does not
by itself enable following, and moving outside it during a programmatic animation does not disable
following. A separate 0.5px geometry tolerance identifies a settled bottom and equivalent spring targets.

### Giving control to the user

An upward `wheel` event immediately detaches, before native scrolling needs to move even one pixel.
Pointer-down inside the viewport also detaches, as do scroll keys: arrows, Page Up/Down, Home, End,
and Space. An unowned upward `scroll` event is a fallback for other native scrolling paths.

Detaching first closes the animation's write gate, then stops and resets its MotionValue at the
current position. A generation counter invalidates old completion callbacks, so a cancelled spring
cannot later snap to the bottom or restore following. Input handlers never call `preventDefault`;
native scrolling remains available. The viewport uses `overflow-anchor: none` and `scroll-behavior:
auto`, leaving application animations and reading-anchor compensation under one controller.

### Restoring following without trapping the user

A detached viewport only regains following when an unowned downward scroll reaches the bottom zone.
During a held pointer interaction, restoration waits for release (or cancellation), requires the last
nonzero scroll direction to be downward, and checks the zone again. Restoring eligibility does not
snap away the remaining threshold pixels; a later content change can follow them.

An upward gesture therefore stays detached even if it stops inside the 2px or 20px zone. There is no
timeout that silently reattaches, no requirement to escape the whole zone in one event, and no
`scrollend`-based restoration. Trackpad contact and the end of momentum are not inferred. Downward
momentum can restore following under the same direction-and-zone rule; new upward input cancels it
immediately. Sending a local message is the explicit exception: it requests bottom scrolling even
from detached history, and that new scroll remains interruptible.

### Separating layout movement from user scrolling

The controller uses one position-observation cursor for both layout callbacks and native `scroll`
events. Every programmatic write records its actual resulting position immediately, including
browser rounding. A later or coalesced event therefore has no unobserved movement to interpret.
The layout cache used to decide whether a spring needs retargeting is separate from this cursor.

A native upward displacement counts as a browser clamp only when the scroll range shrank and the
position reached the new bottom boundary. Fractional content/viewport measurements detect changes
that integer `scrollHeight` misses; the boundary comparison allows 1px for integer rounding. This
is not the configurable follow threshold. A layout change alone never excuses arbitrary scrolling.

Reconcile position **before** updating the layout cache or taking any early return, including while
`animating`. Either callback can arrive first. In the interrupted-send regression, typing replacement
shortened the list and the browser clamped `scrollTop`. The layout callback updated the old height
before the queued `scroll` arrived, erasing evidence of the shrink. The stale position then looked
like user input, detached following, and left the flight waiting forever for the real row to arrive.
Keep this ownership rule in the controller; do not add per-message suppression flags or timeout
windows. Genuine upward wheel/pointer/key input still detaches immediately, and unowned movement
away from the new boundary remains user-controlled even during a layout animation.

`scripts/test-chat-scroll-ownership.mjs` covers both callback orders, duplicate events, integer and
fractional clamps during catch-up, and real escape during resizing. It also runs the fresh-page
0.25x `Hey!` → scroll up → multiline bullet send → automatic replies regression without a rescue
scroll. Composer resize, typing exit/replacement, and future row types share the same policy.

First mount waits for the complete layout, including composer measurement and bottom clearance,
then positions at the bottom before paint without animation. At an already settled bottom, composer
resizing and animated row-height changes update scrolling immediately; the layout animation supplies
the motion. An active catch-up spring instead receives the new destination. While detached, appends
and composer changes preserve position within the available scroll range; insertion above the reader
compensates only to preserve the visible reading anchor, without enabling following.

The story displays state, bottom-zone membership, distance, position, target, velocity, and the last
transition reason. Use these together: `Near bottom: Yes` and `Following: No` is a valid user-controlled
state, not an error. Browser checks cover escape inside the 20px zone, downward restoration, interruption
of catch-up scrolling, fractional collapse, and detached history preservation.

## Sending a message

Before inserting the message and clearing the draft, capture the composer's position, size, and corners.
The new message is measured at its natural width and height before paint. Its row becomes a temporary
layout slot that expands from zero to the full height, including its preceding gap. The real bubble
stays hidden while a visual copy animates from the captured composer geometry into its shape.

The copy sits outside the scroller and below the composer, so the composer's glass can cover it.
Translation and scaling use `transform`, with inverse scaling on the text to preserve its font size.
Text wraps at the final bubble width and starts at the bubble's normal left/top inset within the
captured composer box. The text's `left top` transform origin lets inverse scaling preserve both
its natural glyph size and its visual insets.

### Text placement during flight

The text starts close to the left edge so sending feels continuous with the composer. As the body
narrows, its text gradually settles around the bubble center. During overshoot, text and body move
together, keeping the message visually cohesive.

Horizontal placement derives from the same spring progress that moves and resizes the bubble:

```text
q = clamp(horizontalSpringProgress, 0, 1)
offsetWeight = (1 - q) * (1 - q^4)
textOffset = targetTextOffset + (initialTextOffset - targetTextOffset) * offsetWeight
textCenterX = currentBubbleCenterX + textOffset
```

Offsets are measured from the bubble center to the text-box center in visual CSS pixels. The initial
offset preserves the departure's left inset using the final text wrapping width. The target offset
comes from the real bubble's measured layout; it is zero for centered text boxes. Painting converts
the resulting center offset into local `left` coordinates and compensates for the carrier's scale.

The linear factor keeps early motion close to a constant left inset. The fourth-power factor delays
most of the inward adjustment until later in the flight. At arrival, the offset weight and its first
derivative are both zero, so entering or leaving overshoot preserves continuous position and velocity.
Clamping applies only to this relative offset: the bubble's spring retains its natural overshoot,
and the text shares that motion. Because placement derives from the flight's progress, playback-speed
changes and destination compensation stay synchronized with it.

Vertical placement keeps the first line at the visual top inset. Final bubble wrapping may require
more lines than the wider composer, so lines are clipped to the moving body and revealed downward
as it grows. This preserves the first line's position throughout the height change.

`scripts/test-chat-send-flight.mjs` samples narrow and wide viewports at 0.25x with short text, bullets,
and long text. It checks the departure inset, horizontal containment, shared center motion during
overshoot, natural text dimensions, and vertical top alignment, alongside history sends, consecutive
sends, interruption, and handoff.

The hidden message remains the layout anchor. When expansion finishes, the row returns to natural
sizing without changing its footprint. The visual copy hands off only after its own animation finishes,
all active insertion slots finish, and it aligns with the original bubble.

## Sending from earlier history

Sending a local message always starts a scroll to the bottom, even when following was previously
inactive. Receiving a message only scrolls when the container is already following.

From earlier history, the new message may initially sit far below the visible viewport.
The flight targets its **predicted screen position after scrolling reaches the bottom**:

```text
finalBottom = max(0, currentContentHeight + unexpandedHeight - clientHeight)
remainingScroll = max(0, finalBottom - scrollTop)
destinationY = currentMessageScreenY + unexpandedHeightBeforeMessage - remainingScroll
```

The bubble therefore flies directly from the composer toward its final visible position while the
list catches up. Ordinary scrolling changes both terms equally, keeping the predicted destination
stable instead of making the bubble dive toward an offscreen row and return. Pending row heights
cancel in the same way: expansion changes current geometry but not the predicted final destination.
A changing gap on the target row is included in the projection as well.

The scroll spring is faster than the flight spring. If the flight still finishes first, its copy
holds the final shape until the real message arrives before handing off.

## Consecutive sends

Each message has its own flight keyed by a unique ID, including two consecutive messages containing
`1`. However, inserting the second message moves the first message's predicted destination upward:
a 33px single-line bubble plus the 3px same-group gap shifts it by 36px.

Substituting that new destination into the original flight progress would cause a jump. Instead,
the motion has two independent parts:

- **Original flight:** follows the initial trajectory and completes its shape transition without
  restarting when another message arrives.
- **Destination compensation:** a separate spring follows the displacement from the initial
  destination and adds that offset to the original flight. Further changes preserve the
  compensation's current position and velocity.

The first bubble therefore finishes changing shape on its original schedule. If compensation is
still moving, it continues upward as a fully formed bubble. Normal handoff requires the scroller
to be within 1px of the bottom, the compensation spring to finish, and the copy's top to align with
the real message's top within 1px. Continuous sends may keep the copy alive longer, but they do not
keep restarting the original shape transition.

## Inserting anywhere in the conversation

Every new message ID uses the same layout mechanism, whether appended or inserted between existing
messages. Initial history skips it. Final dimensions come from the real bubble; an expanding slot
controls list height while visual entrance runs independently. Adjacent group gaps are included in
layout transitions, while tail visibility responds to the new conversation immediately.

Slots never clip their contents. Bubbles remain aligned to the slot's top, after the preceding gap.
The list surface bounds the scroll extent to its animated layout height; hidden measurement anchors
cannot enlarge it through overflow. Visible entrance copies render in a separate layer outside that
surface, so their full body and tail remain visible even while their slot is still small.

Messages fade in from 20px below their positions by default, including sends without a composer.
Their visual copies live outside the slots,
so expansion never clips or scales the text. Outgoing composer flights use the shared final-layout
projection above. Multiple active slots contribute their remaining heights to the same projection.
Resizing the viewport remeasures active slots at the new available width.

At a settled bottom, the scroll controller directly tracks each layout update. Expansion already
supplies smooth motion, so adding another scroll spring would make it lag. From earlier history, a
local send still uses the catch-up spring, aimed at the fully expanded bottom. While detached, an
append leaves scrollTop alone; insertion above the reader compensates for the displacement of the
visible reading anchor. Fractional scroll rounding is carried into the next update to avoid drift.
Native input always takes priority over following.

## Typing indicator exit

Once settled, the typing indicator occupies its own natural 33px row. Turning it off temporarily
replaces that row with a placeholder measured from the indicator's height and preceding gap.
The indicator becomes an absolute visual inside that placeholder and fades while moving down 10px,
without being squashed, while the placeholder shrinks to zero. Tail visibility follows typing intent
immediately: hide on entry, restore on exit or receive. The placeholder retains the original group
gap so this tail change does not add a spacing jump. Reopening during exit reverses the current
progress and restores the normal row.

Typing entry measures its natural 33px body and preceding gap before paint, then expands a temporary
slot from zero to that complete footprint. Like message bubbles, its visual stays aligned to the
slot's top after the preceding gap, for both entry and exit. Slot height never offsets that anchor;
the separate 20px entrance transform fades it upward from below. It can initially pass behind the
floating composer as the list makes room, then settles above it with the normal clearance.
Pending entry height participates in the shared final-layout projection used by scrolling and flights.
After expansion, the indicator returns to natural flow. Incoming messages use the same visual offset;
all presence transitions share the story's animation speed control.

When already settled at the bottom, scrolling follows each height update immediately: the placeholder
spring supplies the smooth motion, so no second scroll spring needs to chase it. An active catch-up
scroll retains its spring, and detached history browsing retains its position within the remaining
scroll range. Upward input can still detach at any time. Receive inserts the new message and requests
typing replacement in the same update: the new slot starts at the typing row's existing height and
gap, then transitions to the message's measured size. Typing remains as a zero-height visual overlay
aligned to that message. Both visuals crossfade without an additional vertical entrance or exit offset;
there is no separate shrinking spacer. Ordinary receives without typing retain the 20px
entrance. Reduced motion skips these transitions.

If typing turns on again during replacement, the same commit starts a fresh entry slot with a measured
33px target body. The old replacement cannot clear that entry request or retain ownership of its
positioning. Entry completion clears absolute positioning and restores natural flow. Entrance copies
synchronize tail visibility from the real messages during the commit: grouping and target layout take
effect immediately, while opacity, displacement, and temporary slot height remain animated.

Only explicit layout-animation ticks receive immediate bottom tracking. ResizeObserver notifications
for geometry already applied by those ticks are ignored; an unrelated natural-height change does not
become an instant scroll merely because another message is still entering.
Explicit ticks still run when integer `scrollHeight` is unchanged: fractional height shrinkage can
clamp `scrollTop` by a fraction of a CSS pixel. Recording that position as layout-owned prevents the
subsequent native scroll event from being mistaken for an upward user scroll.

## Parameters and interruption

Springs use natural angular frequency / damping ratio, converted to Motion's physical parameters
by the shared helper: `18 / 0.8` for flight, `22 / 1` for scrolling, destination compensation, and
typing exit visuals, `26 / 1` for typing and message entrance visuals, and `28 / 1` for message
insertion and typing placeholder height changes.
Mass defaults to 1. Vertical flight progress starts 100ms later. The story's animation speed control
applies to all of these animations.

An upward wheel gesture, a pointer press in the scrolling area, or a scroll key cancels the flight
and immediately reveals the real message, returning control to native scrolling. Reduced motion
skips the flight entirely.

## Code entry points

- [Story composition and send timing](./chat-scroll-container.stories.tsx): composer measurement,
  message insertion, and demo buttons.
- [Flight and destination compensation](../chat-send-flight/chat-send-flight.ts): visual copies,
  predicted destinations, independent compensation, and handoff.
- [Scroll controller](./chat-scroll-controller.ts): following state, bottom scrolling, and user interruption.
- [Scroll policy checks](../../../../scripts/test-chat-scroll.mjs): threshold escape and restoration,
  local and remote sends, native interruption, fractional layout changes, and composer resizing.
- [Insertion layout](./chat-insertions.ts): measured slots, gap changes, and reading anchors.
- [Shared projection](./chat-layout.ts): remaining layout height and final scroll destinations.
- [Typing exit](./use-typing-exit.ts): temporary measured spacing, fade, and reversal.
- [Browser regression checks](../../../../scripts/test-chat-send-flight.mjs): sending from history,
  consecutive sends, handoff, and interruption.
- [Typing exit checks](../../../../scripts/test-chat-typing-exit.mjs): bottom alignment during collapse,
  reopening, receive, native interruption, and reduced motion.

- [Insertion checks](../../../../scripts/test-chat-insertion.mjs): typing stability during send,
  replacement expansion, middle insertion, reading anchors, and interruption. The `Insert In History`
  story inserts incoming or outgoing messages immediately before the final message for manual inspection.
  Both insertion buttons use the upward fade entrance (`entrance: 'fade'`); the regular send action
  retains its composer flight.
