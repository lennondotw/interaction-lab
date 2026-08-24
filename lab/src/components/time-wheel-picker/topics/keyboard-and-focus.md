# Keyboard and focus

Two questions that sound like one: does the picker trap focus, and does Left/Right do
anything? They are both about who owns focus, and they have opposite answers — the trap
belongs to whoever made the thing modal, and Left/Right belongs to us.

Neither is decided by the ARIA patterns. `spinbutton` describes Up/Down and says nothing
about siblings; `group` is not a composite widget, so nothing obliges three columns to be
one tab stop or three. What settles it is the widget the time picker was told to align
with, measured in `archive/2026-08-wheel-focus-model`.

## The component never traps focus

A trap is a property of **modality**, not of a widget. It exists so that focus cannot leave
an open modal dialog, which is the dialog's own contract; a picker has no way of knowing
whether it is in one. And the common case is the opposite of modal — a picker sitting inline
in a form, where a trap would be a bug: Tab has to reach the next field.

The reference agrees. `<input type="time">` holds Tab only while it still has segments to
visit, and once past the last one lets focus go. Our three columns do exactly that, and it
is verified: Tab from the meridiem column leaves the picker entirely, Shift+Tab comes back.

So a popover or a sheet built around the picker supplies its own trap, its own initial
focus and its own focus restoration, as the dialog pattern requires. Two things make that
possible rather than merely permitted:

- **Focus can leave.** There is nothing to unwind.
- **`Escape` is not consumed.** The column clears its typeahead buffer on Escape and then
  deliberately does not `preventDefault` or stop propagation, so the same keystroke keeps
  travelling to whatever wants to close. Every other key the column acts on _is_ consumed
  — see `useWheel`'s `consume`. Escape is the exception, and it is the exception on
  purpose.

## Left/Right step between columns

Measured, not chosen. A native time field offers **both** ways of moving between segments:
Tab walks them, and so does Left/Right. Two paths to the same place, which is why adding
Left/Right does not make Tab redundant — a keyboard user reaching for either is right.

It clamps. `Right` on the last segment stays there rather than wrapping to the first, and
that is worth stating because this wheel's _value_ loops and it would be natural to let the
columns loop with it. The value is endless; the field is three columns wide and has a first
and a last.

The keys are free to take: a wheel has no horizontal axis, so nothing else wanted them.

### It lives in the composer

`TimeWheelPicker` handles Left/Right; `WheelColumn` does not know the keys exist. The same
split as the typeahead — a strategy per column, auto-advance in the composer — and for the
same reason: a column knows about a wheel, and only the level above it knows there is a
column beside it.

The consequence is that a **single-column** wheel leaves Left/Right alone, which is better
than the tempting alternative of aliasing them to Up/Down. Alias them and the key means
"change the value" in a one-column picker and "move to the next column" in a three-column
one, so the meaning depends on how many columns a caller happened to compose. Doing nothing
is a consistent meaning.

The handler binds to the `role="group"` element rather than to a column, because the group
_is_ the field and "which column next" is a fact about the field. Its only focusable
descendants are the columns, so a keydown that bubbles up came from one of them — and one
that did not is left alone.

## What is deliberately absent

**Home / End / PageUp / PageDown.** The native time field does nothing with any of them,
measured. And on an endless wheel "first" and "last" have no meaning to point at: index 0 is
not at the top, it is wherever it happens to be, and nothing on screen marks it. Adding them
would mean inventing a semantic rather than adopting one.

There is one place they could still be argued for — a long generic column, a 60-item minute
wheel, where a page jump is real work. The natural reference is `<select>`, and that
reference is not available: the same probe found that arrows, Home and End on a closed
`<select>` cannot be measured on macOS at all. They report "value unchanged", which looks
like a finding and is not one, because `Enter` afterwards commits nothing either while a
letter key lands in place on the same element in the same run. So the keys go somewhere
synthesised keys cannot follow.

That leaves the question open, and it is left open rather than guessed. To close it: read
what a real `<select>` does with Home/End under a screen reader or on a platform whose popup
is in-page, and decide whether a looping wheel should honour it at all.

## What the keyboard does today

| key                 | belongs to  | does                                                                 |
| ------------------- | ----------- | -------------------------------------------------------------------- |
| `Up` / `Down`       | the column  | one detent, animated; fast presses accumulate rather than collapsing |
| `Left` / `Right`    | the group   | previous / next column, clamped at both ends                         |
| `Tab` / `Shift+Tab` | the browser | the same columns in the same order, then out of the field            |
| digits, letters     | the column  | typeahead — see [Two typeahead modes](./typeahead-two-modes.md)      |
| `Escape`            | the column  | clears the typeahead buffer, and keeps travelling upward             |
