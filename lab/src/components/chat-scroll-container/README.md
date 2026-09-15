# Chat scroll container: send animation

The `With Message Input` story combines the scroll container, composer, and send flight.
The list owns layout and scrolling; a visual copy handles the transition from composer to bubble.
The story connects the flight hook explicitly; it is not built into `ChatScrollContainer`.

## Sending a message

Before inserting the message and clearing the draft, capture the composer's position, size, and corners.
The new message then occupies its normal place in the list but stays hidden while a visual copy
animates from the captured composer geometry into the bubble's shape.

The copy sits outside the scroller and below the composer, so the composer's glass can cover it.
Translation and scaling use `transform`, with inverse scaling on the text to preserve its font size.
Text wraps at the final bubble width. Any lines that do not yet fit are clipped to the moving body
and revealed as it grows.

The hidden message remains the live layout anchor. Once the animation finishes and the copy aligns
with that message, remove the copy and reveal the original.

## Sending from earlier history

Sending a local message always starts a scroll to the bottom, even when following was previously
inactive. Receiving a message only scrolls when the container is already following.

From earlier history, the new message may initially sit far below the visible viewport.
The flight targets its **predicted screen position after scrolling reaches the bottom**:

```text
remainingScroll = max(0, scrollHeight - clientHeight - scrollTop)
destinationY = currentMessageScreenY - remainingScroll
```

The bubble therefore flies directly from the composer toward its final visible position while the
list catches up. Ordinary scrolling changes both terms equally, keeping the predicted destination
stable instead of making the bubble dive toward an offscreen row and return.

The scroll spring is faster than the flight spring. If the flight still finishes first, its copy
holds the final shape until the real message arrives before handing off.

## Consecutive sends

Each message has its own flight keyed by a unique ID, including two consecutive messages containing
`1`. However, inserting the second message moves the first message's predicted destination upward:
a 35px single-line bubble plus the 3px same-group gap shifts it by 38px.

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

## Parameters and interruption

Springs use natural angular frequency / damping ratio, converted to Motion's physical parameters
by the shared helper: `22 / 0.8` for flight, `28 / 1` for scrolling and destination compensation,
with mass defaulting to 1. Vertical flight progress starts 80ms later. The story's animation speed
control applies to all three animations.

An upward wheel gesture, a pointer press in the scrolling area, or a scroll key cancels the flight
and immediately reveals the real message, returning control to native scrolling. Reduced motion
skips the flight entirely.

## Code entry points

- [Story composition and send timing](./chat-scroll-container.stories.tsx): composer measurement,
  message insertion, and demo buttons.
- [Flight and destination compensation](../chat-send-flight/chat-send-flight.ts): visual copies,
  predicted destinations, independent compensation, and handoff.
- [Scroll controller](./chat-scroll-controller.ts): following state, bottom scrolling, and user interruption.
- [Browser regression checks](../../../../scripts/test-chat-send-flight.mjs): sending from history,
  consecutive sends, handoff, and interruption.
