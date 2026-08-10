/**
 * The tree's data and every decision that can be made from it alone.
 *
 * Split out from the components because all of it is testable without a DOM —
 * which is the only kind of test this workspace can run — and because keyboard
 * navigation is far easier to reason about as a function of *the visible rows*
 * than as a function of a component tree. `resolveKeyIntent` is the whole
 * keyboard contract, and it never touches an element.
 */

/**
 * One entry in the tree.
 *
 * `name` is a string rather than a `ReactNode`, and that is a constraint worth
 * paying for: it is the row's accessible name, the thing a caller sorts or
 * filters by, and the label a `treeitem` announces. A node that could hand over
 * arbitrary JSX has none of those — the accessible name becomes whatever the
 * subtree happens to flatten to, and every consumer needs a second, parallel
 * field to get a real string back out. Decorate the row through `meta` and the
 * caller's own rendering instead.
 */
export interface FileTreeNode {
  id: string;
  name: string;
  /**
   * Present — even as an empty array — means this is a folder. An empty folder
   * still discloses; it just discloses nothing, the way an empty directory does
   * in Finder.
   */
  children?: readonly FileTreeNode[];
  /**
   * Forces the folder reading for a node whose children are not loaded yet, so a
   * lazily-filled directory looks and behaves like a directory before its
   * contents arrive.
   */
  kind?: 'file' | 'folder';
  /** Expanded on the tree's first render, and never re-applied after it. */
  defaultExpanded?: boolean;
}

/**
 * A node as it appears on screen: everything a row needs to render and everything
 * the keyboard needs to move, with no lookups back into the nested shape.
 *
 * `parentIds` rather than a single parent id because two questions need answering
 * and only one of them is about the immediate parent: `at(-1)` is where ArrowLeft
 * goes, and `includes(id)` is how a collapse discovers that the focused row is
 * about to disappear underneath it.
 */
export interface FileTreeRow {
  node: FileTreeNode;
  /** 0 at the root. Drives the indent, and `aria-level` as `depth + 1`. */
  depth: number;
  /** Root first, immediate parent last. Empty for a root-level row. */
  parentIds: readonly string[];
  isFolder: boolean;
  isExpanded: boolean;
  /**
   * 1-based index among its siblings, and how many siblings there are.
   *
   * These become `aria-posinset` and `aria-setsize`, which the rendered tree needs
   * because its roles are *flat*: every row is a direct `treeitem` of the tree with
   * an `aria-level`, rather than a `treeitem` nesting a `group` of more of them.
   * Without them a screen reader can say "level 2" but not "3 of 7", since there is
   * no container whose children it could have counted.
   */
  positionInSet: number;
  setSize: number;
}

export const isFolderNode = (node: FileTreeNode): boolean => node.kind === 'folder' || node.children !== undefined;

/**
 * Ids marked `defaultExpanded`, collected once so the tree can seed its state
 * from them.
 *
 * Deliberately not re-applied on every change of `nodes`. Re-deriving this in a
 * `useMemo` keyed on the nodes array and feeding the result back into state from an
 * effect looks equivalent and is not: any new array identity — a re-sort, a refetch
 * returning equal data — then silently re-expands every folder the user had closed
 * by hand. A default is a fact about the first render, so it is read exactly once,
 * in a state initialiser.
 */
export const collectDefaultExpandedIds = (nodes: readonly FileTreeNode[]): string[] => {
  const ids: string[] = [];

  const walk = (siblings: readonly FileTreeNode[]): void => {
    for (const node of siblings) {
      if (node.defaultExpanded === true) ids.push(node.id);
      if (node.children !== undefined) walk(node.children);
    }
  };

  walk(nodes);

  return ids;
};

/**
 * One level of the tree, as rows.
 *
 * The single place a `FileTreeRow` is ever built, and it is shared by the two
 * things that need rows for opposite reasons: the renderer descends level by level
 * and asks for one set of siblings at a time, while the keyboard needs every
 * visible row in one flat list. Building both from this means a row cannot be
 * rendered with one `aria-level` and navigated as another.
 *
 * Order is the caller's. Nothing here sorts, because sorting is a decision about
 * *data* — folders-before-files, case sensitivity, which timestamp counts — and a
 * tree that made it for you would be wrong for the next caller and awkward to
 * override for this one.
 */
export const siblingRows = (
  siblings: readonly FileTreeNode[],
  parentIds: readonly string[],
  expandedIds: ReadonlySet<string>
): FileTreeRow[] =>
  siblings.map((node, index) => {
    const isFolder = isFolderNode(node);

    return {
      depth: parentIds.length,
      isExpanded: isFolder && expandedIds.has(node.id),
      isFolder,
      node,
      parentIds,
      positionInSet: index + 1,
      setSize: siblings.length,
    };
  });

/** The ids a row's children are parented by, ready for the next `siblingRows` call. */
export const childParentIds = (row: FileTreeRow): string[] => [...row.parentIds, row.node.id];

/**
 * The nested shape flattened to exactly the rows that are on screen, in visual
 * order.
 *
 * Which makes it the list the keyboard walks. ArrowDown is `index + 1` over this
 * array and nothing else — no descending into a child list, no climbing back out
 * at the end of one, no separate notion of "next visible node" that can disagree
 * with what was rendered.
 */
export const flattenVisibleRows = (nodes: readonly FileTreeNode[], expandedIds: ReadonlySet<string>): FileTreeRow[] => {
  const rows: FileTreeRow[] = [];

  const walk = (siblings: readonly FileTreeNode[], parentIds: readonly string[]): void => {
    for (const row of siblingRows(siblings, parentIds, expandedIds)) {
      rows.push(row);

      if (row.isExpanded && row.node.children !== undefined) walk(row.node.children, childParentIds(row));
    }
  };

  walk(nodes, []);

  return rows;
};

const parentIdOf = (row: FileTreeRow): string | undefined => row.parentIds.at(-1);

/**
 * A folder and every folder inside it, however deep, however collapsed.
 *
 * Walked over `children` rather than over the rows, and that is the point: a
 * recursive expand has to reach folders that are *not on screen*, which is exactly
 * the set the flattened rows leave out. A version of this that filtered `rows`
 * would open one level per press and look like it was ignoring the modifier.
 *
 * Files are skipped, so the result is only ever ids that mean something to an
 * expansion set. Returns an empty array for a file, which is what makes
 * "recursively expand this leaf" a no-op rather than a special case upstream.
 */
export const collectSubtreeFolderIds = (node: FileTreeNode): string[] => {
  const ids: string[] = [];

  const walk = (current: FileTreeNode): void => {
    if (!isFolderNode(current)) return;

    ids.push(current.id);

    for (const child of current.children ?? []) walk(child);
  };

  walk(node);

  return ids;
};

/**
 * What a keypress means, decided from the rows alone.
 *
 * An intent rather than a callback per key, so the half that needs a DOM — moving
 * focus, calling the caller's handler — stays in one place and this half stays
 * testable. `focus` never changes expansion and `expand` / `collapse` never move
 * focus, which is what keeps the two concerns from drifting into each other.
 *
 * Expansion carries a *set* of ids even when it is one row, so that the recursive
 * and the ordinary case are the same intent with a different list. One code path
 * downstream, one place where an expansion is committed.
 */
export type FileTreeIntent =
  | { type: 'focus'; id: string }
  | { type: 'expand'; ids: readonly string[] }
  | { type: 'collapse'; ids: readonly string[] }
  | { type: 'activate'; id: string };

export interface ResolveKeyIntentOptions {
  /**
   * Whether the press should reach the whole subtree — Alt/Option held.
   *
   * Read straight off the event's `altKey` by the caller, never from tracked
   * modifier state. See the note on `FileTreeProps.onNodeAction`'s neighbour in
   * `file-tree.tsx`; the short version is that a held-modifier flag has two ways to
   * get stuck and an event has none.
   */
  recursive?: boolean;
}

/**
 * The WAI-ARIA TreeView keyboard contract, minus type-ahead.
 *
 * - **ArrowDown / ArrowUp** — the next and previous *visible* row, across levels.
 * - **ArrowRight** — a closed folder opens; an open one moves to its first child;
 *   a file does nothing. Two presses to get inside, which is the point: opening
 *   and entering are separate outcomes, so neither one can be reached by accident.
 * - **ArrowLeft** — an open folder closes; anything else moves to its parent. The
 *   mirror image, and the reason a deep row can be escaped by holding one key.
 * - **Alt/Option + ArrowRight / ArrowLeft** — the same two, applied to the whole
 *   subtree: open or close every folder inside the focused one, however deep.
 *   Finder's Option-click on a disclosure triangle, on the keyboard. Both are
 *   pure expansion, so neither one moves focus — including Alt+ArrowRight on an
 *   already-open folder, which opens what is inside it rather than stepping in.
 * - **Home / End** — first and last visible row.
 * - **Enter / Space** — activates, whatever the row's kind. What activation *means*
 *   is not decided here: the component turns it into the caller's handler, or into
 *   a toggle when there is no handler and the row is a folder. Space is bound
 *   because this tree has no selection for it to mean instead.
 * - **`*`** — opens every folder at the focused row's level, under the same
 *   parent. The one shortcut in the pattern that is hard to guess and hard to
 *   live without once a tree is deep.
 *
 * Expansion and activation stay on separate keys, which is why ArrowRight/Left
 * never activate and Enter never expands on its own. The chevron and the name
 * behave the same way under the pointer.
 *
 * Type-ahead — jump to the next row whose name starts with the typed letters — is
 * the remaining optional item, and is left out because it is the one part of the
 * contract that is not a pure function of a keypress: it needs a buffer with a
 * timeout, which belongs to a component's lifetime rather than to this file.
 */
export const resolveKeyIntent = (
  rows: readonly FileTreeRow[],
  activeId: string | null,
  key: string,
  options?: ResolveKeyIntentOptions
): FileTreeIntent | null => {
  const index = rows.findIndex((row) => row.node.id === activeId);
  const row = rows[index];

  if (row === undefined) return null;

  const id = row.node.id;
  const recursive = options?.recursive === true;
  const subtreeIds = (): readonly string[] => collectSubtreeFolderIds(row.node);

  switch (key) {
    case 'ArrowDown': {
      const next = rows[index + 1];

      return next === undefined ? null : { id: next.node.id, type: 'focus' };
    }

    case 'ArrowUp': {
      const previous = rows[index - 1];

      return previous === undefined ? null : { id: previous.node.id, type: 'focus' };
    }

    case 'ArrowRight': {
      if (!row.isFolder) return null;
      if (recursive) return { ids: subtreeIds(), type: 'expand' };
      if (!row.isExpanded) return { ids: [id], type: 'expand' };

      const child = rows[index + 1];

      // Guarded rather than assumed: an expanded folder with no children — a
      // directory that is empty, or one whose contents have not arrived — has a
      // next row belonging to an *ancestor*, and stepping onto it would read as
      // ArrowRight jumping backwards out of the subtree.
      return child?.parentIds.at(-1) === id ? { id: child.node.id, type: 'focus' } : null;
    }

    case 'ArrowLeft': {
      if (recursive && row.isFolder) return { ids: subtreeIds(), type: 'collapse' };
      if (row.isFolder && row.isExpanded) return { ids: [id], type: 'collapse' };

      const parentId = parentIdOf(row);

      return parentId === undefined ? null : { id: parentId, type: 'focus' };
    }

    case 'Home': {
      const first = rows[0];

      return first === undefined ? null : { id: first.node.id, type: 'focus' };
    }

    case 'End': {
      const last = rows.at(-1);

      return last === undefined ? null : { id: last.node.id, type: 'focus' };
    }

    case 'Enter':
    case ' ':
      return { id, type: 'activate' };

    case '*': {
      const parentId = parentIdOf(row);
      const ids = rows
        .filter((sibling) => sibling.isFolder && parentIdOf(sibling) === parentId)
        .map((sibling) => sibling.node.id);

      return ids.length === 0 ? null : { ids, type: 'expand' };
    }

    default:
      return null;
  }
};
