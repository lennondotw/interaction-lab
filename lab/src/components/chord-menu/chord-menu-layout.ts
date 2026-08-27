/**
 * Where the menu sits, and what it grows out of.
 *
 * Two numbers, and the whole reason there are two: a menu that grows from a fixed centre
 * eventually runs off the bottom of the screen, and a menu pinned to the bottom has nothing
 * sensible to collapse into.
 */

/**
 * The anchor everything is positioned against, measured up from the bottom edge.
 *
 * A menu small enough to fit centres on it, so a one-line result grows evenly in both
 * directions from the spot the level it replaced occupied. It is also where the menu animates
 * out of and back into, at any size.
 */
export const CHORD_MENU_ANCHOR = 60;

/**
 * How close the menu's bottom edge may come to the bottom edge of its container.
 *
 * Once the menu is taller than twice the difference — anything over 40px, which is every real
 * level — centring on the anchor would push its bottom past this line, so the bottom edge pins
 * here and the menu grows upward only. Levels then share a bottom edge and differ only in how
 * far up they reach, and the anchor ends up 20px *inside* the card rather than at its centre.
 */
export const CHORD_MENU_BOTTOM_GAP = 40;

/** How far up from the bottom edge a menu of this height sits. */
export function resolveChordMenuBottomOffset(height: number): number {
  return Math.max(CHORD_MENU_BOTTOM_GAP, CHORD_MENU_ANCHOR - height / 2);
}

/**
 * Where a menu with no size sits — the anchor, by definition of the rule above.
 *
 * Both ends of the open/close animation use it, so growing out and collapsing back happen
 * through one point instead of the card shrinking into whichever edge it last grew from.
 */
export const CHORD_MENU_COLLAPSED_OFFSET = resolveChordMenuBottomOffset(0);
