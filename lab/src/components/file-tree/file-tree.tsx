import { cn } from '@monorepo/utils';
import { useMemo, useRef, useState, type FC, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react';

import { FileTreeBranch } from './file-tree-branch.js';
import { closestRow, closestTile, findRowElement, readNodeId } from './file-tree-dom.js';
import {
  collectDefaultExpandedIds,
  collectSubtreeFolderIds,
  flattenVisibleRows,
  resolveKeyIntent,
  siblingRows,
  type FileTreeIntent,
  type FileTreeNode,
  type FileTreeRow,
} from './file-tree-model.js';

const defaultActionsLabel = (node: FileTreeNode): string => `Actions for ${node.name}`;

export interface FileTreeProps {
  nodes: readonly FileTreeNode[];
  /**
   * Names the tree for a screen reader. A tree is a composite widget, so it is
   * announced on entry and needs to say which tree it is when a page has two.
   */
  label?: string;
  /** Expanded ids, if the caller wants to own them. Uncontrolled when omitted. */
  expandedIds?: readonly string[];
  /**
   * Seeds the uncontrolled state, read once. Falls back to the ids marked
   * `defaultExpanded` on the nodes themselves.
   */
  defaultExpandedIds?: readonly string[];
  onExpandedIdsChange?: (expandedIds: string[]) => void;
  /**
   * A row was activated — clicked on its name, or Enter/Space with it focused.
   *
   * Omit it and activation falls back to disclosing, so a tree with no handlers is
   * still a working file tree: clicking a folder's name opens it, the way it does
   * in Finder. Provide it and the name becomes yours — opening a file, selecting a
   * row, navigating — while the chevron stays a pure disclosure either way.
   */
  onActivate?: (node: FileTreeNode) => void;
  /**
   * The `…` button was pressed. The button element comes with it, to anchor a menu
   * or a popover to.
   *
   * No handler, no button: a control that visibly does nothing is worse than a
   * column of empty space, and the content column simply takes the width back.
   */
  onNodeAction?: (node: FileTreeNode, trigger: HTMLElement) => void;
  /** Accessible name for the `…` button. Defaults to `Actions for <name>`. */
  actionsLabel?: (node: FileTreeNode) => string;
  className?: string;
}

/**
 * A disclosure tree of folders and files.
 *
 * # One listener pair for the whole tree
 *
 * Click and keydown are handled here and routed to a node by the `data-`
 * attributes the rows stamp (see `file-tree-dom.ts`), rather than by a closure per
 * row per handler. Rows are then a pure function of their data, which is what makes
 * the recursion in `FileTreeBranch` trivial, and a four-hundred row tree installs
 * two listeners instead of allocating sixteen hundred functions on every render.
 *
 * # Focus really moves; there is no `aria-activedescendant`
 *
 * The tree is one tab stop — a roving `tabIndex`, held by the row that was last
 * focused and falling back to the first row — and arrow keys move actual DOM focus
 * between rows. The alternative, keeping focus on the container and pointing at the
 * current row with `aria-activedescendant`, would cost two things worth more than
 * it saves: `:focus-visible` no longer applies to the row, so the focus ring has to
 * be reinvented as a state class that cannot tell a keyboard from a mouse, and the
 * browser stops scrolling the focused row into view.
 *
 * There is no `aria-selected` anywhere, because there is no selection. Focus is the
 * only position the tree tracks, and claiming a selection model it does not have
 * would have a screen reader announce "not selected" on every row.
 *
 * # Alt/Option reaches the whole subtree
 *
 * Held over a click on the chevron, or with ArrowRight / ArrowLeft, expansion
 * applies to every folder inside the focused one however deep — Finder's
 * Option-click on a disclosure triangle. It is read off each event's `altKey` and
 * never tracked as state; `handleKeyDown` explains why that distinction matters
 * more than it looks like it should.
 *
 * # Nothing is sorted and nothing is filtered
 *
 * Rows render in the order given. Both are decisions about data — folders first or
 * not, which timestamp counts, case sensitivity — and a tree that made them would
 * be wrong for the next caller and awkward to override for this one.
 *
 * @example
 * ```tsx
 * <FileTree nodes={nodes} label="Files" onActivate={(node) => open(node.id)} />
 * ```
 */
export const FileTree: FC<FileTreeProps> = ({
  actionsLabel,
  className,
  defaultExpandedIds,
  expandedIds,
  label = 'Files',
  nodes,
  onActivate,
  onExpandedIdsChange,
  onNodeAction,
}) => {
  const root = useRef<HTMLDivElement>(null);

  /**
   * The defaults are read *once*, in the initialiser.
   *
   * Deliberately, because the alternative is a bug that hides well. Re-derive the
   * default set from `nodes` on every change of that array, push the result back in
   * through an effect, and a re-sort or a refetch returning equal data silently
   * re-opens every folder the user had closed by hand. A default describes the first
   * render; anything that re-applies it is a default that overrides the user.
   */
  const [uncontrolledIds, setUncontrolledIds] = useState<ReadonlySet<string>>(
    () => new Set(defaultExpandedIds ?? collectDefaultExpandedIds(nodes))
  );

  const controlledIds = useMemo(() => (expandedIds === undefined ? null : new Set(expandedIds)), [expandedIds]);
  const activeExpandedIds = controlledIds ?? uncontrolledIds;

  const rows = useMemo(() => flattenVisibleRows(nodes, activeExpandedIds), [activeExpandedIds, nodes]);

  const [focusedId, setFocusedId] = useState<string | null>(null);

  /**
   * Which row is tabbable, derived rather than stored.
   *
   * A stored answer would need repairing every time the rows change — collapse the
   * folder the focused row lived in and that id is no longer on screen, so the tree
   * would have no tab stop at all and Tab would skip it entirely. Falling back to
   * the first row makes the invalid state unrepresentable instead of merely rare,
   * and `focusedId` is free to stay stale.
   */
  const tabbableId = rows.some((row) => row.node.id === focusedId) ? focusedId : (rows[0]?.node.id ?? null);

  const commitExpandedIds = (next: ReadonlySet<string>): void => {
    if (expandedIds === undefined) setUncontrolledIds(next);
    onExpandedIdsChange?.([...next]);
  };

  const focusRow = (id: string): void => {
    findRowElement(root.current, id)?.focus();
    setFocusedId(id);
  };

  const expand = (ids: readonly string[]): void => {
    const next = new Set(activeExpandedIds);

    for (const id of ids) next.add(id);

    commitExpandedIds(next);
  };

  const collapse = (ids: readonly string[]): void => {
    const next = new Set(activeExpandedIds);

    for (const id of ids) next.delete(id);

    commitExpandedIds(next);

    // A collapsing subtree becomes `inert`, and inert drops whatever it contains
    // out of the focus order — so focus inside it would land on the body and the
    // next Tab would restart from the top of the document. Recovered onto the
    // shallowest row that swallowed it, which is where the pattern says focus
    // belongs after a collapse anyway, and which is what `parentIds` being ordered
    // root-first gets for free. Checked against the rows rather than the DOM, so it
    // does not depend on the shape the disclosure happens to be nested in.
    const focusedRow = rows.find((row) => row.node.id === focusedId);
    const isFocusInside = root.current?.contains(document.activeElement) ?? false;
    const swallowedBy = focusedRow?.parentIds.find((parentId) => ids.includes(parentId));

    if (isFocusInside && swallowedBy !== undefined) focusRow(swallowedBy);
  };

  /**
   * `recursive` is Alt/Option — the whole subtree rather than this one row.
   *
   * Read from the event that asked for it, every time. See `handleKeyDown` for why
   * there is no held-modifier state anywhere in here.
   */
  const toggle = (row: FileTreeRow, recursive: boolean): void => {
    const ids = recursive ? collectSubtreeFolderIds(row.node) : [row.node.id];

    if (row.isExpanded) collapse(ids);
    else expand(ids);
  };

  const activate = (row: FileTreeRow, recursive: boolean): void => {
    if (onActivate !== undefined) onActivate(row.node);
    else if (row.isFolder) toggle(row, recursive);
  };

  const applyIntent = (intent: FileTreeIntent): void => {
    switch (intent.type) {
      case 'focus':
        focusRow(intent.id);
        break;

      case 'expand':
        expand(intent.ids);
        break;

      case 'collapse':
        collapse(intent.ids);
        break;

      case 'activate': {
        const row = rows.find((candidate) => candidate.node.id === intent.id);

        // Enter and Space carry no modifier meaning: activation is the caller's, and
        // handing it a recursive variant would be a second thing for one key to mean.
        if (row !== undefined) activate(row, false);
        break;
      }
    }
  };

  const handleClick = (event: MouseEvent<HTMLDivElement>): void => {
    const rowElement = closestRow(event.target);
    const id = rowElement === null ? null : readNodeId(rowElement);
    const hit = closestTile(event.target);
    const row = rows.find((candidate) => candidate.node.id === id);

    // No column means the indent strip, which is not an affordance.
    if (id === null || row === undefined || hit === null) return;

    if (hit.tile === 'actions') {
      // The tab stop follows the row whose button was pressed, but focus is left
      // where the browser put it: the button already has it, and pulling focus back
      // onto the row would undo the press the user just made.
      setFocusedId(id);
      onNodeAction?.(row.node, hit.element);

      return;
    }

    // A click has to move the tab stop as well as act, or the next Tab would return
    // to whichever row was last focused instead of the one just clicked.
    focusRow(id);

    if (hit.tile === 'disclosure') toggle(row, event.altKey);
    else activate(row, event.altKey);
  };

  /**
   * # Modifiers are read from events, never tracked
   *
   * `event.altKey` is on the event that asked for the action — both `KeyboardEvent`
   * and `MouseEvent` carry it — so Alt/Option needs no state at all, and there is
   * nothing to keep in sync.
   *
   * Worth being explicit about, because the alternative is a trap in both
   * directions. A `keydown`/`keyup` pair mirrored into state gets **stuck on** every
   * time the `keyup` never arrives, which is routine rather than exotic: Alt+Tab and
   * Cmd+Tab hand the key release to the window that took focus, Option opens a menu
   * on some platforms, a native drag swallows it, and opening devtools takes focus
   * mid-press. It gets **stuck off** the other way, when the modifier was already
   * held before the tree was focused and its `keydown` was delivered to somebody
   * else. Either way the next click does the opposite of what the user's fingers say,
   * which is worse than not having the shortcut.
   *
   * The tracking is only unavoidable if the *idle* UI has to show the modifier —
   * swapping a cursor or a chevron while Alt is merely held, with no click. That
   * needs a real subscription, and then the rules are: re-sync from `altKey` on
   * every event that carries it (`keydown`, `keyup`, `pointermove`, `pointerdown`),
   * and clear on `blur` and `visibilitychange`, because those are the moments a
   * release goes missing. This tree deliberately does not show held state, so it
   * does not pay for any of that.
   *
   * # `preventDefault` earns its keep here
   *
   * Alt+ArrowLeft and Alt+ArrowRight are Back and Forward in Chrome and Firefox on
   * Windows and Linux. Since the tree only prevents keys it actually understood,
   * a recursive collapse cannot also navigate the page off itself.
   */
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const target = event.target;

    // Only keys pressed on a row itself. While focus sits on a row's actions
    // button, Enter and Space belong to that button, and arrows would move focus
    // out from under a press in progress.
    if (!(target instanceof HTMLElement) || target.dataset.fileTreeNode === undefined) return;

    const intent = resolveKeyIntent(rows, target.dataset.fileTreeNode, event.key, { recursive: event.altKey });

    if (intent === null) return;

    // Only for keys that were understood, so an unhandled key still does whatever
    // the page does with it. Every key in the pattern needs it: Space and the
    // arrows scroll, Home and End jump, and `*` types.
    event.preventDefault();
    applyIntent(intent);
  };

  /**
   * Keeps the tab stop on whatever actually holds focus.
   *
   * Focus arrives here in three ways — a click, an arrow key, and a Tab from
   * outside — and only the first two go through a handler that already knows the
   * row. This covers the third, and repairs any drift between the roving `tabIndex`
   * and the browser's idea of where focus is.
   */
  const handleFocus = (event: FocusEvent<HTMLDivElement>): void => {
    const rowElement = closestRow(event.target);
    const id = rowElement === null ? null : readNodeId(rowElement);

    if (id !== null) setFocusedId(id);
  };

  return (
    // The rule wants a `tabIndex` on the tree, which is right for the other half of
    // the pattern and wrong for this one: a tree that keeps focus on the container
    // and points at the current row with `aria-activedescendant` has to be
    // focusable, whereas a tree with a roving `tabIndex` deliberately is not — focus
    // belongs to a row. Adding one would put a focus target above the rows that
    // announces the tree with no item in it.
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus
    <div
      ref={root}
      aria-label={label}
      className={cn('flex w-full min-w-0 flex-col', className)}
      data-slot="file-tree"
      role="tree"
      onClick={handleClick}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
    >
      {siblingRows(nodes, [], activeExpandedIds).map((row) => (
        <FileTreeBranch
          key={row.node.id}
          actionsLabel={onNodeAction === undefined ? undefined : (actionsLabel ?? defaultActionsLabel)}
          expandedIds={activeExpandedIds}
          row={row}
          tabbableId={tabbableId}
        />
      ))}
    </div>
  );
};
