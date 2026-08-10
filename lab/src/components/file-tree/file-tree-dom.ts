/**
 * The contract between the rows' markup and the tree root's two event listeners.
 *
 * Every click and keystroke in the tree is handled once, at the root, and has to
 * find its way back to a node id and to which of the row's three columns was hit.
 * That routing is done with `data-` attributes, so a row can stay a pure function
 * of its data — no per-row closures, two listeners for a tree of any size — and the
 * attribute names it stamps have to agree with the queries that read them. Both
 * live here so they cannot drift apart.
 */

/** Stamped on every row; carries the node id. Read back as `dataset.fileTreeNode`. */
export const ROW_SELECTOR = '[data-file-tree-node]';

/** Stamped on each of the row's three columns. Read as `dataset.fileTreeTile`. */
export const TILE_SELECTOR = '[data-file-tree-tile]';

/**
 * Which column of a row was hit.
 *
 * - `disclosure` — the chevron. Opens and closes; never activates.
 * - `content` — the icon and the name. The row's primary action.
 * - `actions` — the `…` button. The caller's, and nothing else's.
 */
export type FileTreeTile = 'actions' | 'content' | 'disclosure';

const TILES: readonly string[] = ['actions', 'content', 'disclosure'];

/** How much each level of depth insets a row, in px. */
export const ROW_INDENT = 20;

/** Both icons are square and drawn at the same size, so rows line up across kinds. */
export const ICON_SIZE = 38;

/** The row element a target sits in, or `null` if the target is outside every row. */
export const closestRow = (target: EventTarget | null): HTMLElement | null =>
  target instanceof Element ? target.closest<HTMLElement>(ROW_SELECTOR) : null;

export const readNodeId = (row: HTMLElement): string | null => row.dataset.fileTreeNode ?? null;

/**
 * Which column a target sits in, and the element that column is. `null` covers the
 * indent strip, which belongs to no column on purpose — see the geometry note in
 * `file-tree-branch.tsx`.
 *
 * The element comes back with the name because the actions column *is* a button
 * the caller may want to anchor a popover to, and reaching for it again with a
 * second `closest` call would be a second place the attribute name is written.
 *
 * Validated against the union rather than cast to it, so a typo in the markup
 * lands as "no column" instead of as a `FileTreeTile` a caller's switch silently
 * falls through.
 */
export const closestTile = (target: EventTarget | null): { element: HTMLElement; tile: FileTreeTile } | null => {
  if (!(target instanceof Element)) return null;

  const element = target.closest<HTMLElement>(TILE_SELECTOR);
  const name = element?.dataset.fileTreeTile;

  if (element === null || name === undefined || !TILES.includes(name)) return null;

  return { element, tile: name as FileTreeTile };
};

export const findRowElement = (root: HTMLElement | null, id: string): HTMLElement | null =>
  root?.querySelector<HTMLElement>(`[data-file-tree-node="${CSS.escape(id)}"]`) ?? null;
