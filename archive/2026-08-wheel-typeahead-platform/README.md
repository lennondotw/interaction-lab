# What should typing into a wheel do?

**Date:** 2026-08 · **Status:** measured, shipped in `Components/TimeWheelPicker` ·
**Applies to:** Chromium; the time input's shape follows the browser locale

A wheel with focus that receives a character has to do something with it, and there are two
established behaviours to copy rather than invent. `<select>` accumulates characters and
matches a label prefix. `<input type="time">` accumulates digits into a value. The question
was what each actually does, precisely enough to reimplement — and whether one of them
would do for both kinds of column.

It would not. They disagree about what a buffer is, when it ends, and what a repeated key
means, and the disagreement is not stylistic: a minute wheel labelled `00`–`59` reads a
typed `1` as **one** under the numeric rule and as **ten** under the prefix rule, because
`10` is the first label beginning with a `1`.

## Measured

```sh
pnpm exec playwright install chromium               # once
node archive/2026-08-wheel-typeahead-platform/probe.mjs
```

|              | `<input type="time">` segment | `<select>`                      |
| ------------ | ----------------------------- | ------------------------------- |
| buffer       | a number, two digits wide     | a string, unbounded             |
| match        | exact value                   | label prefix, case-insensitive  |
| repeated key | n/a, digits accumulate        | cycles the matches, wrapping    |
| idle timeout | **none**                      | **~1000ms**                     |
| ends when    | no digit could extend it      | the clock runs out              |
| on ending    | focus moves to the next field | nothing; there is no next field |

Sequences worth keeping, all of them from the probe:

| keys                 | result      | reading                                            |
| -------------------- | ----------- | -------------------------------------------------- |
| `1` `2` (hour)       | `12:30`     | accumulates — twelve, not two                      |
| `0` `9` (hour)       | `09:30`     | a leading zero is held rather than rejected        |
| `9` `4` (hour)       | `09:04`     | `9` cannot extend, so the `4` lands in the minutes |
| `→` `6` `5` (minute) | `05:59`     | the terminal segment clamps, having nowhere to go  |
| `1` ⏸2000ms `2`      | `12:30`     | no idle timeout                                    |
| `1` `↑` `2`          | `02:30`     | an arrow key closes the buffer                     |
| `1` `→` `←` `2`      | `02:30`     | leaving the segment closes it                      |
| `1` `⌫`              | `""`        | backspace clears the whole value, not the buffer   |
| `t` `t` `t` `t` `t`  | Tue…TTX…Tue | a repeat cycles the T words and wraps              |
| `t` `h`              | Thursday    | two _different_ characters are a prefix            |
| `t` `t` `y`          | TTY         | a third character breaks the repeat                |
| `m` ⏸800ms `o`       | Monday      | buffer alive                                       |
| `m` ⏸1000ms `o`      | March       | buffer expired                                     |

## The timeout is a consequence, not a setting

The two numbers look contradictory — one buffer dies after a second, the other survives
indefinitely — and they are not. A time segment is **two digits wide** and closes itself
the moment no digit could extend it, so it is self-limiting and a clock would be redundant.
A prefix buffer has **no width bound**, so a clock is the only thing that can ever end it.

That is why the shipped code puts `idleTimeout` on the strategy rather than treating it as
a tuning knob, and why one of the two strategies has `null` there.

## A repeated character is never a prefix

`t` `t` on a list holding both `Tuesday` and `TTY` goes Tuesday → Thursday. Cycling wins;
there is no way to make `tt` mean the prefix `TT` without giving up "press the same key
again for the next match", which is far more common. The item is not stranded — `t` `t` `y`
does reach it, because the third character breaks the repeat — so what is actually lost is
only the ability to _stop_ at `tt`.

## Two ways this probe measured nothing before it measured anything

Both are recorded in the probe because either one turns it into a test that always passes.

**`.value` is empty until every segment is filled.** Typing one digit into a fresh time
input shows nothing at all, so the first version of this concluded that digits did nothing.
Seeding a complete value first makes every keystroke observable.

**A timeout test needs a list _and a starting position_ where alive and expired differ.**
`m` then `a` on a list holding `March` lands on March either way. `m` then `o` separates
them — but only when the selection starts on Monday, so that `m` cycles past it to March
and the `o` has somewhere different to go. Started anywhere else, `m` lands on Monday
directly, both outcomes are Monday, and the sweep reports "alive" at every delay including
2500ms. That false reading appeared twice, once in each version of the list.

## Not measurable here

Chromium renders `<input type="time">` in the format of the **browser** locale and ignores
the element's `lang`, so on a 24-hour machine there is no meridiem segment at all and
`a`/`p` do nothing. The probe reports which shape it got rather than pretending. The
meridiem column's behaviour therefore rests on `<select>`, which is what it uses anyway.

## Decided

Two strategies behind one interface, chosen per **column** rather than per picker — the
time picker's own meridiem column wants the generic prefix behaviour, so "time" is not a
mode but two digit columns overriding a default. The impure half is shared and written
once: reading the key, holding the buffer, running the clock, discarding it when a drag or
an arrow takes over, moving the wheel, reporting that a segment is finished.

Two deliberate departures from what is measured above:

- **Out of range starts over instead of clamping.** `6` then `5` on a minute wheel gives
  `05`, not `59`. Chromium clamps only because a terminal segment has nowhere to advance
  to; on a visible wheel a silent jump to a value nobody typed is worse than the digit they
  just pressed.
- **Settling on width as well as on value.** The value `1` is extendable on a twelve-hour
  wheel — `10`, `11`, `12` all exist — so a value-only test never closes `01`, and the
  next digit is swallowed as a third hour digit. `0141` selected hour 4 until the width
  test was added.
