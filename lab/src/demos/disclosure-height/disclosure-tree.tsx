import { cn } from '@monorepo/utils';
import { ChevronRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useState, type FC } from 'react';

import { FileIcon } from '#src/components/file-tree/file-icon.js';
import { ICON_SIZE, ROW_INDENT } from '#src/components/file-tree/file-tree-dom.js';
import {
  childParentIds,
  siblingRows,
  type FileTreeNode,
  type FileTreeRow,
} from '#src/components/file-tree/file-tree-model.js';
import { DISCLOSURE_SPRING, disclosureTransition } from '#src/components/file-tree/file-tree-motion.js';
import { FolderIcon } from '#src/components/file-tree/folder-icon.js';

/**
 * Which quantity the disclosure animation owns.
 *
 * - `length` — what `FileTree` ships: `animate={{ height: isExpanded ? 'auto' : 0 }}`.
 *   Motion resolves `auto` by measuring, *once*, on the frame the animation starts,
 *   and writes the string `auto` back on the frame it finishes.
 * - `ratio` — a dimensionless `0 → 1` on `grid-template-rows: <f>fr`. The animation
 *   holds no length at all; what the ratio is a ratio *of* is resolved by layout,
 *   every frame.
 */
export type DisclosureMode = 'length' | 'ratio';

/**
 * A plain `button`, not the shipped row's `treeitem` with its roving `tabIndex`. The
 * demo is about which quantity the disclosure animates, so it carries the geometry
 * that matters (the 52px pitch) and none of the tree semantics that would just be a
 * second, drifting copy of them.
 */
const ROW = 'flex h-13 w-full min-w-0 cursor-pointer items-center text-left select-none';

const LABEL = 'relative min-w-0 flex-1 truncate text-base/6 text-black/80 dark:text-white/80';

/**
 * The `length` disclosure, byte-for-byte the shipped one.
 *
 * `initial={false}` so an already-open folder paints open; `inert` while closed so
 * the mounted-but-hidden rows stay out of the focus order.
 */
const LengthDisclosure: FC<{ expanded: boolean; children: React.ReactNode }> = ({ children, expanded }) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      animate={{ height: expanded ? 'auto' : 0 }}
      className="overflow-hidden"
      data-disclosure="length"
      initial={false}
      inert={!expanded}
      transition={disclosureTransition(prefersReducedMotion)}
    >
      {children}
    </motion.div>
  );
};

/**
 * The `ratio` disclosure.
 *
 * `gridTemplateRows` animates between two *unitless-fraction* strings. Three things
 * follow from that, and together they are the whole idea:
 *
 * - `gridTemplateRows` is not in `positionalKeys`, so motion never takes the
 *   measurement path: no `measureInitialState`, no `measureEndState`, and no
 *   `finalKeyframe` to write back on the finishing frame. The two mechanisms behind
 *   the jump do not exist here rather than being worked around.
 * - `0fr` and `1fr` are interpolated as ordinary number-plus-unit strings, so the
 *   animation is carrying a *ratio*. What the ratio is a ratio of — the content's
 *   height — is resolved by the layout engine every frame, which is what lets a
 *   nested folder growing mid-flight push this one open on the same frame.
 * - `min-h-0 overflow-hidden` on the inner child is load-bearing, not hygiene: it is
 *   what makes the grid track's base size zero. Without it the track cannot shrink
 *   below the content's min-content contribution and the collapse stops part-way.
 *
 * Deliberately *not* `useSpring` on a `0 | 1`. `useSpring` with a plain number reads
 * that number once, for the initial value — the source is only watched for changes
 * when it is itself a `MotionValue` (`follow-value.ts:141`), so a bare number would
 * never re-target and the disclosure would never move.
 */
const RatioDisclosure: FC<{ expanded: boolean; children: React.ReactNode }> = ({ children, expanded }) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      animate={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      className="grid overflow-hidden"
      data-disclosure="ratio"
      initial={false}
      inert={!expanded}
      transition={disclosureTransition(prefersReducedMotion)}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </motion.div>
  );
};

interface BranchProps {
  row: FileTreeRow;
  expandedIds: ReadonlySet<string>;
  mode: DisclosureMode;
  onToggle: (id: string) => void;
}

/**
 * A row plus its disclosure. Deliberately simpler than `FileTreeBranch` — no roving
 * `tabIndex`, no keyboard contract, no actions column — because none of that is what
 * the two modes differ in. What is kept exactly is the part the comparison depends
 * on: the 52px pitch, the same icons (so the mount cost of newly revealed rows is
 * representative), and the same spring.
 */
const Branch: FC<BranchProps> = ({ expandedIds, mode, onToggle, row }) => {
  const { depth, isExpanded, isFolder, node } = row;
  const [hasEverExpanded, setHasEverExpanded] = useState(isExpanded);

  if (isExpanded && !hasEverExpanded) setHasEverExpanded(true);

  const Disclosure = mode === 'ratio' ? RatioDisclosure : LengthDisclosure;

  return (
    <>
      <button
        className={ROW}
        data-demo-node={node.id}
        style={depth === 0 ? undefined : { paddingLeft: depth * ROW_INDENT }}
        type="button"
        onClick={() => onToggle(node.id)}
      >
        <span className="flex w-7 shrink-0 items-center justify-center">
          {isFolder ? (
            <motion.span
              animate={{ rotate: isExpanded ? 90 : 0 }}
              className="flex shrink-0 opacity-40"
              initial={false}
              transition={DISCLOSURE_SPRING}
            >
              <ChevronRight className="size-4" />
            </motion.span>
          ) : null}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2 pl-1">
          {isFolder ? <FolderIcon open={isExpanded} size={ICON_SIZE} /> : <FileIcon size={ICON_SIZE} />}
          <span className={LABEL}>{node.name}</span>
        </span>
      </button>

      {isFolder ? (
        <Disclosure expanded={isExpanded}>
          {hasEverExpanded
            ? siblingRows(node.children ?? [], childParentIds(row), expandedIds).map((childRow) => (
                <Branch
                  key={childRow.node.id}
                  expandedIds={expandedIds}
                  mode={mode}
                  row={childRow}
                  onToggle={onToggle}
                />
              ))
            : null}
        </Disclosure>
      ) : null}
    </>
  );
};

export interface DisclosureTreeProps {
  nodes: readonly FileTreeNode[];
  mode: DisclosureMode;
  /** Controlled, so the story can drive both trees from one replay. */
  expandedIds: readonly string[];
  onToggle: (id: string) => void;
  className?: string;
}

/**
 * A stripped-down file tree whose only variable is which quantity the disclosure
 * animates. Both modes share the model, the icons, the pitch and the spring, so the
 * only thing a side-by-side comparison can be showing is the mechanism.
 */
export const DisclosureTree: FC<DisclosureTreeProps> = ({ className, expandedIds, mode, nodes, onToggle }) => {
  const expanded = new Set(expandedIds);

  return (
    <div className={cn('flex w-full min-w-0 flex-col', className)} data-demo-tree={mode}>
      {siblingRows(nodes, [], expanded).map((row) => (
        <Branch key={row.node.id} expandedIds={expanded} mode={mode} row={row} onToggle={onToggle} />
      ))}
    </div>
  );
};
