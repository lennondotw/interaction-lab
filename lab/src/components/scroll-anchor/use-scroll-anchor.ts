import { useReducedMotion } from 'motion/react';
import { useLayoutEffect, useRef, useState } from 'react';

import { createReadingAnchorTracker, type ReadingAnchor, type ReadingAnchorOptions } from './reading-anchor.js';
import {
  createScrollAnchorController,
  type LayoutChange,
  type ScrollAnchorController,
  type ScrollAnchorControllerOptions,
  type ScrollAnchorState,
} from './scroll-anchor-controller.js';

export interface ScrollAnchorOptions extends ReadingAnchorOptions {
  /** Bottom zone in pixels; default 2. */
  threshold?: number;
  /** Detach on mouse press. Touch contact interrupts active catch-up regardless; upward movement always detaches. */
  interruptOnMouseDown?: boolean;
  /** Playback rate for programmatic scrolling; default 1. */
  animationSpeed?: number;
  /** Reported on the next frame after each change, throttled to one report per frame. */
  onStateChange?: (state: ScrollAnchorState) => void;
  /** Override the projected final bottom; defaults to content height plus pending layout. */
  projectBottom?: () => number;
}

export interface HostLayoutChange extends Omit<LayoutChange, 'anchor'> {
  /**
   * The reading anchor from before this change. Omit to use the tracked snapshot;
   * pass `null` for a change that must not be compensated.
   */
  anchor?: ReadingAnchor | null;
}

export interface ScrollAnchorHandle {
  /** Animate to the projected bottom and follow afterwards. */
  scrollToBottom(): void;
  /** Call after the DOM has changed, in the same layout effect that committed it. */
  layoutChanged(change?: HostLayoutChange): void;
  /** Refresh the anchor snapshot ahead of a change the host applies outside React. */
  remember(): void;
  /** The current reading anchor, for instrumentation. */
  captureAnchor(): ReadingAnchor | undefined;
}

/**
 * Headless bottom-following and reading-anchor preservation for a scrolling list.
 * The host owns the markup and passes the mounted viewport and content elements
 * (typically from callback refs held in state); this hook owns programmatic
 * scrolling and intent, and is recreated when either element changes.
 * Layout changes the host does not report, such as reflow or loaded media, are
 * compensated from the tracked anchor. The viewport receives a
 * `data-scroll-anchor-mode` attribute for styling.
 */
export function useScrollAnchor(
  viewport: HTMLElement | null,
  content: HTMLElement | null,
  options: ScrollAnchorOptions = {}
): ScrollAnchorHandle {
  const {
    threshold = 2,
    interruptOnMouseDown = false,
    animationSpeed = 1,
    onStateChange,
    projectBottom,
    skipRow,
    readingElement,
  } = options;
  const reducedMotion = useReducedMotion() === true;
  const controllerRef = useRef<ScrollAnchorController | null>(null);
  const trackerRef = useRef<ReturnType<typeof createReadingAnchorTracker> | null>(null);
  const latest = useRef({ onStateChange, projectBottom, skipRow, readingElement });
  const hasProjectBottom = projectBottom !== undefined;
  // Declared before the effects below so that each of them reads current values.
  useLayoutEffect(() => {
    latest.current = { onStateChange, projectBottom, skipRow, readingElement };
  });

  const controllerOptions = useRef<() => ScrollAnchorControllerOptions>(null);
  useLayoutEffect(() => {
    controllerOptions.current = () => ({
      threshold: Math.max(0, threshold),
      interruptOnMouseDown,
      reducedMotion,
      animationSpeed: Math.max(0.01, animationSpeed),
      onStateChange: (state) => {
        viewport?.setAttribute('data-scroll-anchor-mode', state.mode);
        latest.current.onStateChange?.(state);
      },
      projectBottom: hasProjectBottom ? () => latest.current.projectBottom!() : undefined,
      readingAnchor: trackerRef.current ?? undefined,
    });
  });

  useLayoutEffect(() => {
    if (!viewport || !content) return;
    const tracker = createReadingAnchorTracker(viewport, content, {
      skipRow: (row) => latest.current.skipRow?.(row) ?? false,
      readingElement: (row) => latest.current.readingElement?.(row) ?? row,
    });
    trackerRef.current = tracker;
    const controller = createScrollAnchorController(viewport, content, controllerOptions.current!());
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      tracker.dispose();
      controllerRef.current = null;
      trackerRef.current = null;
    };
  }, [viewport, content]);

  useLayoutEffect(() => {
    controllerRef.current?.updateOptions(controllerOptions.current!());
  }, [threshold, interruptOnMouseDown, reducedMotion, animationSpeed, hasProjectBottom]);

  const [handle] = useState<ScrollAnchorHandle>(() => ({
    scrollToBottom: () => controllerRef.current?.scrollToBottom(),
    layoutChanged: ({ anchor, ...change }: HostLayoutChange = {}) => {
      const tracker = trackerRef.current;
      controllerRef.current?.layoutChanged({
        ...change,
        anchor: anchor === null ? undefined : (anchor ?? tracker?.fromSnapshot()),
      });
      tracker?.remember();
    },
    remember: () => trackerRef.current?.remember(),
    captureAnchor: () => trackerRef.current?.capture(),
  }));
  return handle;
}
