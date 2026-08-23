# Two typeahead modes

**Status:** settled · **Touches:** `typeahead.ts`, `use-wheel.ts`, `time-wheel-picker.tsx` ·
**Measured in:** `archive/2026-08-wheel-typeahead-platform`

A wheel with focus that receives a character has to do something with it, and the platform
already has two answers. `<select>` accumulates characters and matches a label prefix.
`<input type="time">` accumulates digits into a value. Both were measured rather than
recalled, and neither will do for the other.

## Why one mode is not enough

A minute wheel is labelled `00`–`59`. Type `1`:

- prefix matching finds `10`, the first label beginning with a `1`;
- numeric accumulation gives **one**.

The second is what the person meant. The same split runs the other way for the meridiem
column, where the labels are `AM` and `PM` and there is nothing to accumulate. So the modes
are not variations on a theme; they disagree about what a buffer _is_.

## One handler, two pure strategies

Everything that differs between them is a decision about a buffer, a key and a list of
labels: no timers, no DOM, no animation. Everything that does _not_ differ is the impure
half — reading the key off the event, holding the buffer in a ref, running the clock,
discarding it when a drag or an arrow takes over, moving the wheel, reporting that a segment
is finished. Two keyboard handlers would duplicate that half, which is the half with the
bugs, so `useWheel` owns it once and takes a `Typeahead`.

Arrow keys are not part of a strategy at all. They mean the same thing on every wheel.

**The strategy belongs to a column, not to a picker**, and the time picker is the proof: its
own meridiem column wants the generic prefix behaviour, so `a` and `p` work with no special
case. There is no "time mode" — there are two digit columns overriding a default.

## The clock is a consequence, not a setting

Measured: a `<select>`'s buffer survives 800ms and is gone by 1000ms, while a time segment's
is still accumulating after 2000ms. That is not an inconsistency to be reconciled. A time
segment is **two digits wide** and closes itself the moment no digit could extend it, so it
is self-limiting and a clock would be redundant. A prefix buffer has **no width bound**, so
a clock is the only thing that can ever end it.

Hence `idleTimeout` lives on the strategy, and one of the two has `null` there.

## The numeric mode, which is the intricate one

Per digit, in order:

1. The accumulated value **is** an item — move there.
2. It is not an item but could still become one with another digit — hold the buffer, do not
   move. This is how a twelve-hour wheel handles a leading `0`: nothing is labelled `0`, but
   `09` is on its way.
3. It is neither — **start over from the digit just pressed**. So `6` then `5` on a minute
   wheel is `06` then `05`, not a silent clamp to `59`. Chromium clamps there, but only
   because a terminal segment has nowhere to advance to; on a visible wheel that travels to
   it, a value nobody typed is worse than the digit they did.

### Settling needs width as well as value

A buffer is finished when no digit could extend it **or** when it is as many digits wide as
the labels are. Both halves are load-bearing, and the second was missing at first.

The value `1` is extendable on a twelve-hour wheel, because `10`, `11` and `12` all exist. So
a value-only test never closes the buffer `01`, and the next digit is swallowed as a third
hour digit: **`0141` selected hour 4** instead of leaving `01` and moving on to the minutes.
A field two labels wide is finished after two digits whatever the value says.

The width test also makes case 3 fall out rather than needing its own branch: on a minute
wheel `3` `7` `2` settles at `37` on width, the buffer is cleared, and the `2` arrives at an
empty one.

### Auto-advance is not a convenience

A finished segment hands focus to the next column, and that is what makes typing across
columns work at all. Without it every digit of `0941` would land in the hour column and
fight the last one. The column reports `onSettled` and nothing more — only the composition
knows whether there is a next column — so the signal is generic and the policy is the time
picker's.

### Worked examples, all verified in the browser

| typed  | result | why                                                                                  |
| ------ | ------ | ------------------------------------------------------------------------------------ |
| `941`  | 09:41  | `9` cannot extend, so it finishes the hour _and_ advances                            |
| `0941` | 09:41  | the `0` is held, `09` settles on width                                               |
| `1241` | 12:41  | `1` holds, `12` settles on width                                                     |
| `0141` | 01:41  | the case the width test exists for                                                   |
| `1021` | 10:21  | `1` selects _and_ stays open; `0` extends it to ten                                  |
| `141`  | 04:01  | `14` is a legitimate reading attempt and fails, so the `4` starts over — type `0141` |

`1021` is the shape worth remembering: the first digit is already a valid value **and**
extendable, so the wheel visibly visits `1` on its way to `10`. That reversal is the cost of
moving on every keystroke instead of waiting for the segment to resolve, and a native segment
does the same thing without a wheel to show it.

## The prefix mode, and its one ambiguity

Characters accumulate and match a label prefix, case-insensitively — except that a buffer of
one repeated character means "show me the next match" and cycles, wrapping.

Those two readings collide on a list holding both `Tuesday` and `TTY`: is `tt` a repeat, or
the prefix `TT`? **Cycling wins**, as it does in a real `<select>`, because there is no way
to make `tt` mean `TT` without giving up repeat-to-advance, which is far more common. The
item is not stranded — `t` `t` `y` reaches it, since a third character breaks the repeat — so
what is actually lost is only the ability to _stop_ at `tt`.

A keystroke matching nothing leaves the buffer untouched rather than appending, so one
mistyped character does not poison the rest of the word. That one is a choice, not a
measurement.

## The buffer's life

Cleared by: a settle, an arrow key, a pointer gesture, the scroll wheel, `Escape`, blur —
because all of those mean the user has stopped spelling. `Backspace` is ignored, because
natively it clears the whole value and a `TimeValue` cannot be empty; doing half of that
would be worse than doing none.

Only unmodified printable keys are consumed, so browser shortcuts still work, and a consumed
key stops propagating — see the last section of `topics/tap-or-drag.md` for why that is not
a Storybook workaround.

## See also

- `archive/2026-08-wheel-typeahead-platform` — the measurements, and the two ways the probe
  measured nothing before it measured anything.
- `topics/scrolling-without-a-scroller.md` — what carries the wheel to a matched row.
