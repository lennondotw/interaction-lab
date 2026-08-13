import { animate, type AnimationPlaybackControlsWithThen, useMotionValue, useMotionValueEvent } from 'motion/react';
import { type CSSProperties, type FC, type PointerEvent, useEffect, useLayoutEffect, useRef } from 'react';

export interface BufferedSplitLayoutLiveCommitDemoProps {
  initialLeadingRatio?: number;
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

const CONTENT_LAYER_INSET_PX = 40;
const CONTENT_HORIZONTAL_INSET_PX = 40;
const CONTENT_MAX_WIDTH_PX = 640;

/**
 * Trailing debounce: every event pushes the tick back, so a window drag of any
 * length re-targets the leading pane exactly once, 100ms after the hand stops.
 *
 * Half the siblings' 200ms, and it can be, because the delay is not covering
 * anything. There it has to outlast a gesture whose reflow is hidden behind a
 * blur or a snapshot; here the reflow is the animation, so the only thing the
 * delay buys is confidence that the window has actually settled.
 */
const WINDOW_RESIZE_DEBOUNCE_MS = 100;

const DIVIDER_SPRING_STIFFNESS = 400;
const DIVIDER_SPRING_MASS = 1;

/**
 * Critically damped: ζ = 1, so `damping = 2√(km)`. Overshoot is not a taste
 * question on this path. Every frame the divider moves is a real reflow of both
 * content columns, so an overshoot would lay the text out past its target and
 * then lay it out again coming back.
 */
const DIVIDER_SPRING = {
  damping: 2 * Math.sqrt(DIVIDER_SPRING_STIFFNESS * DIVIDER_SPRING_MASS),
  mass: DIVIDER_SPRING_MASS,
  stiffness: DIVIDER_SPRING_STIFFNESS,
  type: 'spring',
} as const;

// The knockout background has to match the surface behind it, or the dashed
// outline the label sits on shows through the text.
const EDGE_LABEL_CLASS =
  'pointer-events-none absolute top-0 left-3 z-20 -translate-y-1/2 bg-white px-1 leading-none dark:bg-neutral-950';

/**
 * The retarget flash is written as an inline style rather than swapped as a
 * class. Its idle colour is theme-dependent, and a `dark:` utility beats a plain
 * one on source order, so adding `bg-emerald-500` on top would do nothing in
 * dark mode.
 */
const RETARGET_FLASH_COLOR = 'var(--color-emerald-500)';

const SAMPLE_TEXT = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer congue, lorem vitae interdum pulvinar, mi risus lacinia massa, non cursus leo augue at massa.',
  'Praesent gravida sem vel nibh sagittis, ut viverra libero facilisis. Suspendisse potenti. Sed ac ipsum a justo tincidunt consequat in id mauris.',
  'Aliquam erat volutpat. Donec euismod, ligula non suscipit suscipit, lacus est blandit velit, sit amet commodo justo mi non justo.',
  'Curabitur vitae justo at erat interdum hendrerit. Nunc gravida eros vel lectus vulputate, sed pretium nulla viverra.',
  'Mauris luctus, nibh nec tincidunt sodales, leo magna tristique ligula, vitae ultricies mauris arcu et lacus.',
  'Vivamus aliquet neque sed sem vestibulum, nec facilisis lacus ullamcorper. Nulla et tellus non sem ornare faucibus.',
];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Below `MIN_LEADING_PX + MIN_TRAILING_PX` the two minimums cannot both hold, and
 * these two lines are where that is arbitrated. The order is: the stage outranks
 * the leading minimum, which outranks the trailing minimum.
 *
 * Measured across the bands, remembering that a pane's box is 20px narrower than
 * the width it is handed:
 *
 * - `W >= 720` — an ordinary range, and the only one where both minimums hold.
 * - `380 <= W < 720` — leading pins at 360 and keeps its 340px box. The trailing
 *   pane goes below its own minimum, reaching 0 at 380.
 * - `W < 380` — the trailing box computes negative, and CSS floors the used width
 *   at 0. It is positioned by two edges rather than by a width, so there is no
 *   width for JavaScript to clamp; the metrics derive 0 the same way, so the
 *   panel and the DOM agree rather than the panel reporting a box that is not
 *   there.
 * - `W < 360` — leading gives way to the stage and becomes `W`.
 *
 * The ladder is deliberate in that direction rather than the other: a demo whose
 * subject is the divider would rather keep the leading pane legible than uphold a
 * pair of minimums the viewport cannot afford. Every band is total and monotone
 * in `W`, which is the part that matters — there is no width at which the layout
 * is merely undefined.
 */
const getLeadingBounds = (viewportWidth: number) => {
  const minPx = Math.min(MIN_LEADING_PX, viewportWidth);
  const maxPx = Math.max(minPx, viewportWidth - MIN_TRAILING_PX);

  return { maxPx, minPx };
};

/** True when the bounds have collapsed to a single value, so nothing the user
 *  does can put the divider anywhere else. */
const isLeadingPinned = (viewportWidth: number) => {
  const { maxPx, minPx } = getLeadingBounds(viewportWidth);

  return minPx >= maxPx;
};

const clampLeadingPx = (leadingPx: number, viewportWidth: number) => {
  const { maxPx, minPx } = getLeadingBounds(viewportWidth);

  return clamp(leadingPx, minPx, maxPx);
};

const ratioToLeadingPx = (ratio: number, viewportWidth: number) => clampLeadingPx(viewportWidth * ratio, viewportWidth);

const paneWidthToVisiblePx = (paneWidthPx: number) => Math.max(0, paneWidthPx - PANE_VISUAL_GAP_TOTAL_PX);

const visiblePxToContentLayerPx = (visiblePx: number) => Math.max(0, visiblePx - CONTENT_LAYER_INSET_PX);

const contentLayerPxToContentPx = (contentLayerPx: number) =>
  Math.min(Math.max(0, contentLayerPx - CONTENT_HORIZONTAL_INSET_PX), CONTENT_MAX_WIDTH_PX);

/** Style writes keep sub-pixel precision so the divider cannot land a fraction
 *  of a pixel away from the pane edge it defines. Only the metrics panel rounds. */
const cssPx = (value: number) => `${value}px`;

const formatPx = (value: number) => `${Math.round(value)}px`;

const buildParagraphs = (prefix: string) =>
  Array.from({ length: 20 }, (_, index) => `${prefix} ${index + 1}. ${SAMPLE_TEXT[index % SAMPLE_TEXT.length]}`);

const LEFT_PARAGRAPHS = buildParagraphs('Left');
const RIGHT_PARAGRAPHS = buildParagraphs('Right');

/**
 * The split layout with the buffer taken out: no snapshot, no blur, no `scaleX`
 * standing in for a width. There is one width in the component — the one the
 * real content lays out at — and every path writes it directly, so dragging the
 * divider reflows both columns on the frame the pointer moved.
 *
 * That leaves window resize, which has no release signal to commit on, as the
 * only path with a policy. Its policy is not to hide the reflow but to split the
 * two panes apart:
 *
 * - The trailing pane is positioned by its two edges rather than by a width, so
 *   the viewport change reaches it live, on every event, with no JavaScript
 *   involved at all.
 * - The leading pane has an explicit width, so it does not move until something
 *   moves it. A 100ms trailing debounce is the only thing that does, re-targeting
 *   a critically damped spring at the width the preferred ratio now asks for.
 *
 * So for the whole length of a window drag the leading pane does no layout work
 * whatsoever while the trailing pane tracks the window frame for frame, and the
 * divider gliding to its new place afterwards is the reflow becoming visible —
 * the same reflow the sibling demos spend a blur or a snapshot to cover up.
 */
export const BufferedSplitLayoutLiveCommitDemo: FC<BufferedSplitLayoutLiveCommitDemoProps> = ({
  initialLeadingRatio = 0.6,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const counterTextRef = useRef<HTMLSpanElement>(null);
  const retargetIndicatorRef = useRef<HTMLSpanElement>(null);
  const retargetFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retargetFlashCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const windowResizeDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dividerSpringRef = useRef<AnimationPlaybackControlsWithThen | null>(null);
  const dragOffsetRef = useRef(0);
  const dragActiveRef = useRef(false);
  const viewportWidthRef = useRef(0);
  const leadingPxRef = useRef(0);
  const targetLeadingPxRef = useRef(0);

  /** The durable split intent. Only the drag rewrites it, so a viewport too
   *  narrow to honour it clamps the width without losing the ratio. */
  const preferredLeadingRatioRef = useRef(initialLeadingRatio);
  const resizeEventCountRef = useRef(0);
  const retargetCountRef = useRef(0);
  const leftMetricsRef = useRef<HTMLPreElement>(null);
  const rightMetricsRef = useRef<HTMLPreElement>(null);

  // One value for the one width. The drag sets it per pointer event and the
  // debounce springs it, which is also what lets a spring caught mid-flight
  // inherit its own velocity instead of restarting from a standstill.
  const leadingPxValue = useMotionValue(0);

  const getInteractionMode = () => {
    if (dragActiveRef.current) return 'dragging';
    if (windowResizeDebounceTimerRef.current != null) return 'window resize';
    if (dividerSpringRef.current != null) return 'settling';

    return 'idle';
  };

  const renderMetricsPanels = () => {
    const leftMetrics = leftMetricsRef.current;
    const rightMetrics = rightMetricsRef.current;
    if (!leftMetrics || !rightMetrics) return;

    const viewportWidth = viewportWidthRef.current;
    const leadingPx = leadingPxRef.current;
    const targetLeadingPx = targetLeadingPxRef.current;
    const leftPanePx = paneWidthToVisiblePx(leadingPx);
    const rightPanePx = paneWidthToVisiblePx(viewportWidth - leadingPx);
    const leftLayerPx = visiblePxToContentLayerPx(leftPanePx);
    const rightLayerPx = visiblePxToContentLayerPx(rightPanePx);
    const mode = getInteractionMode();

    leftMetrics.textContent = [
      `pane ${formatPx(leftPanePx)} | target ${formatPx(paneWidthToVisiblePx(targetLeadingPx))}`,
      `layer ${formatPx(leftLayerPx)} | content ${formatPx(contentLayerPxToContentPx(leftLayerPx))}`,
      `preferred ${(preferredLeadingRatioRef.current * 100).toFixed(1)}%`,
      `mode ${mode}`,
    ].join('\n');

    rightMetrics.textContent = [
      `pane ${formatPx(rightPanePx)} | target ${formatPx(paneWidthToVisiblePx(viewportWidth - targetLeadingPx))}`,
      `layer ${formatPx(rightLayerPx)} | content ${formatPx(contentLayerPxToContentPx(rightLayerPx))}`,
      `preferred ${((1 - preferredLeadingRatioRef.current) * 100).toFixed(1)}%`,
      `mode ${mode}`,
    ].join('\n');
  };

  // Both numbers together are the point of the debounce: how many events the
  // window sent, and how few of them moved the leading pane.
  const renderCounters = () => {
    const counterText = counterTextRef.current;
    if (counterText == null) return;

    counterText.textContent = `resize ${resizeEventCountRef.current} | retarget ${retargetCountRef.current}`;
  };

  const flashRetargetIndicator = () => {
    const indicator = retargetIndicatorRef.current;
    if (indicator == null) return;

    if (retargetFlashTimerRef.current != null) {
      clearTimeout(retargetFlashTimerRef.current);
    }

    if (retargetFlashCleanupTimerRef.current != null) {
      clearTimeout(retargetFlashCleanupTimerRef.current);
    }

    indicator.classList.remove('transition-colors', 'duration-700', 'ease-out');
    indicator.style.backgroundColor = RETARGET_FLASH_COLOR;
    indicator.getBoundingClientRect();

    retargetFlashTimerRef.current = setTimeout(() => {
      indicator.classList.add('transition-colors', 'duration-700', 'ease-out');
      // Clearing the override hands the colour back to the themed idle class.
      indicator.style.backgroundColor = '';
      retargetFlashTimerRef.current = null;

      retargetFlashCleanupTimerRef.current = setTimeout(() => {
        indicator.classList.remove('transition-colors', 'duration-700', 'ease-out');
        retargetFlashCleanupTimerRef.current = null;
      }, 720);
    }, 80);
  };

  const getPreferredLeadingPx = (viewportWidth: number) =>
    ratioToLeadingPx(preferredLeadingRatioRef.current, viewportWidth);

  /**
   * The only width write in the component, and the expensive one: this is the
   * width the content lays out at, so every call reflows both columns.
   *
   * The clamp belongs here rather than at each caller. A running spring is
   * heading for a value that was right when the debounce fired, and the viewport
   * may have narrowed since — the trailing minimum has to hold on the frame it
   * is crossed, not at the next tick.
   *
   * Which leaves the MotionValue free to sit outside the bounds while the DOM
   * does not. That is one source of truth with a clamp on its way out, not two
   * disagreeing ones, and the argument is worth stating: every retarget aims at
   * an already-clamped value, and every resize event queues a retarget, so an
   * out-of-bounds value is transient and self-correcting within the debounce plus
   * the spring's flight. Since the width written is `min(value, bound)` — monotone
   * and continuous in the value — a binding clamp can only stall the divider,
   * never make it jump. Measured coming out of a clamped viewport: ordinary
   * spring steps, no discontinuity.
   */
  const writeLeadingPx = (leadingPx: number) => {
    const root = rootRef.current;
    if (!root) return;

    const nextLeadingPx = clampLeadingPx(leadingPx, viewportWidthRef.current);

    leadingPxRef.current = nextLeadingPx;
    root.style.setProperty('--split-leading-width', cssPx(nextLeadingPx));
    renderMetricsPanels();
  };

  const writeTargetLeadingPx = (targetLeadingPx: number) => {
    const root = rootRef.current;
    if (!root) return;

    targetLeadingPxRef.current = targetLeadingPx;
    root.style.setProperty('--split-target-x', cssPx(targetLeadingPx));
  };

  useMotionValueEvent(leadingPxValue, 'change', writeLeadingPx);

  const stopDividerSpring = () => {
    dividerSpringRef.current?.stop();
    dividerSpringRef.current = null;
  };

  const cancelWindowResizeDebounce = () => {
    if (windowResizeDebounceTimerRef.current != null) {
      clearTimeout(windowResizeDebounceTimerRef.current);
      windowResizeDebounceTimerRef.current = null;
    }
  };

  const retargetDivider = () => {
    windowResizeDebounceTimerRef.current = null;
    const root = rootRef.current;
    if (!root) return;

    viewportWidthRef.current = root.getBoundingClientRect().width;
    const targetLeadingPx = getPreferredLeadingPx(viewportWidthRef.current);

    retargetCountRef.current += 1;
    renderCounters();
    flashRetargetIndicator();
    writeTargetLeadingPx(targetLeadingPx);

    stopDividerSpring();
    dividerSpringRef.current = animate(leadingPxValue, targetLeadingPx, {
      ...DIVIDER_SPRING,
      onComplete: () => {
        dividerSpringRef.current = null;
        renderMetricsPanels();
      },
    });
  };

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    viewportWidthRef.current = root.getBoundingClientRect().width;
    preferredLeadingRatioRef.current = initialLeadingRatio;
    const preferredLeadingPx = getPreferredLeadingPx(viewportWidthRef.current);

    cancelWindowResizeDebounce();
    stopDividerSpring();
    writeTargetLeadingPx(preferredLeadingPx);
    leadingPxValue.jump(preferredLeadingPx);
    writeLeadingPx(preferredLeadingPx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLeadingRatio]);

  useEffect(() => {
    renderMetricsPanels();
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const handleResize = () => {
      viewportWidthRef.current = root.getBoundingClientRect().width;
      resizeEventCountRef.current += 1;
      renderCounters();

      // Nothing here moves the leading edge on purpose. Rewriting the width it
      // already holds is what keeps the trailing clamp honest while it waits, and
      // costs nothing when the clamp is not binding — the property is set to the
      // value it already has.
      writeLeadingPx(leadingPxRef.current);
      if (dragActiveRef.current) return;

      // Every event pushes the tick back, which is what makes the leading pane
      // hold for the whole gesture rather than for one interval of it.
      cancelWindowResizeDebounce();
      windowResizeDebounceTimerRef.current = setTimeout(retargetDivider, WINDOW_RESIZE_DEBOUNCE_MS);
      renderMetricsPanels();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (retargetFlashTimerRef.current != null) {
        clearTimeout(retargetFlashTimerRef.current);
      }

      if (retargetFlashCleanupTimerRef.current != null) {
        clearTimeout(retargetFlashCleanupTimerRef.current);
      }

      if (windowResizeDebounceTimerRef.current != null) {
        clearTimeout(windowResizeDebounceTimerRef.current);
      }
      dividerSpringRef.current?.stop();
    };
  }, []);

  const handleDividerPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;

    const pointerId = event.pointerId;
    const rootRect = root.getBoundingClientRect();
    const divider = event.currentTarget;

    // The drag is allowed to start even where the bounds have collapsed and it
    // cannot move anything. `cursor: col-resize` is a standing lie in that band,
    // and this demo keeps it: making the divider inert below a threshold is a
    // second visual state to explain, and the split is not the subject here.
    viewportWidthRef.current = rootRect.width;
    divider.setPointerCapture(pointerId);
    dragOffsetRef.current = event.clientX - rootRect.left - leadingPxRef.current;
    dragActiveRef.current = true;
    cancelWindowResizeDebounce();
    stopDividerSpring();
    event.preventDefault();
    renderMetricsPanels();

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;

      const viewportWidth = viewportWidthRef.current;
      const nextLeadingPx = clampLeadingPx(moveEvent.clientX - rootRect.left - dragOffsetRef.current, viewportWidth);

      // Recording the intent needs the divider to have somewhere else it could
      // be. Where the bounds have collapsed the drag moves nothing, and writing
      // the ratio anyway would let a gesture with no visible effect overwrite the
      // split for every wider viewport the layout will ever see — measured at
      // 500px wide, one drag took a stored 60% to 72% without the divider moving
      // a pixel, and it is not recoverable afterwards.
      //
      // Being pinned against one wall of a band that is still open is not this
      // case, and must keep writing: the divider is where the pointer left it, so
      // the wall is the intent.
      if (!isLeadingPinned(viewportWidth)) {
        preferredLeadingRatioRef.current = nextLeadingPx / viewportWidth;
      }

      // There is nowhere for the divider to be heading on this path: the pointer
      // is the target, so the ghost sits under the divider for the whole drag.
      writeTargetLeadingPx(nextLeadingPx);
      leadingPxValue.set(nextLeadingPx);
    };

    const handleUp = (upEvent: globalThis.PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;

      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      dragActiveRef.current = false;
      divider.releasePointerCapture(pointerId);
      // No commit, no settle, nothing deferred to here. The layout has been the
      // real one since the first pointer move, so releasing only stops writing.
      renderMetricsPanels();
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const rootStyle = {
    '--split-leading-width': '60%',
    '--split-target-x': '60%',
  } as CSSProperties;

  const leftPaneStyle = {
    left: cssPx(PANE_EDGE_GAP_PX),
    width: `max(0px, calc(var(--split-leading-width) - ${PANE_VISUAL_GAP_TOTAL_PX}px))`,
  } as CSSProperties;

  /**
   * Two edges, no width. This is what makes the trailing pane live for free: a
   * viewport change moves its right edge without anything having to be told, and
   * whatever the leading pane is not using is its.
   */
  const rightPaneStyle = {
    left: `calc(var(--split-leading-width) + ${PANE_DIVIDER_GAP_PX}px)`,
    right: cssPx(PANE_EDGE_GAP_PX),
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      data-buffered-split-layout-live-commit-demo
      style={rootStyle}
      className={`
        relative h-dvh min-h-[620px] w-full overflow-hidden bg-white font-mono text-[12px] text-slate-500
        dark:bg-neutral-950 dark:text-neutral-400
      `}
    >
      <span
        className={`
          pointer-events-none absolute top-2 right-3 z-40 flex items-center gap-2 bg-white px-1
          dark:bg-neutral-950
        `}
      >
        <span ref={counterTextRef} data-demo-resize-counter>
          resize 0 | retarget 0
        </span>
        <span
          ref={retargetIndicatorRef}
          data-demo-retarget-indicator
          className={`
            size-2 bg-slate-300
            dark:bg-neutral-700
          `}
        />
      </span>

      <section
        data-demo-left-pane
        style={leftPaneStyle}
        className={`
          absolute inset-y-4 z-10 outline-[1px] -outline-offset-1 outline-slate-300 contain-[layout]
          dark:outline-neutral-700
        `}
      >
        <span className={EDGE_LABEL_CLASS}>left-pane</span>
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
        data-demo-right-pane
        style={rightPaneStyle}
        className={`
          absolute inset-y-4 z-10 outline-[1px] -outline-offset-1 outline-slate-300 contain-[layout]
          dark:outline-neutral-700
        `}
      >
        <span className={EDGE_LABEL_CLASS}>right-pane</span>
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

      {/*
        Where the divider is heading. It sits under the divider on every path but
        the debounced one, and during a window resize the gap between the two is
        exactly the layout work the leading pane has not done yet.
      */}
      <div
        data-demo-divider-target
        aria-hidden
        className={`
          pointer-events-none absolute inset-y-6 left-(--split-target-x) z-20 w-0 -translate-x-1/2 border-l
          border-dashed border-slate-400
          dark:border-neutral-500
        `}
      />

      <div
        data-demo-divider
        // A draggable splitter, which is what role="separator" means once it
        // takes pointer input — WAI-ARIA's window-splitter pattern. prefer-tag-over-role
        // suggests <hr>, but that is a thematic break and cannot be dragged.
        // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the split"
        onPointerDown={handleDividerPointerDown}
        className={`
          absolute inset-y-6 left-(--split-leading-width) z-20 w-px -translate-x-1/2 cursor-col-resize bg-slate-500
          before:absolute before:-inset-x-3 before:inset-y-0 before:content-[""]
          dark:bg-neutral-500
        `}
      />
    </div>
  );
};
