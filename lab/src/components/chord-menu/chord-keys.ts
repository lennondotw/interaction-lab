/**
 * Keys a menu level hands out, in order.
 *
 * Assigned by position rather than chosen per action. Hand-picked mnemonics stop scaling
 * twice over: two actions on one level eventually want the same letter, and reordering a
 * level silently moves a key someone had learned. Position gives neither problem, at the
 * cost of the keys meaning nothing on their own — which is why the menu always shows them.
 *
 * Digits first: they need no modifier and sit under the same fingers on every layout.
 */
export const CHORD_KEYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D'] as const;

export type ChordKey = (typeof CHORD_KEYS)[number];

/**
 * The key for the action at `index`, or `undefined` past the end of {@link CHORD_KEYS}.
 *
 * Deliberately not wrapping around. A level with more actions than there are keys leaves the
 * rest unreachable, which is visible in the menu; reusing a key would instead make one action
 * shadow another.
 */
export function chordKeyAt(index: number): ChordKey | undefined {
  return CHORD_KEYS[index];
}

/** Index of the action a keystroke selects on a level of `length`, or `-1` for none. */
export function chordIndexForKey(key: string, length: number): number {
  const pressed = key.toUpperCase();
  // Widened rather than asserted: the keystroke is any string, and claiming otherwise would hide a
  // typo in a caller behind the assertion.
  const index = (CHORD_KEYS as readonly string[]).indexOf(pressed);

  return index >= 0 && index < length ? index : -1;
}
