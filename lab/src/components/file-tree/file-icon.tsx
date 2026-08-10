import { cn } from '@monorepo/utils';
import { useId, type FC, type SVGProps } from 'react';

/** The sheet, with the top-right corner already cut away for the fold. */
const SHEET_PATH =
  'M5.57886 7.36846C5.57886 4.89771 7.58179 2.89478 10.0525 2.89478H22.3283C22.5431 2.89478 22.7489 2.97709 22.9054 3.12562L32.1839 12.0551C32.3351 12.2009 32.421 12.4014 32.421 12.6116V30.6316C32.421 33.1024 30.418 35.1053 27.9473 35.1053H10.0525C7.58179 35.1053 5.57886 33.1024 5.57886 30.6316V7.36846Z';

/**
 * The fold: two edges of the turned-down corner, drawn as a stroke rather than a
 * filled triangle. A fill would need its own gradient to sit convincingly against
 * the sheet's; a hairline reads as a crease at any size and needs none.
 */
const FOLD_PATH = 'M21.9998 4L21.9998 9.71053C21.9998 11.687 23.6022 13.2895 25.5787 13.2895H30.9998';

/** Four ruled lines, the last one short, so the sheet reads as text. */
const LINES_PATH = 'M12.115 18.5751H25.885M12.115 21.6351H25.885M12.115 24.6951H25.885M12.115 27.7551H22.825';

/**
 * See `folder-icon.tsx` — the colour arrives as a utility so it can be themed.
 *
 * A sheet of paper is white, and a white sheet on a white page is nothing at all,
 * so the outline carries it: a soft grey stroke around a white-to-warm fill. Same
 * correction as the folder's, for the same reason — a standalone component cannot
 * borrow contrast from the page it happens to be on.
 *
 * The sheet is the front layer, so it is fully opaque, by the same rule the folder's
 * flap follows: everything else in this icon is drawn *on* the sheet, and alpha
 * underneath ruled lines lets the page show through the paper they are printed on.
 * The strokes are outlines and may carry alpha; the fold does not need it and the
 * rules only use it to sit back in dark mode.
 */
const SHEET_FROM = 'text-white dark:text-slate-600';
const SHEET_MID = 'text-slate-50 dark:text-slate-700';
const SHEET_TO = 'text-amber-100 dark:text-amber-900';
const EDGE = 'stroke-slate-300 dark:stroke-white/25';
const RULE = 'stroke-sky-300 dark:stroke-sky-300/45';

export interface FileIconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** Height and width in px. */
  size?: number;
}

/**
 * A sheet of ruled paper with a folded corner. Decorative, for the same reason
 * `FolderIcon` is: the row it sits in already carries the name.
 *
 * The three-stop gradient runs corner to corner rather than top to bottom — white
 * at the fold, cool grey through the middle, warm at the far corner — which is
 * what keeps a page of these from looking like a column of identical grey
 * rectangles. It is the one place warmth appears, and it is diagonal so no two
 * icons in a vertical list shade the same way as their neighbours' ruled lines.
 */
export const FileIcon: FC<FileIconProps> = ({ className, size = 38, ...svgProps }) => {
  const gradientId = `file-icon-sheet-${useId().replaceAll(':', '')}`;

  return (
    <svg
      aria-hidden
      className={cn('shrink-0', className)}
      data-slot="file-icon"
      fill="none"
      height={size}
      viewBox="0 0 38 38"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...svgProps}
    >
      <path className={EDGE} d={SHEET_PATH} fill={`url(#${gradientId})`} />
      <path className={EDGE} d={FOLD_PATH} />
      <path className={RULE} d={LINES_PATH} strokeLinecap="round" strokeWidth={1.34} />

      <defs>
        <linearGradient gradientUnits="userSpaceOnUse" id={gradientId} x1="7.37" x2="30.63" y1="4.68" y2="36">
          <stop className={SHEET_FROM} stopColor="currentColor" />
          <stop className={SHEET_MID} offset="0.58" stopColor="currentColor" />
          <stop className={SHEET_TO} offset="1" stopColor="currentColor" />
        </linearGradient>
      </defs>
    </svg>
  );
};
