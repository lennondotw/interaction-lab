import { toSpringPhysics } from '@monorepo/utils';
import { animate, motionValue } from 'motion/react';

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
  reducedMotion: boolean;
  animationSpeed: number;
  onStateChange?: (state: ChatScrollState) => void;
}

const spring = {
  type: 'spring',
  ...toSpringPhysics({ angularFrequency: 28, dampingRatio: 1 }),
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
  let previousTop = viewport.scrollTop;
  let writtenTop: number | undefined;
  let previousHeight = viewport.scrollHeight;
  let previousViewportHeight = viewport.clientHeight;
  let animationTarget = 0;
  let animation: ReturnType<typeof animate> | undefined;
  let pointerHeld = false;
  let pointerMovedDown = false;
  let initialLayoutMeasured = false;
  let previousBottomPadding = Number.parseFloat(getComputedStyle(content).paddingBottom);
  const position = motionValue(viewport.scrollTop);
  const bottom = () => Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  const distance = () => Math.max(0, bottom() - viewport.scrollTop);

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
        target: bottom(),
        velocity: mode === 'animating' ? position.getVelocity() : 0,
        reason,
      });
    });
  }

  function write(top: number) {
    viewport.scrollTop = Math.max(0, Math.min(bottom(), top));
    writtenTop = viewport.scrollTop;
    previousTop = viewport.scrollTop;
    report();
  }

  function detach(cause: string) {
    mode = 'detached'; // Close the write gate before stopping/resetting MotionValue.
    generation++;
    position.jump(viewport.scrollTop);
    previousTop = viewport.scrollTop;
    reason = cause;
    report();
  }

  function scrollToBottom(cause: string, { instant = false } = {}) {
    const target = bottom();
    if (mode === 'animating' && target === animationTarget && !options.reducedMotion && !instant) return;
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

  function contentChanged(localSend = false) {
    // Wait for the complete initial layout, including composer clearance.
    if (!initialLayoutMeasured) return;
    const bottomPadding = Number.parseFloat(getComputedStyle(content).paddingBottom);
    const paddingDelta = bottomPadding - previousBottomPadding;
    // Shrinking clearance can clamp scrollTop before ResizeObserver runs. Compare
    // the previously recorded geometry, not that already-clamped DOM position.
    const wasAtBottom =
      Math.abs(Math.max(0, previousHeight - previousViewportHeight) - previousTop) <= positionTolerance;
    previousBottomPadding = bottomPadding;
    previousHeight = viewport.scrollHeight;
    previousViewportHeight = viewport.clientHeight;
    if (localSend || mode !== 'detached') {
      // Only a settled bottom position follows composer resizing immediately.
      // An active message spring simply receives the new target, without a position jump.
      if (paddingDelta !== 0 && !localSend && mode === 'following' && !wasAtBottom) {
        report();
        return;
      }
      scrollToBottom(localSend ? 'Local message sent' : paddingDelta !== 0 ? 'Composer resized' : 'Content resized', {
        instant: paddingDelta !== 0 && mode === 'following' && wasAtBottom && !localSend,
      });
    }
    report();
  }

  function onScroll() {
    const top = viewport.scrollTop;
    const delta = top - previousTop;
    const layoutChanged = previousHeight !== viewport.scrollHeight || previousViewportHeight !== viewport.clientHeight;
    previousTop = top;
    previousHeight = viewport.scrollHeight;
    previousViewportHeight = viewport.clientHeight;
    const ownScroll = writtenTop !== undefined && Math.abs(top - writtenTop) <= positionTolerance;
    writtenTop = undefined;
    if (!ownScroll && !layoutChanged) {
      if (pointerHeld && delta !== 0) pointerMovedDown = delta > 0;
      if (delta < 0) detach('User scrolled up');
      else if (delta > 0 && mode === 'detached' && !pointerHeld && distance() <= options.threshold) {
        mode = 'following';
        reason = 'User returned to bottom zone';
        // Restore eligibility without pulling the remaining threshold pixels into place.
      }
    }
    report();
  }

  function onWheel(event: WheelEvent) {
    if (!event.ctrlKey && event.deltaY < 0) detach('Upward wheel');
  }

  function onPointerDown() {
    pointerHeld = true;
    pointerMovedDown = false;
    detach('Pointer interaction');
  }

  function onPointerUp() {
    pointerHeld = false;
    if (pointerMovedDown && distance() <= options.threshold) {
      mode = 'following';
      reason = 'User returned to bottom zone';
      report();
    }
    pointerMovedDown = false;
  }

  function onKeyDown(event: KeyboardEvent) {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
      detach('Keyboard scrolling');
    }
  }

  viewport.addEventListener('scroll', onScroll, { passive: true });
  viewport.addEventListener('wheel', onWheel, { passive: true });
  viewport.addEventListener('pointerdown', onPointerDown, { passive: true });
  viewport.addEventListener('keydown', onKeyDown);
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  window.addEventListener('pointercancel', onPointerUp, { passive: true });
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
  // Composer clearance is padding: content-box observation misses those changes.
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
      viewport.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    },
  };
}
