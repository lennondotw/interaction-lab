import { cn } from '@monorepo/utils';
import { motion, useReducedMotion } from 'motion/react';
import { useId, type FC, type SVGProps } from 'react';

import { disclosureTransition } from './file-tree-motion.js';

/**
 * The back half of the folder — the tab and the pocket behind the flap. It does
 * not move, so it is a plain `path`.
 */
const BACK_PATH =
  'M6.1916 5C4.42894 5 3 6.23054 3 7.74847V30.2515C3 31.7695 4.42894 33 6.1916 33H31.8084C33.5711 33 35 31.7695 35 30.2515V11.9141C35 10.064 34.0026 8.56442 31.1102 8.56442H27.9227H23.1304C20.7596 8.56442 18.4926 5 16.049 5H6.1916Z';

/**
 * The front flap, in both states.
 *
 * These two can be interpolated, and not by luck: the command sequences are
 * identical — `M L C L C L C L C Z`, four corners of the same rounded rectangle in
 * the same order — so every control point in the closed shape has exactly one
 * counterpart in the open one, and SVG path interpolation is a straight blend
 * between paired numbers. Change either path and the pairing is the thing to
 * preserve; a closed flap drawn with one fewer curve cannot morph into this open one
 * at all, and the animation degrades to swapping the attribute halfway through.
 *
 * The open flap leans right and reaches x = 38, which is why the `viewBox` is 41
 * units wide for a 38-unit-tall icon. The extra 3 units are headroom for the lean,
 * not padding.
 */
const CLOSED_FRONT_PATH =
  'M6 11L32 11C34.2091 11 36 12.7909 36 15L36 30C36 32.2091 34.2091 34 32 34L6 34C3.79086 34 2 32.2091 2 30L2 15C2 12.7909 3.79086 11 6 11Z';

const OPEN_FRONT_PATH =
  'M9.9 15L33.1 15C36.1 15 38.6 17.4 38 20.2L35.8 30.2C35.3 32.6 33.7 34 31.1 34L7.9 34C4.9 34 2.5 31.8 3.2 28.2L5.2 18.8C5.7 16.4 7.3 15 9.9 15Z';

/**
 * Every gradient stop is `currentColor`, so the colour arrives as a utility.
 *
 * Which is the only way it can be themed at all: there is no dark-mode variant of
 * an SVG `stop-color` attribute, and a folder is a depiction of an object rather
 * than a piece of chrome, so a dark theme should re-light it rather than invert it.
 *
 * The back half is the *darker* of the two, which is what makes the tab read as
 * sticking up behind the flap — and what makes this drawable on a page of any
 * colour. Reverse the two — a white back behind an almost-white blue front — and the
 * icon only holds up over a tinted surface: on a plain near-white page both halves
 * vanish and the folder reads as a pale rounded rectangle. A component that cannot
 * assume what is behind it has to own a colour of its own.
 *
 * # The front is opaque; the back and the edge are not
 *
 * A rule, not a preference. The two halves overlap by design — the flap covers most
 * of the pocket — so any alpha on the *front* lets the back's own gradient read
 * through it as a second, darker rectangle inside the flap, and the depth the whole
 * drawing exists to convey collapses into a flat two-tone shape. The overlap is
 * also where the alpha is least visible as a mistake: it looks like a slightly
 * muddy fill rather than like a layering bug.
 *
 * The back is only ever seen against the page, never against another layer of the
 * icon, so alpha there is free and worth having: it lets the tab pick up whatever
 * surface the tree is sitting on instead of looking pasted onto it. Same for the
 * hairline edge, which wants to soften against both.
 */
const BACK_FROM = 'text-sky-300/70 dark:text-sky-700/55';
const BACK_TO = 'text-sky-400/55 dark:text-sky-800/55';
const FRONT_FROM = 'text-slate-50 dark:text-slate-600';
const FRONT_TO = 'text-sky-100 dark:text-slate-700';
const EDGE = 'stroke-white/90 dark:stroke-white/25';

export interface FolderIconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  open?: boolean;
  /**
   * Height in px. Width matches it, so the 41-unit `viewBox` is scaled to fit and
   * centred — the flap's extra headroom costs a little scale rather than layout.
   */
  size?: number;
}

/**
 * A folder whose flap opens.
 *
 * Decorative by default and marked `aria-hidden`: in a file tree the row already
 * carries the name and `aria-expanded` already says which way the flap is
 * pointing, so an icon that announced "folder, expanded" would be the third voice
 * saying one thing. Pass `role="img"` and an `aria-label` through if it is ever
 * used on its own.
 *
 * The gradient ids come from `useId` because `url(#…)` resolves against the whole
 * document: two folders sharing an id both paint with whichever definition the
 * document happens to contain first, and duplicate ids are invalid besides. The
 * colons React puts in the value are stripped, since a bare `#` fragment cannot
 * carry them.
 */
export const FolderIcon: FC<FolderIconProps> = ({ className, open = false, size = 38, ...svgProps }) => {
  const prefersReducedMotion = useReducedMotion();
  const instanceId = useId().replaceAll(':', '');
  const backGradientId = `folder-icon-back-${instanceId}`;
  const frontGradientId = `folder-icon-front-${instanceId}`;
  const frontPath = open ? OPEN_FRONT_PATH : CLOSED_FRONT_PATH;

  return (
    <svg
      aria-hidden
      className={cn('shrink-0 overflow-visible', className)}
      data-slot="folder-icon"
      data-state={open ? 'open' : 'closed'}
      fill="none"
      height={size}
      viewBox="0 0 41 38"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...svgProps}
    >
      <path className={EDGE} d={BACK_PATH} fill={`url(#${backGradientId})`} strokeWidth={1} />

      {/*
        `initial={false}` so a tree that mounts with folders already open paints
        them open rather than morphing every one of them shut-to-open on the first
        frame. Later changes of `d` still animate — the prop only governs mount.
      */}
      <motion.path
        animate={{ d: frontPath }}
        className={EDGE}
        d={frontPath}
        fill={`url(#${frontGradientId})`}
        initial={false}
        strokeWidth={1}
        transition={disclosureTransition(prefersReducedMotion)}
      />

      <defs>
        {/*
          `gradientUnits="userSpaceOnUse"` pins both gradients to the viewBox rather
          than to each path's own bounding box, which keeps the two halves lit from
          the same direction — and stops the front gradient from re-scaling itself
          as the flap changes shape mid-morph.
        */}
        <linearGradient gradientUnits="userSpaceOnUse" id={backGradientId} x1="19" x2="19" y1="5" y2="33">
          <stop className={BACK_FROM} stopColor="currentColor" />
          <stop className={BACK_TO} offset="1" stopColor="currentColor" />
        </linearGradient>

        <linearGradient gradientUnits="userSpaceOnUse" id={frontGradientId} x1="20.5" x2="20.5" y1="11" y2="34">
          <stop className={FRONT_FROM} stopColor="currentColor" />
          <stop className={FRONT_TO} offset="1" stopColor="currentColor" />
        </linearGradient>
      </defs>
    </svg>
  );
};
