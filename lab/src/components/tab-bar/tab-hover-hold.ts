export type TabBarHoldState = 'natural' | 'holding' | 'waiting';

const RELEASE_DELAY_MS = 500;

/** Leaving starts a fresh delay; returning cancels it rather than pausing it. */
export function createTabHoverHold(onStateChange: (state: TabBarHoldState) => void, onRelease: () => void) {
  let state: TabBarHoldState = 'natural';
  let timer: ReturnType<typeof setTimeout> | undefined;

  function clearTimer() {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  function transition(next: TabBarHoldState) {
    if (state === next) return;
    state = next;
    onStateChange(next);
  }

  function waitToRelease() {
    clearTimer();
    transition('waiting');
    timer = setTimeout(() => {
      timer = undefined;
      onRelease();
      transition('natural');
    }, RELEASE_DELAY_MS);
  }

  return {
    enter() {
      clearTimer();
      transition('holding');
    },
    leave() {
      waitToRelease();
    },
    shouldHoldWidths() {
      // Closing preserves an existing hover/leave hold, but never starts one.
      return state !== 'natural';
    },
    stop: clearTimer,
  };
}
