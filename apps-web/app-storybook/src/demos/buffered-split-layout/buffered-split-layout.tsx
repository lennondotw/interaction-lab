import { cn } from '@monorepo/utils';
import { animate, motion, useMotionTemplate, useMotionValue, useMotionValueEvent, useSpring } from 'motion/react';
import { type CSSProperties, type FC, type PointerEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface BufferedSplitLayoutDemoProps {
  initialLeadingRatio?: number;
  initialTrailingOpen?: boolean;
}

const MIN_LEADING_PX = 360;
const MIN_TRAILING_PX = 360;

// The demo intentionally separates the immediately visible split from the
// committed render width. Dragging writes the live CSS variables on every
// pointer move, while the committed width only catches up after this trailing
// debounce fires.
const COMMIT_DELAY_MS = 200;

// These insets make the nested boxes visible in the demo, but they also mirror
// the production layout idea: the outer pane can resize or clip without forcing
// the inner content width to change on every frame.
const PANE_VISUAL_GAP_TOTAL_PX = 20;
const COMMITTED_HORIZONTAL_INSET_PX = 40;
const CONTENT_HORIZONTAL_INSET_PX = 40;
const CLIP_BLUR_PX = 4;
const WIDTH_DIFF_EPSILON_PX = 0.5;
const CONTENT_MAX_WIDTH_PX = 640;
const EDGE_LABEL_CLASS = 'pointer-events-none absolute top-0 left-3 z-20 -translate-y-1/2 bg-white px-1 leading-none';

// Blur is a state affordance, not the layout animation itself. It should feel
// responsive and should not inherit the slower committed-width spring.
const CRITICAL_SPRING = {
  type: 'spring',
  stiffness: 900,
  damping: 60,
  mass: 1,
} as const;

// Layout movement uses a slower spring because it is the visible reconciliation
// between "live" and "committed" geometry.
const LAYOUT_SPRING = {
  type: 'spring',
  stiffness: 400,
  damping: 40,
  mass: 1,
} as const;

// This is not the physical duration of the spring. It is the window during
// which we consider the committed layout to be settling, so buffered blur is
// prevented from reappearing on small spring overshoots.
const COMMIT_ANIMATION_MS = 500;

const SAMPLE_TEXT = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer congue, lorem vitae interdum pulvinar, mi risus lacinia massa, non cursus leo augue at massa.',
  'Praesent gravida sem vel nibh sagittis, ut viverra libero facilisis. Suspendisse potenti. Sed ac ipsum a justo tincidunt consequat in id mauris.',
  'Aliquam erat volutpat. Donec euismod, ligula non suscipit suscipit, lacus est blandit velit, sit amet commodo justo mi non justo.',
  'Curabitur vitae justo at erat interdum hendrerit. Nunc gravida eros vel lectus vulputate, sed pretium nulla viverra.',
  'Mauris luctus, nibh nec tincidunt sodales, leo magna tristique ligula, vitae ultricies mauris arcu et lacus.',
  'Vivamus aliquet neque sed sem vestibulum, nec facilisis lacus ullamcorper. Nulla et tellus non sem ornare faucibus.',
];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const ratioToLeadingPx = (ratio: number, viewportWidth: number) =>
  clamp(viewportWidth * ratio, MIN_LEADING_PX, viewportWidth - MIN_TRAILING_PX);

const formatPx = (value: number) => `${Math.round(value)}px`;

interface CommittedBox {
  widthPx: number;
  xPx: number;
}

// The committed motion values drive the inner committed container box, not the
// whole pane. Keep this translation in one place so visual metrics and DOM
// geometry agree.
const paneWidthToCenteredCommittedBox = (paneWidthPx: number): CommittedBox => {
  const liveWidthPx = Math.max(0, paneWidthPx - PANE_VISUAL_GAP_TOTAL_PX);
  const widthPx = Math.max(0, liveWidthPx - COMMITTED_HORIZONTAL_INSET_PX);

  return {
    widthPx,
    xPx: Math.max(0, (liveWidthPx - widthPx) / 2),
  };
};

interface LayoutMetrics {
  leftCommittedRenderPx: number;
  leftCommittedVisiblePx: number;
  leftContentRenderPx: number;
  leftContentVisiblePx: number;
  rightCommittedRenderPx: number;
  rightCommittedVisiblePx: number;
  rightContentRenderPx: number;
  rightContentVisiblePx: number;
}

const buildParagraphs = (prefix: string) =>
  Array.from({ length: 20 }, (_, index) => `${prefix} ${index + 1}. ${SAMPLE_TEXT[index % SAMPLE_TEXT.length]}`);

const LEFT_PARAGRAPHS = buildParagraphs('Left');
const RIGHT_PARAGRAPHS = buildParagraphs('Right');

export const BufferedSplitLayoutDemo: FC<BufferedSplitLayoutDemoProps> = ({
  initialLeadingRatio = 0.6,
  initialTrailingOpen = true,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitTransitionCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitAnimationSettledTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitCountTextRef = useRef<HTMLSpanElement>(null);
  const commitIndicatorRef = useRef<HTMLSpanElement>(null);

  // Full pane widths are the committed split contract. They are used for the
  // next resize/toggle calculation, but they are not written to the DOM every
  // animation frame.
  const committedLeadingPxRef = useRef<number | null>(null);
  const committedTrailingPxRef = useRef<number | null>(null);

  // These are the currently rendered committed container widths. During a
  // commit animation they move frame-by-frame via MotionValue, and the metrics
  // read from these refs so the debug panel reflects the actual DOM width.
  const committedLeadingXPxRef = useRef<number | null>(null);
  const committedLeadingWidthPxRef = useRef<number | null>(null);
  const committedTrailingWidthPxRef = useRef<number | null>(null);

  // Live widths are the immediately visible shell. Pointer moves and window
  // resize update these through CSS variables without going through React.
  const liveLeadingPxRef = useRef<number | null>(null);
  const liveTrailingPxRef = useRef<number | null>(null);

  const commitAnimationControlsRef = useRef<{
    leftX?: { stop: () => void };
    left?: { stop: () => void };
    right?: { stop: () => void };
  }>({});
  const dragOffsetRef = useRef(0);
  const dragViewportWidthRef = useRef(0);
  const dragActiveRef = useRef(false);

  // Pending commit means the live layout has diverged from the committed render
  // width and the trailing debounce has not fired yet. Blur belongs to this
  // state, not to the pointer-down state.
  const pendingCommitRef = useRef(false);

  // Once the commit starts, the blur should leave immediately and stay gone
  // while the committed width spring settles, even if the spring briefly
  // overshoots and creates another width diff.
  const commitAnimationActiveRef = useRef(false);
  const layoutCommitCountRef = useRef(0);
  const leftMetricsRef = useRef<HTMLPreElement>(null);
  const metricsRef = useRef<LayoutMetrics | null>(null);
  const rightMetricsRef = useRef<HTMLPreElement>(null);
  const [trailingOpen, setTrailingOpen] = useState(initialTrailingOpen);
  const leftCommittedXPx = useMotionValue(0);
  const leftCommittedWidthPx = useMotionValue(0);
  const rightCommittedWidthPx = useMotionValue(0);
  const leftBlurPx = useMotionValue(0);
  const rightBlurPx = useMotionValue(0);
  const leftBlur = useSpring(leftBlurPx, CRITICAL_SPRING);
  const rightBlur = useSpring(rightBlurPx, CRITICAL_SPRING);
  const leftBufferedFilter = useMotionTemplate`blur(${leftBlur}px)`;
  const rightBufferedFilter = useMotionTemplate`blur(${rightBlur}px)`;

  // Metrics are written imperatively so the demo can show live frame data
  // without turning the debug panel into a React re-render source.
  const renderMetricsPanels = () => {
    const metrics = metricsRef.current;
    const leftMetrics = leftMetricsRef.current;
    const rightMetrics = rightMetricsRef.current;
    if (!metrics || !leftMetrics || !rightMetrics) return;

    const leftContainerDiffPx = metrics.leftCommittedVisiblePx - metrics.leftCommittedRenderPx;
    const rightContainerDiffPx = metrics.rightCommittedVisiblePx - metrics.rightCommittedRenderPx;
    const leftContentDiffPx = metrics.leftContentVisiblePx - metrics.leftContentRenderPx;
    const rightContentDiffPx = metrics.rightContentVisiblePx - metrics.rightContentRenderPx;

    leftMetrics.textContent = [
      `live ${formatPx(metrics.leftCommittedVisiblePx)} | committed ${formatPx(metrics.leftCommittedRenderPx)}`,
      `content ${formatPx(metrics.leftContentVisiblePx)} | committed ${formatPx(metrics.leftContentRenderPx)}`,
      `diff ${formatPx(leftContentDiffPx)} | container ${formatPx(leftContainerDiffPx)}`,
      `resizer ${dragActiveRef.current ? 'dragging' : 'idle'}`,
    ].join('\n');

    rightMetrics.textContent = [
      `live ${formatPx(metrics.rightCommittedVisiblePx)} | committed ${formatPx(metrics.rightCommittedRenderPx)}`,
      `content ${formatPx(metrics.rightContentVisiblePx)} | committed ${formatPx(metrics.rightContentRenderPx)}`,
      `diff ${formatPx(rightContentDiffPx)} | container ${formatPx(rightContainerDiffPx)}`,
      `resizer ${dragActiveRef.current ? 'dragging' : 'idle'}`,
    ].join('\n');
  };

  // The indicator marks the commit event itself, not the full spring. That
  // makes it useful for seeing when the debounce actually fired.
  const flashCommitIndicator = () => {
    const indicator = commitIndicatorRef.current;
    if (indicator == null) return;

    if (commitFlashTimerRef.current != null) {
      clearTimeout(commitFlashTimerRef.current);
    }

    if (commitTransitionCleanupTimerRef.current != null) {
      clearTimeout(commitTransitionCleanupTimerRef.current);
    }

    indicator.classList.remove('bg-slate-300', 'transition-colors', 'duration-700', 'ease-out');
    indicator.classList.add('bg-emerald-500');
    indicator.getBoundingClientRect();

    commitFlashTimerRef.current = setTimeout(() => {
      indicator.classList.add('transition-colors', 'duration-700', 'ease-out');
      indicator.classList.remove('bg-emerald-500');
      indicator.classList.add('bg-slate-300');
      commitFlashTimerRef.current = null;

      commitTransitionCleanupTimerRef.current = setTimeout(() => {
        indicator.classList.remove('transition-colors', 'duration-700', 'ease-out');
        commitTransitionCleanupTimerRef.current = null;
      }, 720);
    }, 80);
  };

  // Any new live movement interrupts the "commit is settling" grace window and
  // moves the layout back into a pending commit. The current width animation is
  // allowed to keep running until the next commit target replaces it.
  const beginPendingCommit = () => {
    pendingCommitRef.current = true;

    if (!commitAnimationActiveRef.current) return;

    commitAnimationActiveRef.current = false;

    if (commitAnimationSettledTimerRef.current != null) {
      clearTimeout(commitAnimationSettledTimerRef.current);
      commitAnimationSettledTimerRef.current = null;
    }
  };

  // All expensive derived visual state is calculated from refs and MotionValues.
  // React state only controls structural concerns like whether the trailing pane
  // is mounted/open; drag and resize should not trigger React commits.
  const writeVisualEffects = (leadingLivePx: number, trailingLivePx: number) => {
    liveLeadingPxRef.current = leadingLivePx;
    liveTrailingPxRef.current = trailingLivePx;

    const leftPaneVisiblePx = Math.max(0, leadingLivePx - PANE_VISUAL_GAP_TOTAL_PX);
    const rightPaneVisiblePx = Math.max(0, trailingLivePx - PANE_VISUAL_GAP_TOTAL_PX);
    const leftCommittedVisiblePx = Math.max(0, leftPaneVisiblePx - COMMITTED_HORIZONTAL_INSET_PX);
    const rightCommittedVisiblePx = Math.max(0, rightPaneVisiblePx - COMMITTED_HORIZONTAL_INSET_PX);
    const leftCommittedRenderPx = committedLeadingWidthPxRef.current ?? leftCommittedVisiblePx;
    const rightCommittedRenderPx = committedTrailingWidthPxRef.current ?? rightCommittedVisiblePx;
    const leftContentVisiblePx = Math.min(
      Math.max(0, leftCommittedVisiblePx - CONTENT_HORIZONTAL_INSET_PX),
      CONTENT_MAX_WIDTH_PX
    );
    const leftContentRenderPx = Math.min(
      Math.max(0, leftCommittedRenderPx - CONTENT_HORIZONTAL_INSET_PX),
      CONTENT_MAX_WIDTH_PX
    );
    const rightContentVisiblePx = Math.min(
      Math.max(0, rightCommittedVisiblePx - CONTENT_HORIZONTAL_INSET_PX),
      CONTENT_MAX_WIDTH_PX
    );
    const rightContentRenderPx = Math.min(
      Math.max(0, rightCommittedRenderPx - CONTENT_HORIZONTAL_INSET_PX),
      CONTENT_MAX_WIDTH_PX
    );
    const leftContentDiffPx = Math.abs(leftContentVisiblePx - leftContentRenderPx);
    const rightContentDiffPx = Math.abs(rightContentVisiblePx - rightContentRenderPx);

    // Blur expresses "the live shell is ahead of the committed content". It
    // remains after pointer up during the debounce gap, then starts leaving as
    // soon as the commit animation begins.
    const shouldShowBufferedBlur = pendingCommitRef.current && !commitAnimationActiveRef.current;

    leftBlurPx.set(shouldShowBufferedBlur && leftContentDiffPx > WIDTH_DIFF_EPSILON_PX ? CLIP_BLUR_PX : 0);
    rightBlurPx.set(shouldShowBufferedBlur && rightContentDiffPx > WIDTH_DIFF_EPSILON_PX ? CLIP_BLUR_PX : 0);
    metricsRef.current = {
      leftCommittedRenderPx,
      leftCommittedVisiblePx,
      leftContentRenderPx,
      leftContentVisiblePx,
      rightCommittedRenderPx,
      rightCommittedVisiblePx,
      rightContentRenderPx,
      rightContentVisiblePx,
    };
    renderMetricsPanels();
  };

  // MotionValue subscribers keep refs and labels in sync with the actual DOM
  // width animation. They intentionally do not mirror into React state.
  const refreshVisualEffects = () => {
    const leadingLivePx = liveLeadingPxRef.current;
    const trailingLivePx = liveTrailingPxRef.current;
    if (leadingLivePx == null || trailingLivePx == null) return;

    writeVisualEffects(leadingLivePx, trailingLivePx);
  };

  useMotionValueEvent(leftCommittedXPx, 'change', (latest) => {
    committedLeadingXPxRef.current = latest;
  });

  useMotionValueEvent(leftCommittedWidthPx, 'change', (latest) => {
    committedLeadingWidthPxRef.current = latest;
    refreshVisualEffects();
  });

  useMotionValueEvent(rightCommittedWidthPx, 'change', (latest) => {
    committedTrailingWidthPxRef.current = latest;
    refreshVisualEffects();
  });

  const writeCommittedWidths = (
    leadingWidthPx: number,
    trailingWidthPx: number,
    shouldAnimate: boolean,
    leftCommittedBox = paneWidthToCenteredCommittedBox(leadingWidthPx)
  ) => {
    const nextLeftXPx = leftCommittedBox.xPx;
    const nextLeftWidthPx = leftCommittedBox.widthPx;
    const nextRightWidthPx = paneWidthToCenteredCommittedBox(trailingWidthPx).widthPx;

    commitAnimationControlsRef.current.leftX?.stop();
    commitAnimationControlsRef.current.left?.stop();
    commitAnimationControlsRef.current.right?.stop();

    if (commitAnimationSettledTimerRef.current != null) {
      clearTimeout(commitAnimationSettledTimerRef.current);
      commitAnimationSettledTimerRef.current = null;
    }

    if (shouldAnimate) {
      // Commit is the hand-off point: pending blur exits immediately, then the
      // committed containers spring toward the target width.
      pendingCommitRef.current = false;
      commitAnimationActiveRef.current = true;
      leftBlurPx.set(0);
      rightBlurPx.set(0);
      commitAnimationControlsRef.current.leftX = animate(leftCommittedXPx, nextLeftXPx, LAYOUT_SPRING);
      commitAnimationControlsRef.current.left = animate(leftCommittedWidthPx, nextLeftWidthPx, LAYOUT_SPRING);
      commitAnimationControlsRef.current.right = animate(rightCommittedWidthPx, nextRightWidthPx, LAYOUT_SPRING);
      commitAnimationSettledTimerRef.current = setTimeout(() => {
        commitAnimationActiveRef.current = false;
        commitAnimationSettledTimerRef.current = null;
        refreshVisualEffects();
      }, COMMIT_ANIMATION_MS + 20);
    } else {
      // Initial layout and non-animated resets should establish the committed
      // geometry without playing catch-up from zero.
      pendingCommitRef.current = false;
      commitAnimationActiveRef.current = false;
      leftCommittedXPx.jump(nextLeftXPx);
      leftCommittedWidthPx.jump(nextLeftWidthPx);
      rightCommittedWidthPx.jump(nextRightWidthPx);
      committedLeadingXPxRef.current = nextLeftXPx;
      committedLeadingWidthPxRef.current = nextLeftWidthPx;
      committedTrailingWidthPxRef.current = nextRightWidthPx;
    }

    refreshVisualEffects();
  };

  // A commit updates the canonical split refs immediately, then reconciles the
  // visual committed containers via MotionValue. This keeps future calculations
  // deterministic even while the UI is still animating.
  const commitLayout = (
    leadingWidthPx: number,
    trailingWidthPx: number,
    options: {
      animateCommit?: boolean;
      leftCommittedBox?: CommittedBox;
    } = {}
  ) => {
    const shouldAnimate = options.animateCommit ?? true;

    layoutCommitCountRef.current += 1;
    committedLeadingPxRef.current = leadingWidthPx;
    committedTrailingPxRef.current = trailingWidthPx;
    if (commitCountTextRef.current != null) {
      commitCountTextRef.current.textContent = `commit ${layoutCommitCountRef.current}`;
    }
    flashCommitIndicator();
    writeCommittedWidths(leadingWidthPx, trailingWidthPx, shouldAnimate, options.leftCommittedBox);
    renderMetricsPanels();
  };

  const commitCollapsedLayout = (
    viewportWidth: number,
    trailingWidthPx: number,
    options: {
      animateCommit?: boolean;
      leftCommittedBox?: CommittedBox;
    } = {}
  ) => {
    commitLayout(viewportWidth, trailingWidthPx, options);
  };

  const writeLiveSplit = (leadingPx: number, viewportWidth?: number, open = trailingOpen) => {
    const root = rootRef.current;
    if (!root) return;

    const width = viewportWidth ?? root.getBoundingClientRect().width;
    const clampedLeadingPx = clamp(leadingPx, MIN_LEADING_PX, width - MIN_TRAILING_PX);
    const trailingWidthPx = open
      ? width - clampedLeadingPx
      : (committedTrailingPxRef.current ?? width - clampedLeadingPx);
    const leadingLivePx = open ? clampedLeadingPx : width;
    const dividerXPx = open ? clampedLeadingPx : width;

    // Live layout is the hot path. CSS variables update the outer shell and
    // divider directly; React only sees the eventual committed result.
    root.style.setProperty('--split-leading-live-width', formatPx(leadingLivePx));
    root.style.setProperty('--split-trailing-live-width', formatPx(trailingWidthPx));
    root.style.setProperty('--split-divider-x', formatPx(dividerXPx));
    writeVisualEffects(leadingLivePx, trailingWidthPx);
  };

  // Trailing-only debounce: every live movement replaces the pending timer, and
  // only the final target becomes a committed layout.
  const scheduleCommit = (leadingPx: number) => {
    if (commitTimerRef.current != null) {
      clearTimeout(commitTimerRef.current);
    }

    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      const root = rootRef.current;
      if (!root) return;

      const viewportWidth = root.getBoundingClientRect().width;
      const nextLeadingPx = clamp(leadingPx, MIN_LEADING_PX, viewportWidth - MIN_TRAILING_PX);
      commitLayout(nextLeadingPx, viewportWidth - nextLeadingPx);
    }, COMMIT_DELAY_MS);
  };

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const viewportWidth = root.getBoundingClientRect().width;
    const nextLeadingPx = ratioToLeadingPx(initialLeadingRatio, viewportWidth);
    if (initialTrailingOpen) {
      commitLayout(nextLeadingPx, viewportWidth - nextLeadingPx, { animateCommit: false });
    } else {
      commitCollapsedLayout(viewportWidth, viewportWidth - nextLeadingPx, { animateCommit: false });
    }
    writeLiveSplit(nextLeadingPx, viewportWidth, initialTrailingOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLeadingRatio, initialTrailingOpen]);

  useEffect(() => {
    renderMetricsPanels();
  });

  useEffect(() => {
    setTrailingOpen(initialTrailingOpen);
  }, [initialTrailingOpen]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const handleResize = () => {
      // Window resize follows the same model as divider drag: update the live
      // shell immediately, then commit the stabilized geometry after debounce.
      beginPendingCommit();

      const viewportWidth = root.getBoundingClientRect().width;
      const trailingWidthPx = clamp(
        committedTrailingPxRef.current ?? viewportWidth * (1 - initialLeadingRatio),
        MIN_TRAILING_PX,
        viewportWidth - MIN_LEADING_PX
      );

      if (!trailingOpen) {
        root.style.setProperty('--split-leading-live-width', formatPx(viewportWidth));
        root.style.setProperty('--split-trailing-live-width', formatPx(trailingWidthPx));
        root.style.setProperty('--split-divider-x', formatPx(viewportWidth));
        writeVisualEffects(viewportWidth, trailingWidthPx);

        if (commitTimerRef.current != null) {
          clearTimeout(commitTimerRef.current);
        }

        commitTimerRef.current = setTimeout(() => {
          commitTimerRef.current = null;
          commitCollapsedLayout(viewportWidth, trailingWidthPx);
          renderMetricsPanels();
        }, COMMIT_DELAY_MS);
        return;
      }

      const currentLeadingPx = committedLeadingPxRef.current ?? ratioToLeadingPx(initialLeadingRatio, viewportWidth);
      const nextLeadingPx = clamp(currentLeadingPx, MIN_LEADING_PX, viewportWidth - trailingWidthPx);
      writeLiveSplit(nextLeadingPx, viewportWidth, true);
      scheduleCommit(nextLeadingPx);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLeadingRatio, trailingOpen]);

  useEffect(() => {
    const commitAnimationControls = commitAnimationControlsRef.current;

    return () => {
      if (commitTimerRef.current != null) {
        clearTimeout(commitTimerRef.current);
      }

      if (commitFlashTimerRef.current != null) {
        clearTimeout(commitFlashTimerRef.current);
      }

      if (commitTransitionCleanupTimerRef.current != null) {
        clearTimeout(commitTransitionCleanupTimerRef.current);
      }

      if (commitAnimationSettledTimerRef.current != null) {
        clearTimeout(commitAnimationSettledTimerRef.current);
      }

      commitAnimationControls.leftX?.stop();
      commitAnimationControls.left?.stop();
      commitAnimationControls.right?.stop();
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // Prop/open-state changes need a live shell refresh, but they should not
    // create a pending commit by themselves.
    const viewportWidth = root.getBoundingClientRect().width;
    const fallbackLeadingPx =
      trailingOpen && committedLeadingPxRef.current != null
        ? committedLeadingPxRef.current
        : viewportWidth - (committedTrailingPxRef.current ?? viewportWidth * (1 - initialLeadingRatio));
    writeLiveSplit(fallbackLeadingPx, viewportWidth, trailingOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLeadingRatio, trailingOpen]);

  const handleDividerPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root || !trailingOpen) return;

    const pointerId = event.pointerId;
    const rootRect = root.getBoundingClientRect();
    const currentLeadingStylePx = Number.parseFloat(root.style.getPropertyValue('--split-leading-live-width'));
    const currentLeadingPx = Number.isNaN(currentLeadingStylePx)
      ? (committedLeadingPxRef.current ?? ratioToLeadingPx(initialLeadingRatio, rootRect.width))
      : currentLeadingStylePx;

    event.currentTarget.setPointerCapture(pointerId);
    dragOffsetRef.current = event.clientX - rootRect.left - currentLeadingPx;
    dragViewportWidthRef.current = rootRect.width;
    dragActiveRef.current = true;
    event.preventDefault();
    renderMetricsPanels();

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;

      // Dragging never mutates React state. The shell follows the pointer
      // through CSS variables, and the pending commit timer captures the final
      // target after the hand stops moving.
      beginPendingCommit();

      const nextLeadingPx = moveEvent.clientX - rootRect.left - dragOffsetRef.current;
      writeLiveSplit(nextLeadingPx, dragViewportWidthRef.current, true);
      scheduleCommit(nextLeadingPx);
    };

    const handleUp = (upEvent: globalThis.PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;

      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      dragActiveRef.current = false;

      // Pointer up is not the end of buffering. Blur should remain through the
      // debounce gap and leave when the commit actually starts.
      refreshVisualEffects();
      renderMetricsPanels();
      event.currentTarget.releasePointerCapture(pointerId);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const handleToggleTrailing = () => {
    const root = rootRef.current;
    if (!root) {
      setTrailingOpen((value) => !value);
      return;
    }

    const viewportWidth = root.getBoundingClientRect().width;
    const currentTrailingWidthPx =
      committedTrailingPxRef.current ??
      viewportWidth - (committedLeadingPxRef.current ?? ratioToLeadingPx(initialLeadingRatio, viewportWidth));
    const fallbackLeadingPx = viewportWidth - currentTrailingWidthPx;
    const nextOpen = !trailingOpen;
    setTrailingOpen(nextOpen);

    if (nextOpen) {
      const legalLeadingPx = clamp(fallbackLeadingPx, MIN_LEADING_PX, viewportWidth - MIN_TRAILING_PX);
      commitLayout(legalLeadingPx, viewportWidth - legalLeadingPx);
      writeLiveSplit(legalLeadingPx, viewportWidth, true);
    } else {
      // Collapse keeps the right pane rendered off-screen. That preserves the
      // sidebar's internal state and makes the next expansion cheap.
      const currentLeftCommittedXPx =
        committedLeadingXPxRef.current ??
        paneWidthToCenteredCommittedBox(committedLeadingPxRef.current ?? fallbackLeadingPx).xPx;
      const collapsedLiveWidthPx = Math.max(0, viewportWidth - PANE_VISUAL_GAP_TOTAL_PX);
      const collapsedRightInsetPx = COMMITTED_HORIZONTAL_INSET_PX / 2;
      const leftCommittedBox = {
        xPx: currentLeftCommittedXPx,
        widthPx: Math.max(0, collapsedLiveWidthPx - currentLeftCommittedXPx - collapsedRightInsetPx),
      };

      root.style.setProperty('--split-leading-live-width', formatPx(viewportWidth));
      root.style.setProperty('--split-trailing-live-width', formatPx(currentTrailingWidthPx));
      root.style.setProperty('--split-divider-x', formatPx(viewportWidth));
      writeVisualEffects(viewportWidth, currentTrailingWidthPx);
      commitCollapsedLayout(viewportWidth, currentTrailingWidthPx, { leftCommittedBox });
    }
  };

  const rootStyle = {
    '--split-leading-live-width': '60%',
    '--split-trailing-live-width': '40%',
    '--split-divider-x': '60%',
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      data-buffered-split-layout-demo
      data-trailing-collapsed={!trailingOpen ? 'true' : undefined}
      style={rootStyle}
      className="relative h-dvh min-h-[620px] w-full overflow-hidden bg-white font-mono text-[12px] text-slate-500"
    >
      <span className="pointer-events-none absolute top-2 right-14 z-40 flex items-center gap-2 bg-white px-1">
        <span ref={commitCountTextRef} data-demo-commit-count>
          commit 0
        </span>
        <span ref={commitIndicatorRef} data-demo-commit-indicator className="size-2 bg-slate-300" />
      </span>

      <section
        data-demo-left-live
        className={`
          absolute inset-y-4 left-3 z-10
          [width:max(0px,calc(var(--split-leading-live-width)-20px))]
          outline-[1px] -outline-offset-1 outline-slate-300
        `}
      >
        <span className={EDGE_LABEL_CLASS}>left-live</span>
        <div className="absolute inset-0 overflow-hidden">
          {/* Resize targets center this box; collapse targets keep its left edge fixed and spring the right edge out. */}
          <motion.div
            data-demo-left-committed
            style={{ filter: leftBufferedFilter, width: leftCommittedWidthPx, x: leftCommittedXPx }}
            className="absolute top-7 bottom-7 left-0 outline-[1px] -outline-offset-1 outline-sky-300 outline-dashed"
          >
            <span className={EDGE_LABEL_CLASS}>left-committed</span>
            {/* The committed container owns scrolling, so the content label and width move with committed geometry. */}
            <div data-demo-left-committed-scroll className="absolute inset-0 overflow-y-auto">
              <div
                data-demo-left-content
                className={`
                  relative left-1/2 my-7 min-h-[calc(100%-56px)]
                  [width:max(0px,calc(100%-40px))]
                  max-w-[640px] -translate-x-1/2 outline-[1px] -outline-offset-1 outline-sky-300 outline-dashed
                `}
              >
                <span className={EDGE_LABEL_CLASS}>left-content</span>
                <div className="p-4 pt-8 text-center">
                  {LEFT_PARAGRAPHS.map((text) => (
                    <p key={text} className="mb-5 text-center text-[13px]/6 text-slate-600">
                      {text}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
          <div
            data-demo-left-metrics
            className={`
              pointer-events-none absolute right-4 bottom-4 left-4 z-30 bg-white/90 p-2 text-left text-[11px]/4
              text-slate-600 outline-[1px] -outline-offset-1 outline-slate-300 outline-dashed
            `}
          >
            <pre ref={leftMetricsRef} className="whitespace-pre-wrap" />
          </div>
        </div>
      </section>

      <motion.section
        data-demo-right-live
        layout="position"
        layoutDependency={trailingOpen}
        initial={false}
        transition={{ layout: LAYOUT_SPRING }}
        style={{
          left: trailingOpen ? 'calc(100% - var(--split-trailing-live-width) + 8px)' : '100%',
        }}
        className={cn(
          `
            absolute inset-y-4 z-10
            [width:max(0px,calc(var(--split-trailing-live-width)-20px))]
            outline-[1px] -outline-offset-1 outline-slate-300
          `,
          !trailingOpen && `pointer-events-none`
        )}
      >
        <span className={EDGE_LABEL_CLASS}>right-live</span>
        <div className="absolute inset-0 overflow-hidden">
          {/* Only right-live uses Motion FLIP. The committed width below is a direct MotionValue width animation. */}
          <motion.div
            data-demo-right-committed
            style={{ filter: rightBufferedFilter, width: rightCommittedWidthPx }}
            className={`
              absolute top-7 bottom-7 left-1/2 -translate-x-1/2 outline-[1px] -outline-offset-1 outline-emerald-300
              outline-dashed
            `}
          >
            <span className={EDGE_LABEL_CLASS}>right-committed</span>
            <div data-demo-right-committed-scroll className="absolute inset-0 overflow-y-auto">
              <div
                data-demo-right-content
                className={`
                  relative left-1/2 my-7 min-h-[calc(100%-56px)]
                  [width:max(0px,calc(100%-40px))]
                  max-w-[640px] -translate-x-1/2 outline-[1px] -outline-offset-1 outline-emerald-300 outline-dashed
                `}
              >
                <span className={EDGE_LABEL_CLASS}>right-content</span>
                <div className="p-4 pt-8 text-center">
                  {RIGHT_PARAGRAPHS.map((text) => (
                    <p key={text} className="mb-5 text-center text-[13px]/6 text-slate-600">
                      {text}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
          <div
            data-demo-right-metrics
            className={`
              pointer-events-none absolute right-4 bottom-4 left-4 z-30 bg-white/90 p-2 text-left text-[11px]/4
              text-slate-600 outline-[1px] -outline-offset-1 outline-slate-300 outline-dashed
            `}
          >
            <pre ref={rightMetricsRef} className="whitespace-pre-wrap" />
          </div>
        </div>
      </motion.section>

      <div
        data-demo-divider
        role="separator"
        aria-orientation="vertical"
        onPointerDown={handleDividerPointerDown}
        className={cn(
          `
            absolute inset-y-6
            [left:var(--split-divider-x)]
            z-20 w-px -translate-x-1/2 cursor-col-resize bg-slate-500
            before:absolute before:inset-y-0 before:-right-3 before:-left-3 before:content-[""]
          `,
          !trailingOpen && `pointer-events-none opacity-0`
        )}
      />

      {/* The toggle is intentionally independent from the divider so collapse can keep the right pane alive off-screen. */}
      <button
        type="button"
        aria-label={trailingOpen ? 'Collapse right pane' : 'Expand right pane'}
        aria-expanded={trailingOpen}
        onClick={handleToggleTrailing}
        data-demo-toggle-right
        className={`
          absolute top-3 right-3 z-30 grid size-8 place-items-center bg-white text-slate-500 outline-[1px]
          -outline-offset-1 outline-slate-400
        `}
      >
        {trailingOpen ? ']' : '['}
      </button>
    </div>
  );
};
