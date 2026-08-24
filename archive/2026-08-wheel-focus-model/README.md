# Who owns focus in a segmented picker?

**Date:** 2026-08 · **Status:** measured; `<select>` half unmeasurable ·
**Applies to:** Chromium on macOS

Two questions about the wheel picker's keyboard, both about focus rather than value: should
the component trap focus, and should Left/Right mean anything? The ARIA patterns permit
either answer — `spinbutton` says nothing about siblings, and `group` is not a composite
widget, so nothing in the spec decides how many tab stops three columns are. So ask the
widget the time picker was told to align with.

## Measured

```sh
pnpm exec playwright install chromium               # once
node archive/2026-08-wheel-focus-model/probe.mjs
```

`<input type="time">`, seeded `09:41`. The segments live in the shadow DOM and
`document.activeElement` is always the `<input>`, so focus is read indirectly: press the
keys, then press ArrowUp, and see which half of `.value` moved.

| keys        | where focus ended | reading                                     |
| ----------- | ----------------- | ------------------------------------------- |
| _(focus)_   | hours → `10:41`   | focus lands on the first segment            |
| `Tab`       | minutes → `09:42` | **Tab does not leave — it steps a segment** |
| `Tab Tab`   | nothing moved     | a third stop no arrow can change            |
| `Tab` ×3    | focus → `after`   | three stops inside, then out                |
| `Right`     | minutes → `09:42` | Left/Right step segments as well            |
| `Right` ×2  | minutes → `09:42` | **clamps at the last segment, no wrap**     |
| `Right` ×3  | minutes → `09:42` | still clamped                               |
| `Left`      | hours → `10:41`   | clamps at the first segment too             |
| `Shift+Tab` | hours → `10:41`   | reverse steps back                          |

And the keys that turn out not to exist here:

| keys                  | result         |
| --------------------- | -------------- |
| `Up`                  | `10:41`        |
| `Home` / `End`        | nothing at all |
| `PageUp` / `PageDown` | nothing at all |

The locale is 24-hour, so there are two segments and no meridiem — Chromium follows the
browser locale and ignores the element's `lang`, which the sibling probe
`2026-08-wheel-typeahead-platform` ran into first. That makes the third tab stop the clock
icon Chromium draws in the field rather than a third segment, and two readings say so:
ArrowUp on it moves nothing, and `Right` from the minutes refuses to reach it.

## What it settles

**One stop from outside, several inside.** A time input is a single element in the document
tab order, but Tab is captured to walk its segments and only leaves after the last one.
Three separate `role="spinbutton"` columns, each `tabIndex={0}`, produce the same sequence
of stops for a keyboard user — hour, minute, meridiem, out — with the difference living in
the accessibility tree rather than in the Tab key.

**Tab and Left/Right are both provided, and they clamp.** Not one or the other. The value
loops on our wheel; the columns should not, and native doesn't: `Right` at the last segment
stays put rather than wrapping to the first.

**Home/End/PageUp/PageDown are not part of this widget.** Nothing to copy, and on an endless
wheel "first" and "last" are invisible anyway — index 0 has no distinguishing feature on
screen.

**Nothing here trapped focus.** After the last segment, Tab leaves for the next control.

## What it failed to measure

The `<select>` half is a hole, and a convincing one. `ArrowDown`, `Home`, `End`, `PageDown`,
`ArrowLeft` and `ArrowRight` on a closed select all report "value unchanged" — which reads
exactly like a result, and was nearly written up as one: _a select ignores them_.

It isn't. Pressing `Enter` afterwards, which would commit whatever a popup had highlighted,
also changes nothing — while in the same run, on the same element, the letter `t` selects
Thursday in place and `t Enter` commits it. So focus works, Enter works, and letters are
heard; the arrows and Home/End go somewhere synthesised keys cannot follow on macOS, and
headless does not help.

So whatever `<select>` does with Home/End, this probe cannot say, and the generic wheel's
Home/End behaviour has no measured precedent to copy. It stays unimplemented rather than
guessed — see `topics/keyboard-and-focus.md`.
