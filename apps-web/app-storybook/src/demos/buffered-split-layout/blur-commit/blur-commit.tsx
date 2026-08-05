import { cn } from '@monorepo/utils';
import { animate, type AnimationPlaybackControlsWithThen } from 'motion/react';
import { type CSSProperties, type FC, type PointerEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface BufferedSplitLayoutBlurCommitDemoProps {
  initialLeadingRatio?: number;
  initialTrailingOpen?: boolean;
}

const MIN_LEADING_PX = 360;
const MIN_TRAILING_PX = 360;

/**
 * A pane gives up 12px to the outer edge and 8px to the divider, so the divider
 * ends up with a symmetric 8px on each side and the stage with 12px on each end.
 */
const PANE_EDGE_GAP_PX = 12;
const PANE_DIVIDER_GAP_PX = 8;
const PANE_VISUAL_GAP_TOTAL_PX = PANE_EDGE_GAP_PX + PANE_DIVIDER_GAP_PX;

const LOCKED_CONTENT_LAYER_INSET_PX = 40;
const CONTENT_HORIZONTAL_INSET_PX = 40;
const CONTENT_MAX_WIDTH_PX = 640;

const CLIP_BLUR_PX = 6;
const BLUR_ENTER_MS = 140;
/**
 * A blur appearing must not front-load. `ease` puts most of the change in the
 * first frame or two, which reads as a pop whatever the nominal duration is, so
 * the enter and the exit carry their own curves rather than sharing one.
 */
const BLUR_ENTER_EASE = 'cubic-bezier(0.42, 0, 0.58, 1)';
const BLUR_EXIT_EASE = 'ease-out';
const BLUR_EXIT_MS = 420;
const TOGGLE_LAYOUT_MS = 500;
const TOGGLE_BLUR_EXIT_MS = 460;
const WINDOW_RESIZE_COMMIT_DELAY_MS = 200;
const TOGGLE_EASE = [0.22, 1, 0.36, 1] as const;

// The knockout background has to match the surface behind it, or the dashed
// outline the label sits on shows through the text.
const EDGE_LABEL_CLASS =
  'pointer-events-none absolute top-0 left-3 z-20 -translate-y-1/2 bg-white px-1 leading-none dark:bg-neutral-950';

/**
 * The commit flash is written as an inline style rather than swapped as a class.
 * Its idle colour is theme-dependent, and a `dark:` utility beats a plain one on
 * source order, so adding `bg-emerald-500` on top would do nothing in dark mode.
 */
const COMMIT_FLASH_COLOR = 'var(--color-emerald-500)';
const MOTION_DEBUG_SCALE =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('motionDebug') === 'slow' ? 4 : 1;

const motionMs = (durationMs: number) => Math.round(durationMs * MOTION_DEBUG_SCALE);

const SAMPLE_TEXT = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer congue, lorem vitae interdum pulvinar, mi risus lacinia massa, non cursus leo augue at massa.',
  'Praesent gravida sem vel nibh sagittis, ut viverra libero facilisis. Suspendisse potenti. Sed ac ipsum a justo tincidunt consequat in id mauris.',
  'Aliquam erat volutpat. Donec euismod, ligula non suscipit suscipit, lacus est blandit velit, sit amet commodo justo mi non justo.',
  'Curabitur vitae justo at erat interdum hendrerit. Nunc gravida eros vel lectus vulputate, sed pretium nulla viverra.',
  'Mauris luctus, nibh nec tincidunt sodales, leo magna tristique ligula, vitae ultricies mauris arcu et lacus.',
  'Vivamus aliquet neque sed sem vestibulum, nec facilisis lacus ullamcorper. Nulla et tellus non sem ornare faucibus.',
];

/** The geometry the user sees right now. Never feeds the real content layout. */
interface VisualGeometry {
  leadingVisualPx: number;
  trailingLeftPx: number;
  trailingVisualPx: number;
}

interface LayoutMetrics {
  leftContentLockedPx: number;
  leftLockedPx: number;
  leftScale: number;
  leftVisualPx: number;
  rightContentLockedPx: number;
  rightLockedPx: number;
  rightScale: number;
  rightVisualPx: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;

const getLeadingBounds = (viewportWidth: number) => {
  const minPx = Math.min(MIN_LEADING_PX, viewportWidth);
  const maxPx = Math.max(minPx, viewportWidth - MIN_TRAILING_PX);

  return { maxPx, minPx };
};

const clampLeadingPx = (leadingPx: number, viewportWidth: number) => {
  const { maxPx, minPx } = getLeadingBounds(viewportWidth);

  return clamp(leadingPx, minPx, maxPx);
};

const ratioToLeadingPx = (ratio: number, viewportWidth: number) => clampLeadingPx(viewportWidth * ratio, viewportWidth);

const paneWidthToVisiblePx = (paneWidthPx: number) => Math.max(0, paneWidthPx - PANE_VISUAL_GAP_TOTAL_PX);

const paneWidthToLockedLayerPx = (paneWidthPx: number) =>
  Math.max(0, paneWidthToVisiblePx(paneWidthPx) - LOCKED_CONTENT_LAYER_INSET_PX);

const lockedLayerPxToContentPx = (lockedLayerPx: number) =>
  Math.min(Math.max(0, lockedLayerPx - CONTENT_HORIZONTAL_INSET_PX), CONTENT_MAX_WIDTH_PX);

const getScale = (visualPx: number, lockedPx: number) => (lockedPx <= 0 ? 1 : visualPx / lockedPx);

/** Style writes keep sub-pixel precision, so the width and the scale derived
 *  from it cannot disagree mid-animation. Only the metrics panel rounds. */
const cssPx = (value: number) => `${value}px`;

const formatPx = (value: number) => `${Math.round(value)}px`;

const formatScale = (value: number) => value.toFixed(3);

/** The geometry a committed layout settles at, where visual matches locked and
 *  both scales are 1. */
const settledVisual = (
  leadingLayoutPx: number,
  trailingLayoutPx: number,
  open: boolean,
  viewportWidth: number
): VisualGeometry => ({
  leadingVisualPx: open ? leadingLayoutPx : viewportWidth,
  trailingLeftPx: open ? viewportWidth - trailingLayoutPx + PANE_DIVIDER_GAP_PX : viewportWidth,
  trailingVisualPx: trailingLayoutPx,
});

const lerpGeometry = (from: VisualGeometry, to: VisualGeometry, progress: number): VisualGeometry => ({
  leadingVisualPx: lerp(from.leadingVisualPx, to.leadingVisualPx, progress),
  trailingLeftPx: lerp(from.trailingLeftPx, to.trailingLeftPx, progress),
  trailingVisualPx: lerp(from.trailingVisualPx, to.trailingVisualPx, progress),
});

const buildParagraphs = (prefix: string) =>
  Array.from({ length: 20 }, (_, index) => `${prefix} ${index + 1}. ${SAMPLE_TEXT[index % SAMPLE_TEXT.length]}`);

const LEFT_PARAGRAPHS = buildParagraphs('Left');
const RIGHT_PARAGRAPHS = buildParagraphs('Right');

/**
 * The buffered split layout with View Transition removed.
 *
 * The size model is the same as the View Transition demo: a `locked` width that
 * the real content lays out at, and a `visual` width the user sees, with
 * `scaleX(...)` covering the difference so no content reflows during a gesture.
 *
 * What changes is the commit. There is no old/new cross-dissolve, no snapshot,
 * and no second copy of the content anywhere — the layout is simply swapped
 * while the 6px blur is at full strength, which is the only thing hiding it.
 *
 * That constrains the order of operations in a way the snapshot version was not
 * constrained by. A View Transition can ease blur *in* during the transition,
 * because the old bitmap covers the reflow while it does. Here the reflow is
 * instantaneous, so the blur has to already be up when it happens. Dragging and
 * window resize get that for free — blur has been at 6px since the gesture
 * started. Toggling does not, so it leads with a blur-in and only commits once
 * that has landed.
 */
export const BufferedSplitLayoutBlurCommitDemo: FC<BufferedSplitLayoutBlurCommitDemoProps> = ({
  initialLeadingRatio = 0.6,
  initialTrailingOpen = true,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const commitCountTextRef = useRef<HTMLSpanElement>(null);
  const commitIndicatorRef = useRef<HTMLSpanElement>(null);
  const commitFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitTransitionCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const windowResizeCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleLeadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleAnimationRef = useRef<AnimationPlaybackControlsWithThen | null>(null);
  const dragOffsetRef = useRef(0);
  const dragViewportWidthRef = useRef(0);
  const dragActiveRef = useRef(false);
  const windowResizeActiveRef = useRef(false);
  const toggleActiveRef = useRef(false);
  const layoutLeadingPxRef = useRef<number | null>(null);
  const layoutTrailingPxRef = useRef<number | null>(null);
  const visualRef = useRef<VisualGeometry | null>(null);
  const preferredLeadingRatioRef = useRef(initialLeadingRatio);
  const layoutCommitCountRef = useRef(0);
  const leftMetricsRef = useRef<HTMLPreElement>(null);
  const rightMetricsRef = useRef<HTMLPreElement>(null);
  const metricsRef = useRef<LayoutMetrics | null>(null);
  const trailingOpenRef = useRef(initialTrailingOpen);
  const [trailingOpen, setTrailingOpen] = useState(initialTrailingOpen);

  const getInteractionMode = () => {
    if (dragActiveRef.current) return 'dragging';
    if (windowResizeActiveRef.current) return 'window resize';
    if (toggleActiveRef.current) return 'toggling';

    return 'idle';
  };

  const renderMetricsPanels = () => {
    const metrics = metricsRef.current;
    const leftMetrics = leftMetricsRef.current;
    const rightMetrics = rightMetricsRef.current;
    if (!metrics || !leftMetrics || !rightMetrics) return;

    leftMetrics.textContent = [
      `visual ${formatPx(metrics.leftVisualPx)} | locked ${formatPx(metrics.leftLockedPx)}`,
      `content locked ${formatPx(metrics.leftContentLockedPx)} | scale ${formatScale(metrics.leftScale)}`,
      `preferred ${(preferredLeadingRatioRef.current * 100).toFixed(1)}%`,
      `mode ${getInteractionMode()}`,
    ].join('\n');

    rightMetrics.textContent = [
      `visual ${formatPx(metrics.rightVisualPx)} | locked ${formatPx(metrics.rightLockedPx)}`,
      `content locked ${formatPx(metrics.rightContentLockedPx)} | scale ${formatScale(metrics.rightScale)}`,
      `preferred ${((1 - preferredLeadingRatioRef.current) * 100).toFixed(1)}%`,
      `mode ${getInteractionMode()}`,
    ].join('\n');
  };

  const flashCommitIndicator = () => {
    const indicator = commitIndicatorRef.current;
    if (indicator == null) return;

    if (commitFlashTimerRef.current != null) {
      clearTimeout(commitFlashTimerRef.current);
    }

    if (commitTransitionCleanupTimerRef.current != null) {
      clearTimeout(commitTransitionCleanupTimerRef.current);
    }

    indicator.classList.remove('transition-colors', 'duration-700', 'ease-out');
    indicator.style.backgroundColor = COMMIT_FLASH_COLOR;
    indicator.getBoundingClientRect();

    commitFlashTimerRef.current = setTimeout(() => {
      indicator.classList.add('transition-colors', 'duration-700', 'ease-out');
      // Clearing the override hands the colour back to the themed idle class.
      indicator.style.backgroundColor = '';
      commitFlashTimerRef.current = null;

      commitTransitionCleanupTimerRef.current = setTimeout(() => {
        indicator.classList.remove('transition-colors', 'duration-700', 'ease-out');
        commitTransitionCleanupTimerRef.current = null;
      }, 720);
    }, 80);
  };

  const getPreferredLeadingPx = (viewportWidth: number) =>
    ratioToLeadingPx(preferredLeadingRatioRef.current, viewportWidth);

  const writeBlur = (blurPx: number, durationMs: number) => {
    const root = rootRef.current;
    if (!root) return;

    root.style.setProperty('--split-blur-duration', `${motionMs(durationMs)}ms`);
    root.style.setProperty('--split-blur-ease', blurPx > 0 ? BLUR_ENTER_EASE : BLUR_EXIT_EASE);
    root.style.setProperty('--split-left-blur', cssPx(blurPx));
    root.style.setProperty('--split-right-blur', cssPx(blurPx));
  };

  const writeMetrics = (geometry: VisualGeometry) => {
    const leadingLockedPx = layoutLeadingPxRef.current ?? geometry.leadingVisualPx;
    const trailingLockedPx = layoutTrailingPxRef.current ?? geometry.trailingVisualPx;
    const leftLockedPx = paneWidthToLockedLayerPx(leadingLockedPx);
    const rightLockedPx = paneWidthToLockedLayerPx(trailingLockedPx);

    metricsRef.current = {
      leftContentLockedPx: lockedLayerPxToContentPx(leftLockedPx),
      leftLockedPx,
      leftScale: getScale(paneWidthToVisiblePx(geometry.leadingVisualPx), paneWidthToVisiblePx(leadingLockedPx)),
      leftVisualPx: paneWidthToLockedLayerPx(geometry.leadingVisualPx),
      rightContentLockedPx: lockedLayerPxToContentPx(rightLockedPx),
      rightLockedPx,
      rightScale: getScale(paneWidthToVisiblePx(geometry.trailingVisualPx), paneWidthToVisiblePx(trailingLockedPx)),
      rightVisualPx: paneWidthToLockedLayerPx(geometry.trailingVisualPx),
    };
    renderMetricsPanels();
  };

  /** Writes only what the user sees. The content layout is untouched. */
  const writeVisual = (geometry: VisualGeometry) => {
    const root = rootRef.current;
    if (!root) return;

    const leadingLockedPx = layoutLeadingPxRef.current ?? geometry.leadingVisualPx;
    const trailingLockedPx = layoutTrailingPxRef.current ?? geometry.trailingVisualPx;

    visualRef.current = geometry;
    root.style.setProperty('--split-leading-visual-width', cssPx(geometry.leadingVisualPx));
    root.style.setProperty('--split-trailing-visual-width', cssPx(geometry.trailingVisualPx));
    root.style.setProperty('--split-trailing-left', cssPx(geometry.trailingLeftPx));
    root.style.setProperty('--split-divider-x', cssPx(geometry.leadingVisualPx));
    root.style.setProperty(
      '--split-left-scale',
      String(getScale(paneWidthToVisiblePx(geometry.leadingVisualPx), paneWidthToVisiblePx(leadingLockedPx)))
    );
    root.style.setProperty(
      '--split-right-scale',
      String(getScale(paneWidthToVisiblePx(geometry.trailingVisualPx), paneWidthToVisiblePx(trailingLockedPx)))
    );
    writeMetrics(geometry);
  };

  /**
   * The expensive half. Moving these is what makes the real content reflow, so
   * it happens once per gesture and only ever under full blur.
   */
  const writeLocked = (leadingLayoutPx: number, trailingLayoutPx: number) => {
    const root = rootRef.current;
    if (!root) return;

    layoutLeadingPxRef.current = leadingLayoutPx;
    layoutTrailingPxRef.current = trailingLayoutPx;
    root.style.setProperty('--split-leading-layout-width', cssPx(leadingLayoutPx));
    root.style.setProperty('--split-trailing-layout-width', cssPx(trailingLayoutPx));

    layoutCommitCountRef.current += 1;
    if (commitCountTextRef.current != null) {
      commitCountTextRef.current.textContent = `commit ${layoutCommitCountRef.current}`;
    }
    flashCommitIndicator();
  };

  const cancelToggle = () => {
    if (toggleLeadTimerRef.current != null) {
      clearTimeout(toggleLeadTimerRef.current);
      toggleLeadTimerRef.current = null;
    }

    if (toggleAnimationRef.current != null) {
      toggleAnimationRef.current.stop();
      toggleAnimationRef.current = null;
    }
    toggleActiveRef.current = false;
  };

  /** Commits a settled layout and lets the blur fade off it. Used by both
   *  gesture paths, where visual already matches the target and no geometry
   *  needs to move — only the content behind the blur changes. */
  const commitSettled = (leadingLayoutPx: number, trailingLayoutPx: number, open: boolean, viewportWidth: number) => {
    writeLocked(leadingLayoutPx, trailingLayoutPx);
    writeVisual(settledVisual(leadingLayoutPx, trailingLayoutPx, open, viewportWidth));
    writeBlur(0, BLUR_EXIT_MS);
  };

  const scheduleWindowResizeCommit = () => {
    if (windowResizeCommitTimerRef.current != null) {
      clearTimeout(windowResizeCommitTimerRef.current);
    }

    windowResizeCommitTimerRef.current = setTimeout(() => {
      windowResizeCommitTimerRef.current = null;
      const root = rootRef.current;
      if (!root) {
        windowResizeActiveRef.current = false;
        return;
      }

      const viewportWidth = root.getBoundingClientRect().width;
      const preferredLeadingPx = getPreferredLeadingPx(viewportWidth);
      const open = trailingOpenRef.current;

      windowResizeActiveRef.current = false;
      commitSettled(open ? preferredLeadingPx : viewportWidth, viewportWidth - preferredLeadingPx, open, viewportWidth);
    }, WINDOW_RESIZE_COMMIT_DELAY_MS);
  };

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const viewportWidth = root.getBoundingClientRect().width;
    preferredLeadingRatioRef.current = initialLeadingRatio;
    const preferredLeadingPx = getPreferredLeadingPx(viewportWidth);
    const preferredTrailingPx = viewportWidth - preferredLeadingPx;

    trailingOpenRef.current = initialTrailingOpen;
    setTrailingOpen(initialTrailingOpen);
    writeLocked(initialTrailingOpen ? preferredLeadingPx : viewportWidth, preferredTrailingPx);
    writeVisual(
      settledVisual(
        initialTrailingOpen ? preferredLeadingPx : viewportWidth,
        preferredTrailingPx,
        initialTrailingOpen,
        viewportWidth
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLeadingRatio, initialTrailingOpen]);

  useEffect(() => {
    renderMetricsPanels();
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const handleResize = () => {
      const viewportWidth = root.getBoundingClientRect().width;
      const preferredLeadingPx = getPreferredLeadingPx(viewportWidth);
      const open = trailingOpenRef.current;

      // Window resize has no reliable release signal. The first event is treated
      // as the leading edge for live feedback, and the committed layout is
      // debounced to the trailing edge.
      if (!windowResizeActiveRef.current) {
        cancelToggle();
        windowResizeActiveRef.current = true;
        writeBlur(CLIP_BLUR_PX, BLUR_ENTER_MS);
      }

      const trailingVisualPx = viewportWidth - preferredLeadingPx;
      writeVisual({
        leadingVisualPx: open ? preferredLeadingPx : viewportWidth,
        trailingLeftPx: open ? preferredLeadingPx + PANE_DIVIDER_GAP_PX : viewportWidth,
        trailingVisualPx,
      });
      scheduleWindowResizeCommit();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLeadingRatio]);

  useEffect(() => {
    return () => {
      if (commitFlashTimerRef.current != null) {
        clearTimeout(commitFlashTimerRef.current);
      }

      if (commitTransitionCleanupTimerRef.current != null) {
        clearTimeout(commitTransitionCleanupTimerRef.current);
      }

      if (windowResizeCommitTimerRef.current != null) {
        clearTimeout(windowResizeCommitTimerRef.current);
      }

      if (toggleLeadTimerRef.current != null) {
        clearTimeout(toggleLeadTimerRef.current);
      }
      toggleAnimationRef.current?.stop();
      windowResizeActiveRef.current = false;
    };
  }, []);

  const handleDividerPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root || !trailingOpenRef.current) return;

    const pointerId = event.pointerId;
    const rootRect = root.getBoundingClientRect();
    const divider = event.currentTarget;
    const currentLeadingPx =
      visualRef.current?.leadingVisualPx ?? ratioToLeadingPx(initialLeadingRatio, rootRect.width);

    divider.setPointerCapture(pointerId);
    dragOffsetRef.current = event.clientX - rootRect.left - currentLeadingPx;
    dragViewportWidthRef.current = rootRect.width;
    dragActiveRef.current = true;
    windowResizeActiveRef.current = false;
    cancelToggle();
    // Blur is raised once here rather than on every move: the commit at the end
    // of the drag needs it already at full strength, and re-writing the same
    // value every frame would only restart the same transition.
    writeBlur(CLIP_BLUR_PX, BLUR_ENTER_MS);
    event.preventDefault();
    renderMetricsPanels();

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;

      const viewportWidth = dragViewportWidthRef.current;
      const nextLeadingPx = clampLeadingPx(moveEvent.clientX - rootRect.left - dragOffsetRef.current, viewportWidth);
      preferredLeadingRatioRef.current = nextLeadingPx / viewportWidth;
      writeVisual({
        leadingVisualPx: nextLeadingPx,
        trailingLeftPx: nextLeadingPx + PANE_DIVIDER_GAP_PX,
        trailingVisualPx: viewportWidth - nextLeadingPx,
      });
    };

    const handleUp = (upEvent: globalThis.PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;

      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      dragActiveRef.current = false;
      divider.releasePointerCapture(pointerId);

      const viewportWidth = dragViewportWidthRef.current;
      const finalLeadingPx = visualRef.current?.leadingVisualPx ?? currentLeadingPx;
      // Visual is already where the pointer left it, so this commit moves no
      // geometry at all — only the content reflows, under full blur.
      commitSettled(finalLeadingPx, viewportWidth - finalLeadingPx, true, viewportWidth);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const handleToggleTrailing = () => {
    const root = rootRef.current;
    if (!root) return;

    const viewportWidth = root.getBoundingClientRect().width;
    const nextOpen = !trailingOpenRef.current;
    const from = visualRef.current ?? settledVisual(viewportWidth, 0, nextOpen, viewportWidth);

    cancelToggle();
    windowResizeActiveRef.current = false;
    trailingOpenRef.current = nextOpen;
    toggleActiveRef.current = true;

    // Lead with the blur. The commit below is instantaneous, so unlike the
    // snapshot version there is nothing else to hide the reflow behind — the
    // blur has to be up before the layout moves, not easing in alongside it.
    writeBlur(CLIP_BLUR_PX, BLUR_ENTER_MS);

    toggleLeadTimerRef.current = setTimeout(() => {
      toggleLeadTimerRef.current = null;
      setTrailingOpen(nextOpen);

      const preferredLeadingPx = getPreferredLeadingPx(viewportWidth);
      const trailingLayoutPx = viewportWidth - preferredLeadingPx;
      const leadingLayoutPx = nextOpen ? preferredLeadingPx : viewportWidth;

      writeLocked(leadingLayoutPx, trailingLayoutPx);
      // Hold the pre-toggle geometry so the reflow that just happened does not
      // also read as a size change. `scaleX` absorbs the difference, which is
      // the same inversion a FLIP does, expressed in this component's own size
      // model instead of in a snapshot.
      writeVisual(from);

      const to = settledVisual(leadingLayoutPx, trailingLayoutPx, nextOpen, viewportWidth);
      toggleAnimationRef.current = animate(0, 1, {
        duration: motionMs(TOGGLE_LAYOUT_MS) / 1000,
        ease: [...TOGGLE_EASE],
        onUpdate: (progress) => writeVisual(lerpGeometry(from, to, progress)),
        onComplete: () => {
          toggleAnimationRef.current = null;
          toggleActiveRef.current = false;
          writeVisual(to);
          // Slow-out: the geometry has settled, so the blur can take its time
          // coming off the now-correct layout.
          writeBlur(0, TOGGLE_BLUR_EXIT_MS);
        },
      });
    }, motionMs(BLUR_ENTER_MS));
  };

  const rootStyle = {
    '--split-blur-duration': `${motionMs(BLUR_ENTER_MS)}ms`,
    '--split-blur-ease': BLUR_ENTER_EASE,
    '--split-divider-x': '60%',
    '--split-leading-layout-width': '60%',
    '--split-leading-visual-width': '60%',
    '--split-left-blur': '0px',
    '--split-left-scale': 1,
    '--split-right-blur': '0px',
    '--split-right-scale': 1,
    '--split-trailing-layout-width': '40%',
    '--split-trailing-left': '60%',
    '--split-trailing-visual-width': '40%',
  } as CSSProperties;

  const leftLiveStyle = {
    width: `max(0px, calc(var(--split-leading-visual-width) - ${PANE_VISUAL_GAP_TOTAL_PX}px))`,
  } as CSSProperties;

  /**
   * Blur sits outside the scale, never inside it. `filter` applies to the
   * already-scaled result, so a horizontally compressed pane keeps its full blur
   * radius instead of having it squeezed along with the content.
   */
  const leftBlurSurfaceStyle = {
    bottom: 0,
    filter: 'blur(var(--split-left-blur))',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    transition: 'filter var(--split-blur-duration) var(--split-blur-ease)',
  } as CSSProperties;

  const leftScaleSurfaceStyle = {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    transform: 'scaleX(var(--split-left-scale))',
    transformOrigin: 'left center',
    width: `max(0px, calc(var(--split-leading-layout-width) - ${PANE_VISUAL_GAP_TOTAL_PX}px))`,
  } as CSSProperties;

  const rightLiveStyle = {
    left: 'var(--split-trailing-left)',
    width: `max(0px, calc(var(--split-trailing-visual-width) - ${PANE_VISUAL_GAP_TOTAL_PX}px))`,
  } as CSSProperties;

  const rightBlurSurfaceStyle = {
    bottom: 0,
    filter: 'blur(var(--split-right-blur))',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    transition: 'filter var(--split-blur-duration) var(--split-blur-ease)',
  } as CSSProperties;

  const rightScaleSurfaceStyle = {
    bottom: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    transform: 'scaleX(var(--split-right-scale))',
    transformOrigin: 'right center',
    width: `max(0px, calc(var(--split-trailing-layout-width) - ${PANE_VISUAL_GAP_TOTAL_PX}px))`,
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      data-buffered-split-layout-blur-commit-demo
      data-trailing-collapsed={!trailingOpen ? 'true' : undefined}
      style={rootStyle}
      className={`
        relative h-dvh min-h-[620px] w-full overflow-hidden bg-white font-mono text-[12px] text-slate-500
        dark:bg-neutral-950 dark:text-neutral-400
      `}
    >
      <span
        className={`
          pointer-events-none absolute top-2 right-14 z-40 flex items-center gap-2 bg-white px-1
          dark:bg-neutral-950
        `}
      >
        <span ref={commitCountTextRef} data-demo-commit-count>
          commit 0
        </span>
        <span
          ref={commitIndicatorRef}
          data-demo-commit-indicator
          className={`
            size-2 bg-slate-300
            dark:bg-neutral-700
          `}
        />
      </span>

      <section
        data-demo-left-live
        style={leftLiveStyle}
        className={`
          absolute inset-y-4 left-3 z-10 outline-[1px] -outline-offset-1 outline-slate-300 contain-[layout]
          dark:outline-neutral-700
        `}
      >
        <span className={EDGE_LABEL_CLASS}>left-live</span>
        <div data-demo-left-blur-surface style={leftBlurSurfaceStyle}>
          <div data-demo-left-scale-surface style={leftScaleSurfaceStyle}>
            <div className="absolute inset-0 overflow-hidden">
              <div
                data-demo-left-content-layer
                className={`
                  absolute inset-y-7 left-1/2 w-[max(0px,calc(100%-40px))] -translate-x-1/2 outline-[1px]
                  -outline-offset-1 outline-sky-300 contain-[layout] outline-dashed
                  dark:outline-sky-400/60
                `}
              >
                <span className={EDGE_LABEL_CLASS}>left-content-layer</span>
                <div data-demo-left-content-layer-scroll className="absolute inset-0 overflow-y-auto">
                  <div
                    data-demo-left-content
                    className={`
                      relative left-1/2 my-7 min-h-[calc(100%-56px)] w-[max(0px,calc(100%-40px))] max-w-[640px]
                      -translate-x-1/2 outline-[1px] -outline-offset-1 outline-sky-300 outline-dashed
                      dark:outline-sky-400/60
                    `}
                  >
                    <span className={EDGE_LABEL_CLASS}>left-real-content</span>
                    <div className="p-4 pt-8 text-center">
                      {LEFT_PARAGRAPHS.map((text) => (
                        <p
                          key={text}
                          className={`
                            mb-5 text-center text-[13px]/6 text-slate-600
                            dark:text-neutral-300
                          `}
                        >
                          {text}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/*
          No `view-transition-name` here, and none needed. In the snapshot
          version these panels had to opt into the transition just to keep their
          stacking order; with no view transition layer, their DOM `z-index`
          simply works.
        */}
        <div
          data-demo-left-metrics
          className={`
            pointer-events-none absolute inset-x-4 bottom-4 z-30 bg-white/90 p-2 text-left text-[11px]/4 text-slate-600
            outline-[1px] -outline-offset-1 outline-slate-300 outline-dashed
            dark:bg-neutral-950/90 dark:text-neutral-300 dark:outline-neutral-700
          `}
        >
          <pre ref={leftMetricsRef} className="whitespace-pre-wrap" />
        </div>
      </section>

      <section
        data-demo-right-live
        style={rightLiveStyle}
        className={cn(
          `
            absolute inset-y-4 z-10 outline-[1px] -outline-offset-1 outline-slate-300 contain-[layout]
            dark:outline-neutral-700
          `,
          !trailingOpen && `pointer-events-none`
        )}
      >
        <span className={EDGE_LABEL_CLASS}>right-live</span>
        <div data-demo-right-blur-surface style={rightBlurSurfaceStyle}>
          <div data-demo-right-scale-surface style={rightScaleSurfaceStyle}>
            <div className="absolute inset-0 overflow-hidden">
              <div
                data-demo-right-content-layer
                className={`
                  absolute inset-y-7 left-1/2 w-[max(0px,calc(100%-40px))] -translate-x-1/2 outline-[1px]
                  -outline-offset-1 outline-emerald-300 contain-[layout] outline-dashed
                  dark:outline-emerald-400/60
                `}
              >
                <span className={EDGE_LABEL_CLASS}>right-content-layer</span>
                <div data-demo-right-content-layer-scroll className="absolute inset-0 overflow-y-auto">
                  <div
                    data-demo-right-content
                    className={`
                      relative left-1/2 my-7 min-h-[calc(100%-56px)] w-[max(0px,calc(100%-40px))] max-w-[640px]
                      -translate-x-1/2 outline-[1px] -outline-offset-1 outline-emerald-300 outline-dashed
                      dark:outline-emerald-400/60
                    `}
                  >
                    <span className={EDGE_LABEL_CLASS}>right-real-content</span>
                    <div className="p-4 pt-8 text-center">
                      {RIGHT_PARAGRAPHS.map((text) => (
                        <p
                          key={text}
                          className={`
                            mb-5 text-center text-[13px]/6 text-slate-600
                            dark:text-neutral-300
                          `}
                        >
                          {text}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div
          data-demo-right-metrics
          className={`
            pointer-events-none absolute inset-x-4 bottom-4 z-30 bg-white/90 p-2 text-left text-[11px]/4 text-slate-600
            outline-[1px] -outline-offset-1 outline-slate-300 outline-dashed
            dark:bg-neutral-950/90 dark:text-neutral-300 dark:outline-neutral-700
          `}
        >
          <pre ref={rightMetricsRef} className="whitespace-pre-wrap" />
        </div>
      </section>

      <div
        data-demo-divider
        role="separator"
        aria-orientation="vertical"
        onPointerDown={handleDividerPointerDown}
        className={cn(
          `
            absolute inset-y-6 left-(--split-divider-x) z-20 w-px -translate-x-1/2 cursor-col-resize bg-slate-500
            before:absolute before:-inset-x-3 before:inset-y-0 before:content-[""]
            dark:bg-neutral-500
          `,
          !trailingOpen && `pointer-events-none opacity-0`
        )}
      />

      <button
        type="button"
        aria-label={trailingOpen ? 'Collapse right pane' : 'Expand right pane'}
        aria-expanded={trailingOpen}
        onClick={handleToggleTrailing}
        data-demo-toggle-right
        className={`
          absolute top-3 right-3 z-30 grid size-8 place-items-center bg-white text-slate-500 outline-[1px]
          -outline-offset-1 outline-slate-400
          dark:bg-neutral-900 dark:text-neutral-300 dark:outline-neutral-600
        `}
      >
        {trailingOpen ? ']' : '['}
      </button>
    </div>
  );
};
