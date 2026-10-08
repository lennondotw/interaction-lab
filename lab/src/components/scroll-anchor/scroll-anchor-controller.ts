import { toSpringPhysics } from '@monorepo/utils';
import { JSAnimation, motionValue } from 'motion/react';

import { finalScrollBottom } from './pending-layout.js';
import type { ReadingAnchor, ReadingAnchorSource } from './reading-anchor.js';

/** Dispatched on the viewport when user input takes scrolling away from the controller. */
export const scrollAnchorInterrupted = 'scroll-anchor-interrupted';

export type ScrollAnchorMode = 'following' | 'animating' | 'detached';

export interface ScrollAnchorState {
  mode: ScrollAnchorMode;
  /** Bottom intent, including catch-up; false during keyboard reading animation. */
  following: boolean;
  /** Pixels between the current position and the current bottom. */
  distance: number;
  nearBottom: boolean;
  threshold: number;
  scrollTop: number;
  /** Active spring destination, or the projected final bottom while idle. */
  target: number;
  velocity: number;
  /** The last controller cause, for debugging. */
  reason: string;
}

export interface ScrollAnchorControllerOptions {
  /** Bottom zone in pixels. Being inside it is eligibility, not automatic reattachment. */
  threshold: number;
  /** Detach on mouse press. Touch contact interrupts active catch-up regardless; upward movement always detaches. */
  interruptOnMouseDown?: boolean;
  reducedMotion: boolean;
  /** Playback rate for programmatic scrolling. Native gestures are never slowed. */
  animationSpeed: number;
  onStateChange?: (state: ScrollAnchorState) => void;
  /** Override the projected final bottom; defaults to content height plus pending layout. */
  projectBottom?: () => number;
  /**
   * Compensate layout changes the host did not report, such as reflow or loaded media,
   * the same way as a reported change. Hosts that report every change omit it.
   */
  readingAnchor?: ReadingAnchorSource;
}

export interface LayoutChange {
  /** Request bottom catch-up regardless of current intent, as for the viewer's own new content. */
  follow?: boolean;
  /** One tick of an animated layout sequence; reconciled even when integer geometry looks unchanged. */
  animated?: boolean;
  /** Trailing clearance changed, e.g. a composer grew; reconciled even when content height is unchanged. */
  clearance?: boolean;
  /** Where a detached reader was before this change, so the change can be compensated. */
  anchor?: ReadingAnchor;
}

const spring = {
  type: 'spring',
  ...toSpringPhysics({ angularFrequency: 15, dampingRatio: 1 }),
  restDelta: 0.1,
  restSpeed: 1,
} as const;
const positionTolerance = 0.5;
// Match the measured browser arrow increment; page steps retain one increment
// of overlap so the last visible line remains readable after paging.
const keyboardStep = 40;
type ScrollDestination = { kind: 'bottom'; source: 'command' | 'keyboard' } | { kind: 'position'; top: number };

/**
 * Owns programmatic and keyboard scrolling. Pointer/wheel input stays native.
 * Following is explicit intent, not a boolean recomputed from
 * proximity on every scroll event.
 */
export function createScrollAnchorController(
  viewport: HTMLElement,
  content: HTMLElement,
  initialOptions: ScrollAnchorControllerOptions
) {
  let options = initialOptions;
  let mode: ScrollAnchorMode = 'following';
  let reason = 'Initial position';
  let generation = 0;
  let reportFrame = 0;
  let anchorRemainder = 0;
  let previousHeight = viewport.scrollHeight;
  let previousViewportHeight = viewport.clientHeight;
  let animationTarget = 0;
  let destination: ScrollDestination = { kind: 'bottom', source: 'command' };
  let animation: JSAnimation<number> | undefined;
  let pointerHeld = false;
  // A touch move can leave native inertia running after contact ends. scrollend
  // clears this eligibility, but is never used to decide follow intent.
  let nativeTouchScroll = false;
  // A native scroll notification cannot identify which gesture produced it.
  // After explicit takeover, only NEW input can reclaim an active catch-up.
  let ownsNativeTail = false;
  let takeover: { frame: number; restore: () => void } | undefined;
  const activeTouches = new Set<number>();
  let interactionMovedDown = false;
  const interactionHeld = () => pointerHeld || activeTouches.size > 0;
  let initialLayoutMeasured = false;
  let previousBottomPadding = Number.parseFloat(getComputedStyle(content).paddingBottom);
  const position = motionValue(viewport.scrollTop);
  const bottom = () => Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  const distance = () => Math.max(0, bottom() - viewport.scrollTop);
  const projectedBottom = () => options.projectBottom?.() ?? finalScrollBottom(viewport, content);
  const destinationTop = (instant = false) =>
    destination.kind === 'bottom'
      ? instant
        ? bottom()
        : projectedBottom()
      : Math.max(0, Math.min(projectedBottom(), destination.top));

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
    // its queued scroll arrives.
    // Only movement to the new lower boundary is a clamp. A layout change does
    // not grant a blanket exemption to user scrolling elsewhere in the viewport.
    // scrollHeight/clientHeight are integers; the actual boundary can differ by
    // up to one CSS pixel. This is rounding tolerance, not the bottom-zone setting.
    const clamped = delta < 0 && rangeShrank && Math.abs(current.top - current.bottom) <= 1;
    // Safari exposes bottom overscroll in scrollTop. Returning within that outer
    // region is bounce, not movement into history. Keep raw downward movement for
    // contact/restoration intent, but never detach solely for this rebound.
    const bottomRebound = delta < 0 && previous.top >= previous.bottom && current.top >= current.bottom;
    observedScroll = current;
    // After takeover, notifications cannot reclaim ownership without new input.
    // Reduced motion may finish before the compositor delivers its final delta;
    // keep following geometry pinned until native scrolling reports completion.
    if (ownsNativeTail) {
      if (!takeover && mode === 'following' && current.top !== current.bottom) write(current.bottom);
      return;
    }
    if (!takeover && !clamped && !bottomRebound && delta !== 0) {
      anchorRemainder = 0;
      if (interactionHeld()) interactionMovedDown = delta > 0;
      if (delta < 0) detach('User scrolled up');
      else if (delta > 0) resumeFollowing('User returned to bottom zone');
    }
  }

  function report() {
    if (!options.onStateChange || reportFrame) return;
    reportFrame = requestAnimationFrame(() => {
      reportFrame = 0;
      options.onStateChange?.({
        mode,
        following: mode !== 'detached' && destination.kind === 'bottom',
        distance: distance(),
        nearBottom: distance() <= options.threshold,
        threshold: options.threshold,
        scrollTop: viewport.scrollTop,
        target: mode === 'animating' ? animationTarget : projectedBottom(),
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
    cancelTakeover();
    ownsNativeTail = false;
    mode = 'detached'; // Close the write gate before stopping/resetting MotionValue.
    generation++;
    position.jump(viewport.scrollTop);
    observedScroll = readScrollPosition();
    reason = cause;
    // Dependent visuals share interruption ownership, including real upward movement
    // after a non-blocking pointer press. Layout clamps never reach this branch.
    viewport.dispatchEvent(new Event(scrollAnchorInterrupted));
    report();
  }

  function resumeFollowing(cause: string) {
    if (mode !== 'detached' || interactionHeld() || distance() > options.threshold) return;
    mode = 'following';
    destination = { kind: 'bottom', source: 'command' };
    reason = cause;
    // Intent only: leave the remaining threshold pixels and native input alone.
    report();
  }

  function cancelTakeover() {
    if (!takeover) return;
    const pending = takeover;
    takeover = undefined;
    cancelAnimationFrame(pending.frame);
    pending.restore();
  }

  /** Explicit commands own a new position baseline; layout retargets do not. */
  function requestBottom(cause: string, instant = false) {
    requestScroll(cause, { kind: 'bottom', source: 'command' }, instant);
  }

  function requestScroll(cause: string, next: ScrollDestination, instant = false) {
    destination = next;
    if (takeover) {
      cancelTakeover();
      // No spring exists yet; an equivalent old target cannot skip this command.
      mode = 'following';
    }
    const current = readScrollPosition();
    const target = destinationTop(instant);
    // A satisfied command grants follow intent without changing native geometry.
    // Clamp positive overscroll: bounce cannot satisfy an unexpanded future target.
    if (Math.abs(target - Math.min(current.top, current.bottom)) <= positionTolerance) {
      generation++;
      mode = destination.kind === 'bottom' ? 'following' : 'detached';
      position.jump(current.top);
      observedScroll = current;
      animationTarget = target;
      ownsNativeTail = false;
      reason = cause;
      report();
      return;
    }
    if (!nativeTouchScroll || activeTouches.size > 0) {
      observedScroll = readScrollPosition();
      startScroll(cause, { instant });
      return;
    }

    // A position write alone does not stop native touch inertia. Briefly remove
    // the scrollable overflow before starting our spring. Two rAFs worked in both
    // Chromium and iOS probes; one worked only on iOS. This is a browser workaround,
    // not a compositor acknowledgment. See docs/inertia-ios-experiments.md.
    generation++;
    ownsNativeTail = true;
    mode = 'following'; // Close the spring write gate before resetting its value.
    position.jump(viewport.scrollTop);
    mode = 'animating';
    animationTarget = target;
    reason = cause;
    const overflow = viewport.style.getPropertyValue('overflow-y');
    const priority = viewport.style.getPropertyPriority('overflow-y');
    const pending = {
      frame: 0,
      restore: () => {
        if (overflow) viewport.style.setProperty('overflow-y', overflow, priority);
        else viewport.style.removeProperty('overflow-y');
      },
    };
    takeover = pending;
    viewport.style.setProperty('overflow-y', 'hidden', 'important');
    // Commit the hidden state now; otherwise hide/restore can be coalesced.
    observedScroll = readScrollPosition();
    report();
    pending.frame = requestAnimationFrame(() => {
      if (takeover !== pending) return;
      pending.frame = requestAnimationFrame(() => {
        if (takeover !== pending) return;
        cancelTakeover();
        nativeTouchScroll = false;
        // Consume the actual position BEFORE establishing the new animation.
        // A queued pre-command scroll must not look like a fresh upward gesture.
        observedScroll = readScrollPosition();
        mode = 'following'; // Do not reuse the previous target/velocity for this new owner.
        startScroll(cause, { instant });
      });
    });
  }

  function startScroll(cause: string, { instant = false, from }: { instant?: boolean; from?: number } = {}) {
    const target = destinationTop(instant);
    if (
      mode === 'animating' &&
      Math.abs(target - animationTarget) <= positionTolerance &&
      !options.reducedMotion &&
      !instant
    )
      return;
    // Generator velocity stays in normal-speed units, including repeated keys
    // within one frame and playback rates other than 1.
    const active = mode === 'animating';
    const velocity = active ? (position.animation as JSAnimation<number>).getGeneratorVelocity() : 0;
    const start = from ?? (active ? position.get() : viewport.scrollTop);
    const run = ++generation;
    position.stop();
    mode = destination.kind === 'bottom' ? 'following' : 'detached';
    position.jump(start);
    animationTarget = target;
    if (instant || options.reducedMotion || Math.abs(target - viewport.scrollTop) <= positionTolerance) {
      reason = cause;
      write(target);
      report();
      return;
    }
    mode = 'animating';
    reason = cause;
    report();
    void position.start((complete) => {
      const owned = new JSAnimation({
        ...spring,
        keyframes: [start, target],
        velocity,
        onUpdate: (top) => position.set(top),
        onComplete: () => {
          if (generation !== run) return;
          write(destination.kind === 'bottom' ? bottom() : destinationTop());
          mode = destination.kind === 'bottom' ? 'following' : 'detached';
          const cause = destination.kind === 'bottom' ? 'Reached bottom' : 'Reached keyboard target';
          reason = cause;
          report();
          // Completion can coincide with a new command in the same frame.
          // Only the current owner may clear the MotionValue's animation.
          queueMicrotask(() => {
            if (position.animation === owned) complete();
          });
        },
      });
      animation = owned;
      owned.speed = options.animationSpeed;
      return owned;
    });
  }

  const unsubscribe = position.on('change', (top) => {
    if (mode === 'animating') write(top);
  });

  /** Reconcile with the DOM after a layout change. Call after the change has been applied. */
  function layoutChanged({ follow = false, animated = false, clearance = false, anchor }: LayoutChange = {}) {
    // Wait for the complete initial layout, including any trailing clearance.
    if (!initialLayoutMeasured) return;
    // Reconcile before any early return or layout-cache update, even while a spring
    // is animating. Native clamps are observations, not new user intent or writes.
    observeScroll();
    const bottomPadding = Number.parseFloat(getComputedStyle(content).paddingBottom);
    const paddingDelta = bottomPadding - previousBottomPadding;
    const clearanceChanged = clearance || paddingDelta !== 0;
    // ResizeObserver can report a frame already applied by a layout callback.
    // Do not process that notification as a second layout change.
    // Explicit layout ticks must run even when integer scrollHeight is unchanged:
    // fractional shrinkage can still clamp scrollTop and needs to be recorded
    // as layout-owned scrolling before the native scroll event arrives.
    if (
      !follow &&
      !animated &&
      !anchor &&
      paddingDelta === 0 &&
      previousHeight === viewport.scrollHeight &&
      previousViewportHeight === viewport.clientHeight &&
      (mode !== 'animating' || Math.abs(destinationTop() - animationTarget) <= positionTolerance)
    ) {
      report();
      return;
    }
    previousBottomPadding = bottomPadding;
    previousHeight = viewport.scrollHeight;
    previousViewportHeight = viewport.clientHeight;
    const keyboardAnimating = mode === 'animating' && destination.kind === 'position';
    if (!follow && (mode === 'detached' || keyboardAnimating) && anchor?.element.isConnected) {
      const currentBottom = anchor.element.getBoundingClientRect().bottom - viewport.getBoundingClientRect().top;
      const requestedTop = viewport.scrollTop + currentBottom - anchor.bottom + anchorRemainder;
      const delta = requestedTop - viewport.scrollTop;
      write(requestedTop);
      if (keyboardAnimating && destination.kind === 'position') {
        destination.top += delta;
        if (takeover) animationTarget = destinationTop();
        else startScroll('Keyboard reading anchor moved', { from: position.get() + delta });
      }
      // Native scrollTop may round fractional CSS pixels. Carry that fraction
      // into the next layout tick instead of accumulating visible reading drift.
      anchorRemainder = Math.max(-1, Math.min(1, requestedTop - viewport.scrollTop));
    }
    if (follow) {
      requestBottom('Followed new content', mode === 'following');
    } else if (!takeover && keyboardAnimating) {
      startScroll('Keyboard content resized');
    } else if (!takeover && mode !== 'detached') {
      startScroll(clearanceChanged ? 'Clearance resized' : 'Content resized', {
        // Follow intent owns the current bottom across ALL layout changes, including
        // natural reflow. No resize-cause inference or second spring is needed.
        // Reconcile user movement above first; detached readers keep their anchor,
        // while existing catch-up retains its velocity and projected final target.
        instant: mode === 'following',
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
    if (event.deltaY !== 0) ownsNativeTail = false;
    if (event.deltaY < 0) detach('Upward wheel');
    else if (event.deltaY > 0) {
      // Yield before native scrolling runs: a still-active spring would overwrite
      // its movement on the next frame. Restoration only changes intent, not position.
      if (mode === 'animating') detach('Downward wheel interrupted catch-up');
      resumeFollowing('Downward wheel in bottom zone');
    }
  }

  function onPointerDown(event: PointerEvent) {
    ownsNativeTail = false;
    if (!interactionHeld()) interactionMovedDown = false;
    pointerHeld = true;
    if (event.pointerType === 'touch' && mode === 'animating') detach('Touch interrupted catch-up');
    else if (event.pointerType === 'mouse' && options.interruptOnMouseDown) detach('Mouse interaction');
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
    ownsNativeTail = false;
    // Fallback for touch-only browsers; pointerdown may already have detached.
    if (mode === 'animating') detach('Touch interrupted catch-up');
    if (!interactionHeld()) interactionMovedDown = false;
    // Native scrolling cancels the pointer while fingers can remain on screen.
    // Track viewport contacts independently until their own end/cancel events.
    for (const touch of event.changedTouches) activeTouches.add(touch.identifier);
  }

  function onTouchMove() {
    if (activeTouches.size > 0) nativeTouchScroll = true;
  }

  function onScrollEnd() {
    if (activeTouches.size === 0) {
      nativeTouchScroll = false;
      if (mode === 'following' && distance() <= 1) ownsNativeTail = false;
    }
  }

  function onTouchEnd(event: TouchEvent) {
    if (activeTouches.size === 0) return;
    for (const touch of event.changedTouches) activeTouches.delete(touch.identifier);
    finishInteraction();
  }

  function onKeyDown(event: KeyboardEvent) {
    // Descendants own editing, activation, and nested scrolling. Only the
    // focused viewport owns keyboard scroll commands.
    if (event.target !== viewport || event.defaultPrevented || event.isComposing) return;
    if (event.ctrlKey || (event.metaKey && event.altKey)) return;
    const keyboardDestination = destination.kind === 'position' || destination.source === 'keyboard';
    const base = mode === 'animating' && keyboardDestination ? animationTarget : viewport.scrollTop;
    const page = Math.max(keyboardStep, viewport.clientHeight - keyboardStep);
    let target: number;
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowDown': {
        const direction = event.key === 'ArrowUp' ? -1 : 1;
        target = event.metaKey
          ? direction < 0
            ? 0
            : projectedBottom()
          : base + direction * (event.altKey ? page : keyboardStep);
        break;
      }
      case 'PageUp':
      case 'PageDown':
        if (event.metaKey || event.altKey) return;
        target = base + (event.key === 'PageUp' ? -page : page);
        break;
      case ' ':
        if (event.metaKey || event.altKey) return;
        target = base + (event.shiftKey ? -page : page);
        break;
      case 'Home':
      case 'End':
        if (event.metaKey || event.altKey) return;
        target = event.key === 'Home' ? 0 : projectedBottom();
        break;
      default:
        return;
    }
    event.preventDefault();
    // Storybook's outer manager also handles Option+Arrow. The focused scroll
    // region owns this command; neither a native scroll nor the manager should run.
    event.stopPropagation();
    ownsNativeTail = false;
    target = Math.max(0, Math.min(projectedBottom(), target));
    const next: ScrollDestination =
      target === projectedBottom() ? { kind: 'bottom', source: 'keyboard' } : { kind: 'position', top: target };
    if (mode !== 'following' || next.kind !== 'bottom') {
      viewport.dispatchEvent(new Event(scrollAnchorInterrupted));
    }
    anchorRemainder = 0;
    const key = [
      event.metaKey && 'Meta',
      event.altKey && 'Option',
      event.shiftKey && 'Shift',
      event.key === ' ' ? 'Space' : event.key,
    ]
      .filter(Boolean)
      .join('+');
    requestScroll(`Keyboard ${key}`, next);
  }

  viewport.addEventListener('scroll', onScroll, { passive: true });
  viewport.addEventListener('wheel', onWheel, { passive: true });
  viewport.addEventListener('pointerdown', onPointerDown, { passive: true });
  viewport.addEventListener('touchstart', onTouchStart, { passive: true });
  viewport.addEventListener('touchmove', onTouchMove, { passive: true });
  viewport.addEventListener('scrollend', onScrollEnd, { passive: true });
  viewport.addEventListener('keydown', onKeyDown);
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  window.addEventListener('pointercancel', onPointerUp, { passive: true });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('touchcancel', onTouchEnd, { passive: true });
  const observer = new ResizeObserver(() => {
    // The first delivery includes parent layout effects, such as measuring clearance.
    // Complete initial positioning before paint; only subsequent changes should animate.
    if (!initialLayoutMeasured) {
      previousHeight = viewport.scrollHeight;
      previousViewportHeight = viewport.clientHeight;
      previousBottomPadding = Number.parseFloat(getComputedStyle(content).paddingBottom);
      if (mode !== 'detached') write(bottom());
      initialLayoutMeasured = true;
    } else {
      const source = options.readingAnchor;
      layoutChanged({
        anchor:
          source && (mode === 'detached' || (mode === 'animating' && destination.kind === 'position'))
            ? source.fromSnapshot()
            : undefined,
      });
      source?.remember();
    }
  });
  // Observe both row geometry and padding-based clearance.
  // Content-box observation alone would miss padding-only changes.
  observer.observe(content, { box: 'border-box' });
  observer.observe(viewport);

  return {
    layoutChanged,
    /** Animate to the projected bottom and follow afterwards, under the same interruption rules. */
    scrollToBottom() {
      anchorRemainder = 0;
      requestBottom('Scroll to bottom');
    },
    updateOptions(next: ScrollAnchorControllerOptions) {
      const needsReport = options.threshold !== next.threshold || (!options.onStateChange && next.onStateChange);
      options = next;
      if (animation) animation.speed = options.animationSpeed;
      if (options.reducedMotion && mode === 'animating' && !takeover) startScroll('Reduced motion');
      if (needsReport) report();
    },
    dispose() {
      cancelTakeover();
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
      viewport.removeEventListener('touchmove', onTouchMove);
      viewport.removeEventListener('scrollend', onScrollEnd);
      viewport.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    },
  };
}

export type ScrollAnchorController = ReturnType<typeof createScrollAnchorController>;
