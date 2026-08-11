import { cn } from '@monorepo/utils';
import { ChevronRight, Ellipsis } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useState, type FC } from 'react';

import { FileIcon } from './file-icon.js';
import { ICON_SIZE, ROW_INDENT } from './file-tree-dom.js';
import { childParentIds, siblingRows, type FileTreeNode, type FileTreeRow } from './file-tree-model.js';
import { disclosureTransition } from './file-tree-motion.js';
import { FolderIcon } from './folder-icon.js';

/**
 * # The row is three hit targets that tile it, with no seams and no overlap
 *
 * A row is 52px tall — a 48px row and the 4px that used to be the gap to the next
 * one — and it is divided into exactly three columns: 28px of disclosure, the
 * content, 36px of actions. Every one of those spans the row's *full height*, so
 * the three of them tile the band completely. There is no strip of pixels between
 * two rows that belongs to neither, and no pixel that belongs to two.
 *
 * That is the whole trick, and it is worth stating because the obvious
 * construction gets it wrong in both directions. Size each control to its glyph
 * and a 24px chevron sits in a 52px band with 14px of dead space above and below
 * it that looks clickable and is not. Pad the controls to close that gap and they
 * start overlapping their neighbours, so the top of one row toggles the row above.
 *
 * The same tiling can be reached from the other direction — keep the row at 48px
 * with a 4px gap, and give each control an absolutely positioned `<span>` with
 * negative insets, `-top-3.5 -bottom-3.5` on a 24px button, computed per control so
 * its overflow meets its neighbour's in the middle of the gap. That tiles correctly
 * and cannot be maintained: moving the row height means re-deriving three pairs of
 * negative insets, and getting one wrong leaves a dead 2px seam that no test will
 * ever fail on. Making the row *be* the pitch and stretching the controls to it
 * puts the geometry in one number, and the seams cannot exist.
 *
 * # The visible box is not the hit box
 *
 * Each control paints its hover highlight as an inset child rather than on itself,
 * so the target stays 52px tall while the thing you see stays the size it was
 * designed at: 24px for the chevron, 28px for the actions button, a 40px pill for
 * the content. The same idea as an expanded touch target — and the inset overlay
 * turns out to be where the focus ring belongs too. See `CONTENT_OVERLAY`.
 *
 * # The indent is nobody's
 *
 * `paddingLeft` on the row, 20px per level, and the strip it opens at the far left
 * belongs to no control. Deliberately: it is the one part of the band that is not
 * an affordance, and a click there should do nothing rather than guess.
 */
const ROW = 'group/row flex h-13 min-w-0 items-center select-none focus-visible:outline-hidden';

/**
 * Fast in, slow out.
 *
 * 75ms to appear and 150ms to fade, which is not a rounding error: appearing is a
 * response to the pointer and has to feel immediate, while fading is cleanup and
 * reads as noise if it snaps. Dragging the pointer down thirty rows with symmetric
 * timing looks like a strobe; with the asymmetry the highlight follows the cursor
 * and the trail behind it settles.
 *
 * On `opacity` alone: the box is always laid out and always the same size, so there
 * is no geometry to animate and nothing that can reflow mid-hover.
 */
const OVERLAY = `
  pointer-events-none absolute rounded-lg bg-black/5 opacity-0 transition-opacity duration-150 ease-out
  group-hover/tile:opacity-100 group-hover/tile:duration-75
  group-active/tile:bg-black/10
  motion-reduce:transition-none
  dark:bg-white/10
  dark:group-active/tile:bg-white/16
`;

/** 24px, centred in the 28×52 column. */
const DISCLOSURE_OVERLAY = 'inset-x-0.5 inset-y-3.5';

/**
 * A 40px pill across the full column — and the one overlay that also carries focus.
 *
 * The focus ring is drawn here, on the highlight, rather than on the row that
 * actually holds focus. A ring on the row would trace the 52px hit box: it would
 * run edge to edge with the rows above and below, sit 6px outside the highlight it
 * is supposed to be describing, and report focus on something twelve pixels taller
 * than anything visible. Drawn on the overlay it is the same rounded rectangle as
 * the hover state, so keyboard focus and pointer hover describe one target — which
 * is how a user can tell that Enter will do what a click would.
 *
 * `outline` rather than a ring, because an outline costs no layout — and drawn
 * *inwards*, with a negative offset, because an outline is very much clipped by an
 * ancestor's `overflow-hidden`. This overlay runs the full width of its column, and
 * with no actions button the column reaches the row's right edge, which is also the
 * disclosure's clip edge: measured, the clipper's right edge and the overlay's
 * coincide exactly, so an outward ring had nowhere to paint and every row below
 * depth 0 lost its right-hand side. A depth-0 row has no clipping ancestor at all,
 * which is why the defect looked like it was about nesting.
 *
 * At `-outline-offset-2` the whole ring sits inside the box, so its outer edge lands
 * on the highlight's edge rather than 2px beyond it — the same rounded rectangle as
 * the hover state, which is the point of drawing it here.
 */
const CONTENT_OVERLAY = `
  inset-x-0 inset-y-1.5
  group-focus-visible/row:-outline-offset-2 group-focus-visible/row:opacity-100
  group-focus-visible/row:outline-2 group-focus-visible/row:outline-blue-500
  dark:group-focus-visible/row:outline-blue-400
`;

/**
 * 28px, centred in the 36×52 column, with its own ring since the button owns focus.
 *
 * Inset by the same 2px as the content's. Its 4px of column inset means an outward
 * ring would have survived the clip here, but two focus rings in one component that
 * sit differently against their highlights read as a mistake.
 */
const ACTIONS_OVERLAY = `
  inset-x-1 inset-y-3
  group-focus-visible/tile:-outline-offset-2 group-focus-visible/tile:opacity-100
  group-focus-visible/tile:outline-2 group-focus-visible/tile:outline-blue-500
  dark:group-focus-visible/tile:outline-blue-400
`;

const TILE = 'group/tile relative flex h-full cursor-pointer items-center';

const GLYPH = 'relative shrink-0 opacity-40';

const LABEL = 'relative min-w-0 flex-1 truncate text-base/6 text-black/80 dark:text-white/80';

export interface FileTreeBranchProps {
  row: FileTreeRow;
  expandedIds: ReadonlySet<string>;
  /** The one row that holds the tree's tab stop. */
  tabbableId: string | null;
  /** Omitted when the caller has no actions, in which case no button is drawn. */
  actionsLabel?: (node: FileTreeNode) => string;
}

/**
 * One row, plus the collapsible region holding its children.
 *
 * Carries no event handlers at all. Every click and keystroke is handled once, on
 * the tree root, and routed back to a node by the `data-` attributes stamped here
 * — so a branch is a pure function of its row, and a tree of four hundred of them
 * installs two listeners rather than sixteen hundred closures.
 */
export const FileTreeBranch: FC<FileTreeBranchProps> = ({ actionsLabel, expandedIds, row, tabbableId }) => {
  const prefersReducedMotion = useReducedMotion();
  const { depth, isExpanded, isFolder, node, positionInSet, setSize } = row;

  /**
   * Whether this folder's children have ever been in the DOM.
   *
   * Latched rather than mirrored, which is what makes a never-opened folder cost
   * one empty div instead of its whole subtree, and a closed one cost nothing to
   * reopen. It also has to *stay* true through a collapse: the children have to be
   * on screen for the height to have somewhere to travel from, so unmounting them
   * with the state that hid them would animate an empty box shrinking.
   *
   * Written during render — the state-adjustment pattern — because it has to be
   * true on the *same* commit that first sets `isExpanded`. The disclosure animates
   * a fraction of whatever its content comes to, so children arriving one commit
   * later would have the fraction travel against an empty box and then jump to full
   * height on the frame they land.
   */
  const [hasEverExpanded, setHasEverExpanded] = useState(isExpanded);

  if (isExpanded && !hasEverExpanded) setHasEverExpanded(true);

  return (
    <>
      {/*
        Flat roles: this is a direct `treeitem` of the tree, with `aria-level`
        saying how deep it is, rather than a `treeitem` nesting a `group` of further
        ones. The DOM has to nest — the disclosure needs a box to clip and animate —
        so the nesting is made presentational (`role="none"` below) and the levels
        are declared instead of inferred. The same structure a virtualised tree is
        forced into, and it removes the whole class of bug where a `group` ends up
        owned by the wrong item.

        `aria-label` rather than the row's own text, because the actions button is
        part of that text: name-from-content would announce every folder as
        "project, Actions for project".
      */}
      <div
        aria-expanded={isFolder ? isExpanded : undefined}
        aria-label={node.name}
        aria-level={depth + 1}
        aria-posinset={positionInSet}
        aria-setsize={setSize}
        className={ROW}
        data-file-tree-node={node.id}
        role="treeitem"
        style={depth === 0 ? undefined : { paddingLeft: depth * ROW_INDENT }}
        tabIndex={tabbableId === node.id ? 0 : -1}
      >
        {isFolder ? (
          <span className={cn(TILE, 'w-7 justify-center')} data-file-tree-tile="disclosure">
            <span aria-hidden className={cn(OVERLAY, DISCLOSURE_OVERLAY)} />
            {/*
              Rotated on the same spring as the height and the folder's flap. A CSS
              transition here would be a second curve over the same 100ms, and two
              curves in one gesture read as two events — a chevron arriving after
              the rows have settled is most of what makes a tree feel loose.
            */}
            <motion.span
              animate={{ rotate: isExpanded ? 90 : 0 }}
              className={cn(GLYPH, 'flex')}
              initial={false}
              transition={disclosureTransition(prefersReducedMotion)}
            >
              <ChevronRight className="size-4" />
            </motion.span>
          </span>
        ) : (
          // A file has no disclosure, but its icon still lines up with a folder's.
          // The column is held open rather than removed.
          <span aria-hidden className="w-7 shrink-0" />
        )}

        <span className={cn(TILE, 'min-w-0 flex-1 gap-2 pl-1')} data-file-tree-tile="content">
          <span aria-hidden className={cn(OVERLAY, CONTENT_OVERLAY)} />
          {isFolder ? (
            <FolderIcon className="relative" open={isExpanded} size={ICON_SIZE} />
          ) : (
            <FileIcon className="relative" size={ICON_SIZE} />
          )}
          <span className={LABEL}>{node.name}</span>
        </span>

        {actionsLabel === undefined ? null : (
          <button
            aria-label={actionsLabel(node)}
            className={cn(TILE, 'w-9 justify-center focus-visible:outline-hidden')}
            data-file-tree-tile="actions"
            // The row owns the tree's tab stop; its actions button is one Tab away
            // from that row and skipped entirely from every other row. So the whole
            // tree costs two tab stops rather than one per row.
            tabIndex={tabbableId === node.id ? 0 : -1}
            type="button"
          >
            <span aria-hidden className={cn(OVERLAY, ACTIONS_OVERLAY)} />
            <Ellipsis className={cn(GLYPH, 'size-5')} />
          </button>
        )}
      </div>

      {isFolder ? (
        /*
          The disclosure. Mounted for every folder from the first render and never
          unmounted, which is what lets it animate in both directions without
          `AnimatePresence` — and sidesteps its `initial={false}` trap, where the
          child that mounts on the first render has its enter animation vetoed
          *permanently* and comes back invisible after an exit completes.

          # The animation owns a ratio, not a length

          `grid-template-rows` travels between two unitless fractions, and the
          layout engine resolves what the fraction is a fraction *of* — this row's
          content height — on every frame. So the animation never holds a length,
          and there is no length that can go stale.

          That matters because the obvious version, `height: 0 → auto`, is stale by
          construction the moment a folder opens inside a folder that is still
          opening. Motion resolves `auto` by measuring, *once*, on the frame the
          animation starts, and writes the string `auto` back on the frame it
          finishes. Open this folder and then one inside it 150ms later and the
          outer clip flies to a target 156px short of the content it now has, pins
          there for ~110ms with the lower half of the subtree clipped away, and then
          steps 152px in a single frame when the final keyframe lands. Measured, four
          candidate mechanisms compared, in
          `archive/2026-08-disclosure-height-target`.

          The fraction is also why nothing observes anything: a nested folder growing
          mid-flight pushes this one open on the same frame it happens, with no
          `ResizeObserver` and no re-targeting.

          `min-h-0 overflow-hidden` on the inner child is load-bearing, not hygiene.
          It is what makes the grid track's base size zero; without it the track
          cannot shrink below the content's min-content contribution and the collapse
          stops part-way.

          `initial={false}` so a tree that mounts with folders already open paints
          them open instead of animating every one of them from zero on frame one.

          `inert` while closed is what makes keeping the subtree mounted honest: it
          takes the hidden rows out of the accessibility tree and out of the focus
          order, so `aria-expanded="false"` cannot be contradicted by a row a screen
          reader or a Tab press can still reach inside a zero-height box. Both
          wrappers are `role="none"`, so the rows inside stay direct `treeitem`
          children of the tree however many boxes the disclosure needs.
        */
        <motion.div
          animate={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
          className="grid overflow-hidden"
          initial={false}
          inert={!isExpanded}
          role="none"
          transition={disclosureTransition(prefersReducedMotion)}
        >
          <div className="min-h-0 overflow-hidden" role="none">
            {hasEverExpanded
              ? siblingRows(node.children ?? [], childParentIds(row), expandedIds).map((childRow) => (
                  <FileTreeBranch
                    key={childRow.node.id}
                    actionsLabel={actionsLabel}
                    expandedIds={expandedIds}
                    row={childRow}
                    tabbableId={tabbableId}
                  />
                ))
              : null}
          </div>
        </motion.div>
      ) : null}
    </>
  );
};
