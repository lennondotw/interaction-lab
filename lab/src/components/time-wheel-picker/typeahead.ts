/**
 * Typing to select, as a pure decision function.
 *
 * A wheel over arbitrary labels wants `<select>`'s behaviour — accumulate characters,
 * match a label prefix, cycle through the items sharing a first letter. A wheel over
 * numbers wants `<input type="time">`'s — accumulate digits into a value, and treat a
 * segment as finished once no further digit could extend it. Those are genuinely
 * different, so both live here, behind one interface.
 *
 * ## Why one interface and not two keyboard handlers
 *
 * Everything that differs between the two is a decision about a buffer, a key and a
 * list of labels — no timers, no DOM, no animation. Everything that *doesn't* differ
 * is the impure half: reading the key off the event, holding the buffer in a ref,
 * running the idle clock, discarding the buffer when a drag or an arrow key takes
 * over, moving the wheel, and reporting that a segment is done. Two handlers would
 * duplicate that half, which is the half where the bugs are. So `useWheel` owns it
 * once and takes one of these.
 *
 * Arrow keys are not part of this. They mean the same thing on every wheel.
 *
 * ## The idle timeout is a consequence, not a setting
 *
 * Measured in Chrome: a `<select>`'s buffer survives 800ms and is gone by 1000ms,
 * while a `<input type="time">` segment's buffer is still accumulating after 2000ms.
 * That is not an inconsistency. A time segment is at most two digits wide and closes
 * itself the moment no digit could extend it, so it is self-limiting and needs no
 * clock. A prefix buffer has no width bound, so a clock is the only thing that can
 * end it. Hence `idleTimeout` belongs to the strategy rather than to the caller.
 */

export interface TypeaheadStep {
  /**
   * The buffer to carry into the next keystroke, already emptied when `settled`.
   *
   * The strategy owns the whole transition rather than leaving the caller to reset
   * it, so the two cannot disagree about when a buffer ends.
   */
  buffer: string;
  /** Item to move to, or null to leave the wheel where it is. */
  index: number | null;
  /**
   * No further keystroke can extend this buffer, so the caller may hand focus to the
   * next column.
   *
   * It is also what makes "out of range starts over with the newest digit" free: the
   * digit that cannot extend arrives at an already-empty buffer.
   */
  settled: boolean;
}

export interface TypeaheadInput {
  buffer: string;
  /** A `KeyboardEvent.key`. Strategies return null for keys that are not theirs. */
  key: string;
  items: readonly string[];
  /** The item currently selected. Prefix cycling searches from just after it. */
  index: number;
}

export interface Typeahead {
  /**
   * How long an untouched buffer survives, or null when the buffer is self-limiting
   * and no clock is needed. See the module docblock.
   */
  readonly idleTimeout: number | null;
  /** Returns null when this key is none of the strategy's business. */
  step: (input: TypeaheadInput) => TypeaheadStep | null;
}

/** Measured: alive at 800ms, expired at 1000ms, in Chrome's `<select>`. */
const PREFIX_IDLE_TIMEOUT = 1000;

const isPrintable = (key: string): boolean => key.length === 1;

const isRepeatOfOneCharacter = (buffer: string): boolean => {
  const first = buffer.charAt(0);
  return first !== '' && buffer === first.repeat(buffer.length);
};

/**
 * `<select>`'s behaviour, and the right default for a wheel over arbitrary labels.
 *
 * Two modes, which is what the platform does:
 *
 * - The buffer is one character repeated — `t`, `tt`, `ttt` — so the user is asking
 *   for the *next* item starting with it. Searches from just after the current item
 *   and wraps, which is how `t t t` walks Tuesday → Thursday → Tuesday.
 * - Anything else is a prefix. Searches from the start, so `t h` lands on Thursday
 *   rather than continuing to cycle.
 *
 * A keystroke that matches nothing leaves the buffer untouched rather than appending.
 * That is a deliberate choice and not something the platform was measured on: it
 * means one mistyped character does not poison the rest of the word.
 */
export const prefixTypeahead: Typeahead = {
  idleTimeout: PREFIX_IDLE_TIMEOUT,

  step: ({ buffer, key, items, index }) => {
    if (!isPrintable(key)) return null;

    const next = buffer + key;
    const cycling = isRepeatOfOneCharacter(next);
    const needle = (cycling ? key : next).toLowerCase();
    const matches = (label: string) => label.toLowerCase().startsWith(needle);

    // Cycling starts after the current item so a repeated key advances; a prefix
    // starts at the top so it always resolves to the same item for the same word.
    const from = cycling ? index + 1 : 0;
    let found: number | null = null;
    for (let step = 0; step < items.length; step++) {
      const at = (from + step) % items.length;
      const label = items[at];
      if (label !== undefined && matches(label)) {
        found = at;
        break;
      }
    }

    if (found === null) return { buffer, index: null, settled: false };

    // A cycle is never finished — the next press is supposed to move on. A prefix is
    // finished once it identifies exactly one item and has consumed all of it, which
    // is the same "nothing can extend this" test the numeric strategy applies to a
    // width.
    const consumed = items.filter((label) => matches(label));
    const settled = !cycling && consumed.length === 1 && consumed[0]?.length === next.length;

    return { buffer: settled ? '' : next, index: found, settled };
  },
};

/**
 * `<input type="time">`'s behaviour, for a wheel whose labels are numbers.
 *
 * Digits accumulate — `1` then `2` is twelve, not two — and the value is matched
 * exactly, so a minute wheel labelled `00`–`59` reads `1` as one rather than as the
 * first label beginning with a `1`, which would be ten. That mismatch is the reason
 * a numeric wheel cannot just use {@link prefixTypeahead}.
 *
 * Three cases, in order:
 *
 * - The accumulated value is an item — move there.
 * - It is not an item but could still become one with another digit, which is how a
 *   twelve-hour wheel handles a leading `0`: nothing is labelled `0`, but `09` is
 *   coming. Hold the buffer and do not move.
 * - It is neither — start over from the digit just pressed. So `6` then `5` on a
 *   minute wheel is `06` then `05`, not a silent clamp to `59`. The user gets the
 *   digit they typed rather than a value they never asked for, which matters more
 *   here than on a native segment because the wheel visibly travels to it.
 *
 * ## A buffer is settled by width as well as by value
 *
 * Both conditions are needed, and leaving the width out is a real defect rather than
 * an omission. On a twelve-hour wheel the value `1` is extendable — `10`, `11` and
 * `12` are all reachable — so `01` would never settle on the value test alone, the
 * buffer would stay open, and the next digit would be swallowed as a third hour
 * digit: `0141` would select hour `4` instead of leaving `01` and moving on to the
 * minutes. A field two labels wide is finished after two digits whatever the value
 * says, which is what makes `0141` read as `01:41`.
 *
 * It also makes the restart case fall out rather than needing its own branch. On a
 * minute wheel `3` `7` `2` settles at `37` on width, the buffer is cleared, and the
 * `2` starts a new number — no clamping to `59`.
 *
 * Labels that are not integers make every digit a no-op, which is the correct
 * degenerate behaviour for a strategy applied to the wrong column.
 */
export const numericTypeahead: Typeahead = {
  idleTimeout: null,

  step: ({ buffer, key, items }) => {
    if (!/^[0-9]$/u.test(key)) return null;

    const values = items.map((label) => Number(label));
    const width = Math.max(...items.map((label) => label.length));
    const at = (value: number) => values.indexOf(value);
    /** Could another digit turn `value` into one of the items? */
    const extendable = (value: number) =>
      values.some((candidate) => candidate >= value * 10 && candidate <= value * 10 + 9);

    let text = buffer + key;
    let value = Number(text);
    let found = at(value);

    if (found === -1 && !extendable(value)) {
      // Neither a value nor a prefix to one: this accumulation is a dead end, so the
      // digit just pressed starts a new one.
      text = key;
      value = Number(text);
      found = at(value);
    }

    const settled = !extendable(value) || text.length >= width;
    return { buffer: settled ? '' : text, index: found === -1 ? null : found, settled };
  },
};
