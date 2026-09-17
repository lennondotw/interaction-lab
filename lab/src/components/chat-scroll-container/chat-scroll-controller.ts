import { toSpringPhysics } from '@monorepo/utils';
import { animate, motionValue } from 'motion/react';

import type { ReadingAnchor } from './chat-insertions.js';
import { finalChatBottom } from './chat-layout.js';

export const chatScrollInterrupted = 'chat-scroll-interrupted';

export type ChatScrollMode = 'following' | 'animating' | 'detached';

export interface ChatScrollState {
  mode: ChatScrollMode;
  distance: number;
  nearBottom: boolean;
  threshold: number;
  scrollTop: number;
  target: number;
  velocity: number;
  reason: string;
}

interface Options {
  threshold: number;
  interruptOnPointerDown?: boolean;
  reducedMotion: boolean;
  animationSpeed: number;
  onStateChange?: (state: ChatScrollState) => void;
}

const spring = {
  type: 'spring',
  ...toSpringPhysics({ angularFrequency: 22, dampingRatio: 1 }),
  restDelta: 0.1,
  restSpeed: 1,
} as const;
const positionTolerance = 0.5;

/** Owns programmatic scrolling only; native input never has its default action cancelled. */
export function createChatScrollController(viewport: HTMLElement, content: HTMLElement, initialOptions: Options) {
  let options = initialOptions;
  let mode: ChatScrollMode = 'following';
  let reason = 'Initial position';
  let generation = 0;
  let reportFrame = 0;
  let anchorRemainder = 0;
  let previousHeight = viewport.scrollHeight;
  let previousViewportHeight = viewport.clientHeight;
  let animationTarget = 0;
  let animation: ReturnType<typeof animate> | undefined;
  let pointerHeld = false;
  const activeTouches = new Set<number>();
  let interactionMovedDown = false;
  const interactionHeld = () => pointerHeld || activeTouches.size > 0;
  let initialLayoutMeasured = false;
  let previousBottomPadding = Number.parseFloat(getComputedStyle(content).paddingBottom);
  const position = motionValue(viewport.scrollTop);
  const bottom = () => Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  const distance = () => Math.max(0, bottom() - viewport.scrollTop);

  function readScrollPosition() {
    return {
      top: viewport.scrollTop,
      bottom: bottom(),
      // Integer scrollHeight misses fractional clamps at non-default browser zoom.
      contentHeight: content.getBoundingClientRect().height,
      viewportHeight: viewport.getBoundingClientRect().height,
    };
  }
  let observedScroll = readScrollPosition();

  function observeScroll() {
    const previous = observedScroll;
    const current = readScrollPosition();
    const delta = current.top - previous.top;
    const rangeShrank =
      current.bottom < previous.bottom ||
      current.contentHeight < previous.contentHeight ||
      current.viewportHeight > previous.viewportHeight;
    // A browser clamp can precede either the layout callback or the scroll event.
    // Consume both through ONE position cursor, independently of the layout cache
    // below. Advancing previousHeight alone loses the evidence of a shrink before
    // its queued scroll arrives (e.g. typing replacement during a send flight).
    // Only movement to the new lower boundary is a clamp. A layout change does
    // not grant a blanket exemption to user scrolling elsewhere in the viewport.
    // scrollHeight/clientHeight are integers; the actual boundary can differ by
    // up to one CSS pixel. This is rounding tolerance, not the bottom-zone setting.
    const clamped = delta < 0 && rangeShrank && Math.abs(current.top - current.bottom) <= 1;
    observedScroll = current;
    if (!clamped && delta !== 0) {
      anchorRemainder = 0;
      if (interactionHeld()) interactionMovedDown = delta > 0;
      if (delta < 0) detach('User scrolled up');
      else if (delta > 0) resumeFollowing('User returned to bottom zone');
    }
    return Math.abs(previous.bottom - previous.top) <= positionTolerance;
  }

  function report() {
    if (!options.onStateChange || reportFrame) return;
    reportFrame = requestAnimationFrame(() => {
      reportFrame = 0;
      options.onStateChange?.({
        mode,
        distance: distance(),
        nearBottom: distance() <= options.threshold,
        threshold: options.threshold,
        scrollTop: viewport.scrollTop,
        target: finalChatBottom(viewport),
        velocity: mode === 'animating' ? position.getVelocity() : 0,
        reason,
      });
    });
  }

  function write(top: number) {
    viewport.scrollTop = Math.max(0, Math.min(bottom(), top));
    // Record the actual (possibly rounded/clamped) result immediately. A delayed
    // or coalesced scroll event then has zero delta; ownership never expires on a timer.
    observedScroll = readScrollPosition();
    report();
  }

  function detach(cause: string) {
    anchorRemainder = 0;
    mode = 'detached'; // Close the write gate before stopping/resetting MotionValue.
    generation++;
    position.jump(viewport.scrollTop);
    observedScroll = readScrollPosition();
    reason = cause;
    // Flight and scroll share interruption ownership, including real upward movement
    // after a non-blocking pointer press. Layout clamps never reach this branch.
    viewport.dispatchEvent(new Event(chatScrollInterrupted));
    report();
  }

  function resumeFollowing(cause: string) {
    if (mode !== 'detached' || interactionHeld() || distance() > options.threshold) return;
    mode = 'following';
    reason = cause;
    // Intent only: leave the remaining threshold pixels and native input alone.
    report();
  }

  function scrollToBottom(cause: string, { instant = false } = {}) {
    const target = instant ? bottom() : finalChatBottom(viewport);
    if (
      mode === 'animating' &&
      Math.abs(target - animationTarget) <= positionTolerance &&
      !options.reducedMotion &&
      !instant
    )
      return;
    // The generator runs in normal-speed time; MotionValue reports wall-clock velocity.
    const velocity = mode === 'animating' ? position.getVelocity() / options.animationSpeed : 0;
    const run = ++generation;
    position.stop();
    mode = 'following';
    position.jump(viewport.scrollTop);
    reason = cause;
    animationTarget = target;
    if (instant || options.reducedMotion || Math.abs(target - viewport.scrollTop) <= positionTolerance) {
      write(target);
      report();
      return;
    }
    mode = 'animating';
    report();
    animation = animate(position, target, {
      ...spring,
      velocity,
      onComplete: () => {
        if (generation !== run) return;
        write(bottom());
        mode = 'following';
        reason = 'Reached bottom';
        report();
      },
    });
    animation.speed = options.animationSpeed;
  }

  const unsubscribe = position.on('change', (top) => {
    if (mode === 'animating') write(top);
  });

  function contentChanged(
    localSend = false,
    {
      animatedLayout = false,
      composerResize = false,
      anchor,
    }: { animatedLayout?: boolean; composerResize?: boolean; anchor?: ReadingAnchor } = {}
  ) {
    // Wait for the complete initial layout, including composer clearance.
    if (!initialLayoutMeasured) return;
    // Reconcile before any early return or layout-cache update, even while a spring
    // is animating. Native clamps are observations, not new user intent or writes.
    const wasAtBottom = observeScroll();
    const bottomPadding = Number.parseFloat(getComputedStyle(content).paddingBottom);
    const paddingDelta = bottomPadding - previousBottomPadding;
    const clearanceChanged = composerResize || paddingDelta !== 0;
    // ResizeObserver can report a frame already applied by an insertion callback.
    // Do not turn that notification into a second scroll animation. A new natural
    // row (such as typing) is a separate change and must still animate into view.
    // Explicit layout ticks must run even when integer scrollHeight is unchanged:
    // fractional shrinkage can still clamp scrollTop and needs to be recorded
    // as layout-owned scrolling before the native scroll event arrives.
    if (
      !localSend &&
      !animatedLayout &&
      !anchor &&
      paddingDelta === 0 &&
      previousHeight === viewport.scrollHeight &&
      previousViewportHeight === viewport.clientHeight &&
      (mode !== 'animating' || Math.abs(finalChatBottom(viewport) - animationTarget) <= positionTolerance)
    ) {
      report();
      return;
    }
    previousBottomPadding = bottomPadding;
    previousHeight = viewport.scrollHeight;
    previousViewportHeight = viewport.clientHeight;
    if (!localSend && mode === 'detached' && anchor?.element.isConnected) {
      const requestedTop =
        viewport.scrollTop + anchor.element.getBoundingClientRect().top - anchor.top + anchorRemainder;
      write(requestedTop);
      // Native scrollTop may round fractional CSS pixels. Carry that fraction
      // into the next layout tick instead of accumulating visible reading drift.
      anchorRemainder = Math.max(-1, Math.min(1, requestedTop - viewport.scrollTop));
    }
    if (localSend || mode !== 'detached') {
      // Following tracks animated layout directly; ordinary composer resizing
      // requires a settled bottom. Active catch-up only receives a new target.
      if (clearanceChanged && !localSend && mode === 'following' && !wasAtBottom) {
        report();
        return;
      }
      scrollToBottom(localSend ? 'Local message sent' : clearanceChanged ? 'Composer resized' : 'Content resized', {
        // A layout tick after bottom-zone restoration must not restart catch-up
        // just because restoration left a few threshold pixels untouched.
        instant: mode === 'following' && (animatedLayout || (clearanceChanged && wasAtBottom)),
      });
    }
    report();
  }

  function onScroll() {
    observeScroll();
    report();
  }

  function onWheel(event: WheelEvent) {
    if (event.ctrlKey) return;
    if (event.deltaY < 0) detach('Upward wheel');
    else if (event.deltaY > 0) {
      // Yield before native scrolling runs: a still-active spring would overwrite
      // its movement on the next frame. Restoration only changes intent, not position.
      if (mode === 'animating') detach('Downward wheel interrupted catch-up');
      resumeFollowing('Downward wheel in bottom zone');
    }
  }

  function onPointerDown() {
    if (!interactionHeld()) interactionMovedDown = false;
    pointerHeld = true;
    if (options.interruptOnPointerDown) detach('Pointer interaction');
  }

  function finishInteraction() {
    if (interactionHeld()) return;
    if (interactionMovedDown) resumeFollowing('Interaction returned to bottom zone');
    interactionMovedDown = false;
  }

  function onPointerUp() {
    pointerHeld = false;
    finishInteraction();
  }

  function onTouchStart(event: TouchEvent) {
    if (!interactionHeld()) interactionMovedDown = false;
    // Native scrolling cancels the pointer while fingers can remain on screen.
    // Track viewport contacts independently until their own end/cancel events.
    for (const touch of event.changedTouches) activeTouches.add(touch.identifier);
  }

  function onTouchEnd(event: TouchEvent) {
    if (activeTouches.size === 0) return;
    for (const touch of event.changedTouches) activeTouches.delete(touch.identifier);
    finishInteraction();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
      detach('Keyboard scrolling');
    }
  }

  viewport.addEventListener('scroll', onScroll, { passive: true });
  viewport.addEventListener('wheel', onWheel, { passive: true });
  viewport.addEventListener('pointerdown', onPointerDown, { passive: true });
  viewport.addEventListener('touchstart', onTouchStart, { passive: true });
  viewport.addEventListener('keydown', onKeyDown);
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  window.addEventListener('pointercancel', onPointerUp, { passive: true });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('touchcancel', onTouchEnd, { passive: true });
  const observer = new ResizeObserver(() => {
    // The first delivery includes parent layout effects, such as measuring the composer.
    // Complete initial positioning before paint; only subsequent changes should animate.
    if (!initialLayoutMeasured) {
      previousHeight = viewport.scrollHeight;
      previousViewportHeight = viewport.clientHeight;
      previousBottomPadding = Number.parseFloat(getComputedStyle(content).paddingBottom);
      if (mode !== 'detached') write(bottom());
      initialLayoutMeasured = true;
    } else {
      contentChanged();
    }
  });
  // Observe both row/spacer geometry and legacy padding-based clearance.
  // Content-box observation alone would miss padding-only changes.
  observer.observe(content, { box: 'border-box' });
  observer.observe(viewport);

  return {
    contentChanged,
    updateOptions(next: Options) {
      const needsReport = options.threshold !== next.threshold || (!options.onStateChange && next.onStateChange);
      options = next;
      if (animation) animation.speed = options.animationSpeed;
      if (options.reducedMotion && mode === 'animating') scrollToBottom('Reduced motion');
      if (needsReport) report();
    },
    dispose() {
      mode = 'detached';
      generation++;
      position.destroy();
      unsubscribe();
      observer.disconnect();
      cancelAnimationFrame(reportFrame);
      viewport.removeEventListener('scroll', onScroll);
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('pointerdown', onPointerDown);
      viewport.removeEventListener('touchstart', onTouchStart);
      viewport.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    },
  };
}
