import { cn } from '@monorepo/utils';
import { motion } from 'motion/react';
import { type CSSProperties, type FC, type PointerEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

export interface BufferedSplitLayoutViewTransitionDemoProps {
  initialLeadingRatio?: number;
  initialTrailingOpen?: boolean;
}

const MIN_LEADING_PX = 360;
const MIN_TRAILING_PX = 360;
const PANE_VISUAL_GAP_TOTAL_PX = 20;
const LOCKED_CONTENT_LAYER_INSET_PX = 40;
const CONTENT_HORIZONTAL_INSET_PX = 40;
const CLIP_BLUR_PX = 6;
const BLUR_ENTER_MS = 140;
const BLUR_EXIT_MS = 360;
const CONTENT_MAX_WIDTH_PX = 640;
const VIEW_TRANSITION_MS = BLUR_EXIT_MS;
const TOGGLE_LAYOUT_MS = 500;
const TOGGLE_CROSS_DISSOLVE_MS = 90;
const TOGGLE_BLUR_ENTER_MS = 80;
const TOGGLE_BLUR_EXIT_MS = 460;
const EDGE_LABEL_CLASS = 'pointer-events-none absolute top-0 left-3 z-20 -translate-y-1/2 bg-white px-1 leading-none';

const LAYOUT_SPRING = {
  type: 'spring',
  stiffness: 400,
  damping: 40,
  mass: 1,
} as const;

const SAMPLE_TEXT = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer congue, lorem vitae interdum pulvinar, mi risus lacinia massa, non cursus leo augue at massa.',
  'Praesent gravida sem vel nibh sagittis, ut viverra libero facilisis. Suspendisse potenti. Sed ac ipsum a justo tincidunt consequat in id mauris.',
  'Aliquam erat volutpat. Donec euismod, ligula non suscipit suscipit, lacus est blandit velit, sit amet commodo justo mi non justo.',
  'Curabitur vitae justo at erat interdum hendrerit. Nunc gravida eros vel lectus vulputate, sed pretium nulla viverra.',
  'Mauris luctus, nibh nec tincidunt sodales, leo magna tristique ligula, vitae ultricies mauris arcu et lacus.',
  'Vivamus aliquet neque sed sem vestibulum, nec facilisis lacus ullamcorper. Nulla et tellus non sem ornare faucibus.',
];

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

const formatPx = (value: number) => `${Math.round(value)}px`;

const formatScale = (value: number) => value.toFixed(3);

const buildParagraphs = (prefix: string) =>
  Array.from({ length: 20 }, (_, index) => `${prefix} ${index + 1}. ${SAMPLE_TEXT[index % SAMPLE_TEXT.length]}`);

const LEFT_PARAGRAPHS = buildParagraphs('Left');
const RIGHT_PARAGRAPHS = buildParagraphs('Right');

export const BufferedSplitLayoutViewTransitionDemo: FC<BufferedSplitLayoutViewTransitionDemoProps> = ({
  initialLeadingRatio = 0.6,
  initialTrailingOpen = true,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const commitCountTextRef = useRef<HTMLSpanElement>(null);
  const commitIndicatorRef = useRef<HTMLSpanElement>(null);
  const commitFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitTransitionCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleTransitionCleanupRef = useRef<(() => void) | null>(null);
  const dragOffsetRef = useRef(0);
  const dragViewportWidthRef = useRef(0);
  const dragActiveRef = useRef(false);
  const layoutLeadingPxRef = useRef<number | null>(null);
  const layoutTrailingPxRef = useRef<number | null>(null);
  const liveLeadingPxRef = useRef<number | null>(null);
  const liveTrailingPxRef = useRef<number | null>(null);
  const preferredLeadingRatioRef = useRef(initialLeadingRatio);
  const layoutCommitCountRef = useRef(0);
  const leftMetricsRef = useRef<HTMLPreElement>(null);
  const rightMetricsRef = useRef<HTMLPreElement>(null);
  const metricsRef = useRef<LayoutMetrics | null>(null);
  const trailingOpenRef = useRef(initialTrailingOpen);
  const [trailingOpen, setTrailingOpen] = useState(initialTrailingOpen);

  const renderMetricsPanels = () => {
    const metrics = metricsRef.current;
    const leftMetrics = leftMetricsRef.current;
    const rightMetrics = rightMetricsRef.current;
    if (!metrics || !leftMetrics || !rightMetrics) return;

    leftMetrics.textContent = [
      `visual ${formatPx(metrics.leftVisualPx)} | locked ${formatPx(metrics.leftLockedPx)}`,
      `content locked ${formatPx(metrics.leftContentLockedPx)} | scale ${formatScale(metrics.leftScale)}`,
      `preferred ${(preferredLeadingRatioRef.current * 100).toFixed(1)}%`,
      `resizer ${dragActiveRef.current ? 'dragging' : 'idle'}`,
    ].join('\n');

    rightMetrics.textContent = [
      `visual ${formatPx(metrics.rightVisualPx)} | locked ${formatPx(metrics.rightLockedPx)}`,
      `content locked ${formatPx(metrics.rightContentLockedPx)} | scale ${formatScale(metrics.rightScale)}`,
      `preferred ${((1 - preferredLeadingRatioRef.current) * 100).toFixed(1)}%`,
      `resizer ${dragActiveRef.current ? 'dragging' : 'idle'}`,
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

  const setTrailingOpenSync = (nextOpen: boolean) => {
    trailingOpenRef.current = nextOpen;
    flushSync(() => setTrailingOpen(nextOpen));
  };

  const getPreferredLeadingPx = (viewportWidth: number) =>
    ratioToLeadingPx(preferredLeadingRatioRef.current, viewportWidth);

  const cancelBlurExit = () => {
    if (blurExitTimerRef.current != null) {
      clearTimeout(blurExitTimerRef.current);
      blurExitTimerRef.current = null;
    }
  };

  const writeBlurTransitionDuration = (durationMs: number) => {
    const root = rootRef.current;
    if (!root) return;

    root.style.setProperty('--split-left-blur-transition-duration', `${durationMs}ms`);
    root.style.setProperty('--split-right-blur-transition-duration', `${durationMs}ms`);
  };

  const startBlurExit = () => {
    const root = rootRef.current;
    if (!root) return;

    cancelBlurExit();
    writeBlurTransitionDuration(BLUR_EXIT_MS);
    root.getBoundingClientRect();
    root.style.setProperty('--split-left-blur', '0px');
    root.style.setProperty('--split-right-blur', '0px');
  };

  const startToggleBlurExit = () => {
    const root = rootRef.current;
    if (!root) return;

    cancelBlurExit();
    root.style.setProperty('--split-left-blur-transition-duration', `${TOGGLE_BLUR_EXIT_MS}ms`);
    root.style.setProperty('--split-right-blur-transition-duration', `${TOGGLE_BLUR_EXIT_MS}ms`);
    root.getBoundingClientRect();
    root.style.setProperty('--split-left-blur', '0px');
    root.style.setProperty('--split-right-blur', '0px');
  };

  const clearToggleTransitionMode = () => {
    const root = rootRef.current;
    root?.removeAttribute('data-demo-toggle-transition');
    document.documentElement.removeAttribute('data-buffered-split-toggle-transition');
    document.documentElement.style.removeProperty('--split-left-toggle-from-scale');
    toggleTransitionCleanupRef.current = null;
  };

  const writeMetrics = (leadingVisualPx: number, trailingVisualPx: number) => {
    const leadingLockedPx = layoutLeadingPxRef.current ?? leadingVisualPx;
    const trailingLockedPx = layoutTrailingPxRef.current ?? trailingVisualPx;
    const leftLockedPx = paneWidthToLockedLayerPx(leadingLockedPx);
    const rightLockedPx = paneWidthToLockedLayerPx(trailingLockedPx);
    const leftVisualPx = paneWidthToLockedLayerPx(leadingVisualPx);
    const rightVisualPx = paneWidthToLockedLayerPx(trailingVisualPx);

    metricsRef.current = {
      leftContentLockedPx: lockedLayerPxToContentPx(leftLockedPx),
      leftLockedPx,
      leftScale: getScale(paneWidthToVisiblePx(leadingVisualPx), paneWidthToVisiblePx(leadingLockedPx)),
      leftVisualPx,
      rightContentLockedPx: lockedLayerPxToContentPx(rightLockedPx),
      rightLockedPx,
      rightScale: getScale(paneWidthToVisiblePx(trailingVisualPx), paneWidthToVisiblePx(trailingLockedPx)),
      rightVisualPx,
    };
    renderMetricsPanels();
  };

  const writeLiveTransform = (leadingVisualPx: number, viewportWidth: number, blur: boolean) => {
    const root = rootRef.current;
    if (!root) return;

    const clampedLeadingPx = clampLeadingPx(leadingVisualPx, viewportWidth);
    const trailingVisualPx = viewportWidth - clampedLeadingPx;
    const leadingLockedPx = layoutLeadingPxRef.current ?? clampedLeadingPx;
    const trailingLockedPx = layoutTrailingPxRef.current ?? trailingVisualPx;
    const leftScale = getScale(paneWidthToVisiblePx(clampedLeadingPx), paneWidthToVisiblePx(leadingLockedPx));
    const rightScale = getScale(paneWidthToVisiblePx(trailingVisualPx), paneWidthToVisiblePx(trailingLockedPx));

    liveLeadingPxRef.current = clampedLeadingPx;
    liveTrailingPxRef.current = trailingVisualPx;
    root.style.setProperty('--split-leading-visual-width', formatPx(clampedLeadingPx));
    root.style.setProperty('--split-trailing-visual-width', formatPx(trailingVisualPx));
    root.style.setProperty('--split-divider-x', formatPx(clampedLeadingPx));
    root.style.setProperty('--split-left-scale', String(leftScale));
    root.style.setProperty('--split-right-scale', String(rightScale));
    writeBlurTransitionDuration(blur ? BLUR_ENTER_MS : BLUR_EXIT_MS);
    root.style.setProperty('--split-left-blur', blur ? `${CLIP_BLUR_PX}px` : '0px');
    root.style.setProperty('--split-right-blur', blur ? `${CLIP_BLUR_PX}px` : '0px');
    writeMetrics(clampedLeadingPx, trailingVisualPx);
  };

  const commitLayout = (
    leadingLayoutPx: number,
    trailingLayoutPx: number,
    options: { clearBlur?: boolean; open: boolean }
  ) => {
    const root = rootRef.current;
    if (!root) return;

    layoutLeadingPxRef.current = leadingLayoutPx;
    layoutTrailingPxRef.current = trailingLayoutPx;
    liveLeadingPxRef.current = options.open ? leadingLayoutPx : root.getBoundingClientRect().width;
    liveTrailingPxRef.current = trailingLayoutPx;

    root.style.setProperty('--split-leading-layout-width', formatPx(leadingLayoutPx));
    root.style.setProperty('--split-trailing-layout-width', formatPx(trailingLayoutPx));
    root.style.setProperty('--split-leading-visual-width', formatPx(liveLeadingPxRef.current));
    root.style.setProperty('--split-trailing-visual-width', formatPx(liveTrailingPxRef.current));
    root.style.setProperty(
      '--split-divider-x',
      formatPx(options.open ? leadingLayoutPx : root.getBoundingClientRect().width)
    );
    root.style.setProperty('--split-left-scale', '1');
    root.style.setProperty('--split-right-scale', '1');
    if (options.clearBlur ?? true) {
      cancelBlurExit();
      writeBlurTransitionDuration(BLUR_EXIT_MS);
      root.style.setProperty('--split-left-blur', '0px');
      root.style.setProperty('--split-right-blur', '0px');
    }

    layoutCommitCountRef.current += 1;
    if (commitCountTextRef.current != null) {
      commitCountTextRef.current.textContent = `commit ${layoutCommitCountRef.current}`;
    }
    flashCommitIndicator();
    writeMetrics(liveLeadingPxRef.current, trailingLayoutPx);
  };

  const runViewTransitionCommit = (update: () => void) => {
    if (!('startViewTransition' in document)) {
      update();
      return null;
    }

    const transition = document.startViewTransition(update);
    void transition.finished.catch(() => undefined);
    return transition;
  };

  const commitOpenSplitWithViewTransition = (leadingLayoutPx: number, viewportWidth: number) => {
    const nextLeadingPx = clampLeadingPx(leadingLayoutPx, viewportWidth);

    const transition = runViewTransitionCommit(() => {
      if (!trailingOpenRef.current) {
        setTrailingOpenSync(true);
      }
      commitLayout(nextLeadingPx, viewportWidth - nextLeadingPx, { clearBlur: false, open: true });
    });
    if (transition) {
      void transition.ready.then(startBlurExit, startBlurExit);
    } else {
      startBlurExit();
    }
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
    if (initialTrailingOpen) {
      commitLayout(preferredLeadingPx, preferredTrailingPx, { open: true });
    } else {
      commitLayout(viewportWidth, preferredTrailingPx, { open: false });
    }
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
      const preferredTrailingPx = viewportWidth - preferredLeadingPx;

      if (trailingOpenRef.current) {
        commitLayout(preferredLeadingPx, preferredTrailingPx, { open: true });
      } else {
        commitLayout(viewportWidth, preferredTrailingPx, { open: false });
      }
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

      if (blurExitTimerRef.current != null) {
        clearTimeout(blurExitTimerRef.current);
      }

      toggleTransitionCleanupRef.current?.();
    };
  }, []);

  const handleDividerPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root || !trailingOpenRef.current) return;

    const pointerId = event.pointerId;
    const rootRect = root.getBoundingClientRect();
    const divider = event.currentTarget;
    const currentLeadingStylePx = Number.parseFloat(root.style.getPropertyValue('--split-divider-x'));
    const currentLeadingPx = Number.isNaN(currentLeadingStylePx)
      ? (layoutLeadingPxRef.current ?? ratioToLeadingPx(initialLeadingRatio, rootRect.width))
      : currentLeadingStylePx;

    divider.setPointerCapture(pointerId);
    dragOffsetRef.current = event.clientX - rootRect.left - currentLeadingPx;
    dragViewportWidthRef.current = rootRect.width;
    dragActiveRef.current = true;
    cancelBlurExit();
    writeBlurTransitionDuration(BLUR_ENTER_MS);
    root.style.setProperty('--split-left-blur', `${CLIP_BLUR_PX}px`);
    root.style.setProperty('--split-right-blur', `${CLIP_BLUR_PX}px`);
    event.preventDefault();
    renderMetricsPanels();

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;

      const nextLeadingPx = moveEvent.clientX - rootRect.left - dragOffsetRef.current;
      const nextEffectiveLeadingPx = clampLeadingPx(nextLeadingPx, dragViewportWidthRef.current);
      preferredLeadingRatioRef.current = nextEffectiveLeadingPx / dragViewportWidthRef.current;
      writeLiveTransform(nextEffectiveLeadingPx, dragViewportWidthRef.current, true);
    };

    const handleUp = (upEvent: globalThis.PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;

      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      dragActiveRef.current = false;
      const finalLeadingPx = liveLeadingPxRef.current ?? currentLeadingPx;
      renderMetricsPanels();
      divider.releasePointerCapture(pointerId);
      commitOpenSplitWithViewTransition(finalLeadingPx, dragViewportWidthRef.current);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const handleToggleTrailing = () => {
    const root = rootRef.current;
    if (!root) {
      setTrailingOpenSync(!trailingOpenRef.current);
      return;
    }

    const viewportWidth = root.getBoundingClientRect().width;
    const preferredLeadingPx = getPreferredLeadingPx(viewportWidth);
    const preferredTrailingPx = viewportWidth - preferredLeadingPx;
    const nextOpen = !trailingOpenRef.current;
    const currentLeadingPx = liveLeadingPxRef.current ?? (trailingOpenRef.current ? preferredLeadingPx : viewportWidth);
    const nextLeadingPx = nextOpen ? preferredLeadingPx : viewportWidth;
    const currentLeftVisiblePx = Math.max(1, paneWidthToVisiblePx(currentLeadingPx));
    const nextLeftVisiblePx = Math.max(1, paneWidthToVisiblePx(nextLeadingPx));
    const leftToggleFromScale = currentLeftVisiblePx / nextLeftVisiblePx;

    toggleTransitionCleanupRef.current?.();
    root.setAttribute('data-demo-toggle-transition', nextOpen ? 'expand' : 'collapse');
    document.documentElement.setAttribute('data-buffered-split-toggle-transition', nextOpen ? 'expand' : 'collapse');
    document.documentElement.style.setProperty('--split-left-toggle-from-scale', String(leftToggleFromScale));
    root.style.setProperty('--split-left-blur-transition-duration', `${TOGGLE_BLUR_ENTER_MS}ms`);
    root.style.setProperty('--split-right-blur-transition-duration', `${TOGGLE_BLUR_ENTER_MS}ms`);
    root.style.setProperty('--split-left-blur', `${CLIP_BLUR_PX}px`);
    root.style.setProperty('--split-right-blur', '0px');
    root.getBoundingClientRect();

    // Toggle is a hybrid path: the right pane uses Motion FLIP on the live DOM,
    // while the left pane uses the target View Transition snapshot scaled back
    // to the current width, cross-dissolved, then transformed to the target.
    const updateLayout = () => {
      setTrailingOpenSync(nextOpen);

      if (nextOpen) {
        commitLayout(preferredLeadingPx, preferredTrailingPx, { clearBlur: false, open: true });
      } else {
        commitLayout(viewportWidth, preferredTrailingPx, { clearBlur: false, open: false });
      }
    };

    const transition = runViewTransitionCommit(updateLayout);
    toggleTransitionCleanupRef.current = clearToggleTransitionMode;

    if (transition) {
      void transition.finished.then(
        () => {
          clearToggleTransitionMode();
          startToggleBlurExit();
        },
        () => {
          clearToggleTransitionMode();
          startToggleBlurExit();
        }
      );
    } else {
      clearToggleTransitionMode();
      startToggleBlurExit();
    }
  };

  const rootStyle = {
    '--split-left-blur': '0px',
    '--split-left-blur-transition-duration': `${BLUR_ENTER_MS}ms`,
    '--split-right-blur': '0px',
    '--split-right-blur-transition-duration': `${BLUR_ENTER_MS}ms`,
    '--split-divider-x': '60%',
    '--split-leading-layout-width': '60%',
    '--split-leading-visual-width': '60%',
    '--split-left-scale': 1,
    '--split-right-scale': 1,
    '--split-trailing-layout-width': '40%',
    '--split-trailing-visual-width': '40%',
  } as CSSProperties;

  const leftLiveStyle = {
    width: 'max(0px, calc(var(--split-leading-visual-width) - 20px))',
  } as CSSProperties;

  const leftViewTransitionStyle = {
    bottom: 0,
    filter: 'blur(var(--split-left-blur))',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    transition: `filter var(--split-left-blur-transition-duration) ease`,
    viewTransitionName: 'buffered-split-left',
  } as CSSProperties;

  const leftScaleSurfaceStyle = {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    transform: 'scaleX(var(--split-left-scale))',
    transformOrigin: 'left center',
    width: 'max(0px, calc(var(--split-leading-layout-width) - 20px))',
  } as CSSProperties;

  const leftMetricsStyle = {
    viewTransitionName: 'buffered-split-left-metrics',
  } as CSSProperties;

  const rightLiveStyle = {
    left: trailingOpen ? 'calc(100% - var(--split-trailing-visual-width) + 8px)' : '100%',
    width: 'max(0px, calc(var(--split-trailing-visual-width) - 20px))',
  } as CSSProperties;

  const rightViewTransitionStyle = {
    bottom: 0,
    filter: 'blur(var(--split-right-blur))',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    transition: `filter var(--split-right-blur-transition-duration) ease`,
    viewTransitionName: 'buffered-split-right',
  } as CSSProperties;

  const rightScaleSurfaceStyle = {
    bottom: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    transform: 'scaleX(var(--split-right-scale))',
    transformOrigin: 'right center',
    width: 'max(0px, calc(var(--split-trailing-layout-width) - 20px))',
  } as CSSProperties;

  const rightMetricsStyle = {
    viewTransitionName: 'buffered-split-right-metrics',
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      data-buffered-split-layout-view-transition-demo
      data-trailing-collapsed={!trailingOpen ? 'true' : undefined}
      style={rootStyle}
      className="relative h-dvh min-h-[620px] w-full overflow-hidden bg-white font-mono text-[12px] text-slate-500"
    >
      <style>
        {`
          ::view-transition-group(root),
          ::view-transition-old(root),
          ::view-transition-new(root),
          ::view-transition-group(buffered-split-left),
          ::view-transition-group(buffered-split-right),
          ::view-transition-group(buffered-split-left-metrics),
          ::view-transition-group(buffered-split-right-metrics) {
            animation: none;
          }

          ::view-transition-group(buffered-split-left),
          ::view-transition-group(buffered-split-right) {
            z-index: 10;
          }

          /*
            The metrics panels are live debug overlays, but ordinary DOM cannot paint above
            the View Transition overlay. They participate only to preserve the intended
            stacking order during the pane cross-dissolve; all their animations are disabled.
          */
          ::view-transition-group(buffered-split-left-metrics),
          ::view-transition-group(buffered-split-right-metrics) {
            z-index: 20;
          }

          ::view-transition-old(buffered-split-left),
          ::view-transition-old(buffered-split-right) {
            animation: buffered-split-fade-out ${VIEW_TRANSITION_MS}ms ease both;
            mix-blend-mode: normal;
          }

          ::view-transition-new(buffered-split-left),
          ::view-transition-new(buffered-split-right) {
            animation: buffered-split-fade-in ${VIEW_TRANSITION_MS}ms ease both;
            mix-blend-mode: normal;
          }

          ::view-transition-old(buffered-split-left-metrics),
          ::view-transition-old(buffered-split-right-metrics) {
            animation: none;
            opacity: 0;
            mix-blend-mode: normal;
          }

          ::view-transition-new(buffered-split-left-metrics),
          ::view-transition-new(buffered-split-right-metrics) {
            animation: none;
            opacity: 1;
            mix-blend-mode: normal;
          }

          [data-buffered-split-layout-view-transition-demo][data-demo-toggle-transition] [data-demo-right-transition-surface] {
            view-transition-name: none !important;
          }

          html[data-buffered-split-toggle-transition]::view-transition-group(buffered-split-left) {
            animation: none;
          }

          html[data-buffered-split-toggle-transition]::view-transition-image-pair(buffered-split-left) {
            animation: buffered-split-left-toggle-transform ${TOGGLE_LAYOUT_MS}ms cubic-bezier(0.22, 1, 0.36, 1) both;
            transform-origin: left center;
          }

          html[data-buffered-split-toggle-transition]::view-transition-old(buffered-split-left) {
            animation: none;
            opacity: 0;
            mix-blend-mode: normal;
          }

          html[data-buffered-split-toggle-transition]::view-transition-new(buffered-split-left) {
            animation: buffered-split-toggle-fade-in ${TOGGLE_CROSS_DISSOLVE_MS}ms ease both;
            mix-blend-mode: normal;
          }

          @keyframes buffered-split-fade-out {
            from { opacity: 1; }
            to { opacity: 0; }
          }

          @keyframes buffered-split-fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          @keyframes buffered-split-toggle-fade-out {
            from { opacity: 1; }
            to { opacity: 0; }
          }

          @keyframes buffered-split-toggle-fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          @keyframes buffered-split-left-toggle-transform {
            from { transform: scaleX(var(--split-left-toggle-from-scale)); }
            to { transform: scaleX(1); }
          }
        `}
      </style>

      <span className="pointer-events-none absolute top-2 right-14 z-40 flex items-center gap-2 bg-white px-1">
        <span ref={commitCountTextRef} data-demo-commit-count>
          commit 0
        </span>
        <span ref={commitIndicatorRef} data-demo-commit-indicator className="size-2 bg-slate-300" />
      </span>

      <section
        data-demo-left-live
        style={leftLiveStyle}
        className={`
          absolute inset-y-4 left-3 z-10
          [contain:layout]
          outline-[1px] -outline-offset-1 outline-slate-300
        `}
      >
        <span className={EDGE_LABEL_CLASS}>left-live</span>
        <div data-demo-left-transition-surface style={leftViewTransitionStyle}>
          <div data-demo-left-scale-surface style={leftScaleSurfaceStyle}>
            <div className="absolute inset-0 overflow-hidden">
              <div
                data-demo-left-content-layer
                className={`
                  absolute top-7 bottom-7 left-1/2 [width:max(0px,calc(100%-40px))] -translate-x-1/2 [contain:layout]
                  outline-[1px] -outline-offset-1 outline-sky-300 outline-dashed
                `}
              >
                <span className={EDGE_LABEL_CLASS}>left-content-layer</span>
                <div data-demo-left-content-layer-scroll className="absolute inset-0 overflow-y-auto">
                  <div
                    data-demo-left-content
                    className={`
                      relative left-1/2 my-7 min-h-[calc(100%-56px)]
                      [width:max(0px,calc(100%-40px))]
                      max-w-[640px] -translate-x-1/2 outline-[1px] -outline-offset-1 outline-sky-300 outline-dashed
                    `}
                  >
                    <span className={EDGE_LABEL_CLASS}>left-real-content</span>
                    <div className="p-4 pt-8 text-center">
                      {LEFT_PARAGRAPHS.map((text) => (
                        <p key={text} className="mb-5 text-center text-[13px]/6 text-slate-600">
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
          data-demo-left-metrics
          style={leftMetricsStyle}
          className={`
            pointer-events-none absolute right-4 bottom-4 left-4 z-30 bg-white/90 p-2 text-left text-[11px]/4
            text-slate-600 outline-[1px] -outline-offset-1 outline-slate-300 outline-dashed
          `}
        >
          <pre ref={leftMetricsRef} className="whitespace-pre-wrap" />
        </div>
      </section>

      <motion.section
        data-demo-right-live
        layout="position"
        layoutDependency={trailingOpen}
        initial={false}
        transition={{ layout: LAYOUT_SPRING }}
        style={rightLiveStyle}
        className={cn(
          `
            absolute inset-y-4 z-10
            [contain:layout]
            outline-[1px] -outline-offset-1 outline-slate-300
          `,
          !trailingOpen && `pointer-events-none`
        )}
      >
        <span className={EDGE_LABEL_CLASS}>right-live</span>
        <div data-demo-right-transition-surface style={rightViewTransitionStyle}>
          <div data-demo-right-scale-surface style={rightScaleSurfaceStyle}>
            <div className="absolute inset-0 overflow-hidden">
              <div
                data-demo-right-content-layer
                className={`
                  absolute top-7 bottom-7 left-1/2 [width:max(0px,calc(100%-40px))] -translate-x-1/2 [contain:layout]
                  outline-[1px] -outline-offset-1 outline-emerald-300 outline-dashed
                `}
              >
                <span className={EDGE_LABEL_CLASS}>right-content-layer</span>
                <div data-demo-right-content-layer-scroll className="absolute inset-0 overflow-y-auto">
                  <div
                    data-demo-right-content
                    className={`
                      relative left-1/2 my-7 min-h-[calc(100%-56px)]
                      [width:max(0px,calc(100%-40px))]
                      max-w-[640px] -translate-x-1/2 outline-[1px] -outline-offset-1 outline-emerald-300 outline-dashed
                    `}
                  >
                    <span className={EDGE_LABEL_CLASS}>right-real-content</span>
                    <div className="p-4 pt-8 text-center">
                      {RIGHT_PARAGRAPHS.map((text) => (
                        <p key={text} className="mb-5 text-center text-[13px]/6 text-slate-600">
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
          style={rightMetricsStyle}
          className={`
            pointer-events-none absolute right-4 bottom-4 left-4 z-30 bg-white/90 p-2 text-left text-[11px]/4
            text-slate-600 outline-[1px] -outline-offset-1 outline-slate-300 outline-dashed
          `}
        >
          <pre ref={rightMetricsRef} className="whitespace-pre-wrap" />
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
