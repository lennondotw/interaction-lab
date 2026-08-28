import { cn } from '@monorepo/utils';
import { ChevronRight } from 'lucide-react';
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type FC, type ReactNode } from 'react';

import { DISCLOSURE_SPRING, disclosureTransition } from '#src/components/file-tree/file-tree-motion.js';

/**
 * A wireframe rather than a copy of `FileTree`.
 *
 * The first version of this demo duplicated the real rows — icons, model, roving
 * `tabIndex` and all — which made it a second implementation to keep in step with
 * the first, and buried the thing under test in a hundred lines that were not it.
 * The mechanism being compared only needs two properties of the subject: that rows
 * have a fixed pitch, and that folders can nest. Everything else is noise.
 *
 * It costs one thing worth naming. The real rows mount gradient SVGs, and that mount
 * is most of the 75–120ms frame the second expand costs — so a wireframe isolates the
 * *stale-target* half of the problem and understates the *long-frame* half. That is
 * the right trade for comparing four mechanisms against each other; it is the wrong
 * one for judging how the shipped tree feels.
 */
export interface WireNode {
  id: string;
  children?: readonly WireNode[];
}

/** Row height, and the whole of the subject's geometry. */
export const PITCH = 52;

const INDENT = 20;

/**
 * How many rows are on screen under these nodes, counting into expanded folders.
 *
 * This is what the `arithmetic` mode animates to, and the reason it needs no
 * measurement: on a fixed pitch, a row count *is* a height.
 */
export const countVisibleRows = (nodes: readonly WireNode[], expanded: ReadonlySet<string>): number =>
  nodes.reduce(
    (total, node) => total + 1 + (expanded.has(node.id) ? countVisibleRows(node.children ?? [], expanded) : 0),
    0
  );

/**
 * Which quantity the disclosure animation owns. The whole point of the demo.
 *
 * - `length` — `height: 0 → auto`. Motion resolves `auto` by measuring, once, on the
 *   frame the animation starts, then writes the string `auto` back on the frame it
 *   finishes. Both halves of the jump live here.
 * - `ratio` — `grid-template-rows: 0fr → 1fr`. The animation carries a dimensionless
 *   fraction and holds no length at all; what it is a fraction *of* is resolved by
 *   layout every frame.
 * - `arithmetic` — `height: 0 → count × PITCH`. Still a length, but one recomputed on
 *   every render from data, so it cannot go stale. Re-targets to the child's *final*
 *   contribution the moment the child opens.
 * - `observed` — `height: 0 → measured`, re-issued from a `ResizeObserver` on the
 *   content. Also a length, also live, but re-targets to the child's *current*
 *   contribution, so it chases a moving target.
 */
export type DisclosureMode = 'arithmetic' | 'length' | 'observed' | 'ratio';

interface DisclosureProps {
  expanded: boolean;
  /** Height in px the content will settle at, for the modes that need to know. */
  contentHeight: number;
  children: ReactNode;
}

const LengthDisclosure: FC<DisclosureProps> = ({ children, expanded }) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      animate={{ height: expanded ? 'auto' : 0 }}
      className="overflow-hidden"
      initial={false}
      inert={!expanded}
      transition={disclosureTransition(prefersReducedMotion)}
    >
      {children}
    </motion.div>
  );
};

/**
 * `min-h-0 overflow-hidden` on the inner child is load-bearing, not hygiene: it is
 * what makes the grid track's base size zero. Without it the track cannot shrink
 * below the content's min-content contribution and the collapse stops part-way.
 *
 * Deliberately not `useSpring` on a `0 | 1`: a non-`MotionValue` source is read once
 * for the initial value and never watched for changes (`follow-value.ts:141`), so a
 * bare number would never re-target and this would never move.
 */
const RatioDisclosure: FC<DisclosureProps> = ({ children, expanded }) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      animate={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      className="grid overflow-hidden"
      initial={false}
      inert={!expanded}
      transition={disclosureTransition(prefersReducedMotion)}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </motion.div>
  );
};

const ArithmeticDisclosure: FC<DisclosureProps> = ({ children, contentHeight, expanded }) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      animate={{ height: expanded ? contentHeight : 0 }}
      className="overflow-hidden"
      initial={false}
      inert={!expanded}
      transition={disclosureTransition(prefersReducedMotion)}
    >
      {children}
    </motion.div>
  );
};

/**
 * The height is a `MotionValue` driven imperatively, not an `animate` prop.
 *
 * Deliberately: re-targeting has to happen from inside the observer's callback, and
 * routing it through state instead would re-render this subtree on every frame that
 * a nested disclosure is animating — the observer fires each of those frames, because
 * the content really is changing size each of those frames.
 *
 * The observer watches the **content**, never the clip. The clip's height is what we
 * are writing; observing it would feed our own writes back in as input and loop. The
 * content's height is independent of the clip's, because the clip is what clips.
 */
const ObservedDisclosure: FC<DisclosureProps> = ({ children, expanded }) => {
  const prefersReducedMotion = useReducedMotion();
  const height = useMotionValue(0);
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const isExpanded = useRef(expanded);
  const measured = useRef(0);

  // Kept readable from the observer without re-attaching it on every toggle.
  useEffect(() => {
    isExpanded.current = expanded;
  }, [expanded]);

  useLayoutEffect(() => {
    if (content === null) return;

    // Seeded here rather than waiting for the observer's first delivery, which lands
    // after the next paint — one frame in which a disclosure that mounts open would
    // animate towards zero.
    measured.current = content.offsetHeight;

    const observer = new ResizeObserver((entries) => {
      const box = entries.at(-1)?.borderBoxSize[0];
      const next = box === undefined ? content.offsetHeight : box.blockSize;

      measured.current = next;

      // Only while open: a closed disclosure's target is 0 whatever the content does.
      if (isExpanded.current) {
        void animate(height, next, disclosureTransition(prefersReducedMotion));
      }
    });

    observer.observe(content, { box: 'border-box' });

    return () => observer.disconnect();
  }, [content, height, prefersReducedMotion]);

  useEffect(() => {
    void animate(height, expanded ? measured.current : 0, disclosureTransition(prefersReducedMotion));
  }, [expanded, height, prefersReducedMotion]);

  return (
    <motion.div className="overflow-hidden" inert={!expanded} style={{ height }}>
      <div ref={setContent}>{children}</div>
    </motion.div>
  );
};

const DISCLOSURES: Record<DisclosureMode, FC<DisclosureProps>> = {
  arithmetic: ArithmeticDisclosure,
  length: LengthDisclosure,
  observed: ObservedDisclosure,
  ratio: RatioDisclosure,
};

/**
 * A row, drawn as a wireframe: a caret, a square standing in for the icon, and a bar
 * standing in for the label. Square corners and hairline strokes throughout, including
 * `strokeLinecap="square"` on the caret, so nothing about the subject reads as a
 * finished component — the demo is about a mechanism, and a subject that looks designed
 * invites judgements about the design instead.
 */
const Row: FC<{ node: WireNode; depth: number; expanded: boolean; onToggle: (id: string) => void }> = ({
  depth,
  expanded,
  node,
  onToggle,
}) => {
  const isFolder = node.children !== undefined;

  return (
    <button
      className="flex h-13 w-full min-w-0 cursor-pointer items-center gap-2 text-left select-none"
      data-wire-node={node.id}
      style={depth === 0 ? undefined : { paddingLeft: depth * INDENT }}
      type="button"
      onClick={() => onToggle(node.id)}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        {isFolder ? (
          <motion.span
            animate={{ rotate: expanded ? 90 : 0 }}
            className="flex text-black/35 dark:text-white/35"
            initial={false}
            transition={DISCLOSURE_SPRING}
          >
            <ChevronRight className="size-3.5" strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} />
          </motion.span>
        ) : null}
      </span>

      <span
        className={cn(
          'size-6 shrink-0 border',
          isFolder ? 'border-black/25 dark:border-white/30' : 'border-black/15 dark:border-white/20'
        )}
      />

      <span
        className={cn(
          'h-2 border',
          isFolder
            ? 'w-28 border-black/25 bg-black/8 dark:border-white/30 dark:bg-white/10'
            : 'w-20 border-black/15 dark:border-white/20'
        )}
      />
    </button>
  );
};

const Branch: FC<{
  node: WireNode;
  depth: number;
  expandedIds: ReadonlySet<string>;
  mode: DisclosureMode;
  onToggle: (id: string) => void;
}> = ({ depth, expandedIds, mode, node, onToggle }) => {
  const expanded = expandedIds.has(node.id);
  const [hasEverExpanded, setHasEverExpanded] = useState(expanded);

  if (expanded && !hasEverExpanded) setHasEverExpanded(true);

  const Disclosure = DISCLOSURES[mode];
  const children = node.children ?? [];

  return (
    <>
      <Row depth={depth} expanded={expanded} node={node} onToggle={onToggle} />

      {node.children === undefined ? null : (
        <Disclosure contentHeight={countVisibleRows(children, expandedIds) * PITCH} expanded={expanded}>
          {hasEverExpanded
            ? children.map((child) => (
                <Branch
                  key={child.id}
                  depth={depth + 1}
                  expandedIds={expandedIds}
                  mode={mode}
                  node={child}
                  onToggle={onToggle}
                />
              ))
            : null}
        </Disclosure>
      )}
    </>
  );
};

export interface WireframeTreeProps {
  nodes: readonly WireNode[];
  mode: DisclosureMode;
  /** Controlled, so one replay can drive every mode identically. */
  expandedIds: readonly string[];
  onToggle: (id: string) => void;
  className?: string;
}

/**
 * Every mode shares this subject, this pitch and this spring, so a side-by-side can
 * only be showing the difference between the disclosures themselves.
 */
export const WireframeTree: FC<WireframeTreeProps> = ({ className, expandedIds, mode, nodes, onToggle }) => {
  const expanded = new Set(expandedIds);

  return (
    <div className={cn('flex w-full min-w-0 flex-col', className)} data-wire-tree={mode}>
      {nodes.map((node) => (
        <Branch key={node.id} depth={0} expandedIds={expanded} mode={mode} node={node} onToggle={onToggle} />
      ))}
    </div>
  );
};
