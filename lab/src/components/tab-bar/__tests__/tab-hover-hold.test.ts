import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTabHoverHold, type TabBarHoldState } from '../tab-hover-hold.js';

describe('tab hover hold', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('holds indefinitely over the strip and releases 500 ms after leaving', () => {
    const onState = vi.fn<(state: TabBarHoldState) => void>();
    const release = vi.fn<() => void>();
    const hold = createTabHoverHold(onState, release);
    hold.enter();
    expect(hold.shouldHoldWidths()).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(onState).toHaveBeenLastCalledWith('holding');
    expect(release).not.toHaveBeenCalled();
    hold.leave();
    expect(onState).toHaveBeenLastCalledWith('waiting');
    vi.advanceTimersByTime(499);
    expect(release).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(release).toHaveBeenCalledOnce();
    expect(onState).toHaveBeenLastCalledWith('natural');
  });

  it('cancels the pending release on return and starts a full new delay on the next leave', () => {
    const onState = vi.fn<(state: TabBarHoldState) => void>();
    const release = vi.fn<() => void>();
    const hold = createTabHoverHold(onState, release);
    hold.enter();
    hold.leave();
    vi.advanceTimersByTime(300);
    hold.enter();
    vi.advanceTimersByTime(1000);
    expect(release).not.toHaveBeenCalled();
    expect(onState).toHaveBeenLastCalledWith('holding');
    hold.leave();
    vi.advanceTimersByTime(499);
    expect(release).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(release).toHaveBeenCalledOnce();
  });

  it('does not start a hold or release timer for keyboard closes outside the hover region', () => {
    const onState = vi.fn<(state: TabBarHoldState) => void>();
    const release = vi.fn<() => void>();
    const hold = createTabHoverHold(onState, release);
    expect(hold.shouldHoldWidths()).toBe(false);
    vi.advanceTimersByTime(300);
    expect(hold.shouldHoldWidths()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(onState).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves the original leave deadline when closing during waiting', () => {
    const onState = vi.fn<(state: TabBarHoldState) => void>();
    const release = vi.fn<() => void>();
    const hold = createTabHoverHold(onState, release);
    hold.enter();
    hold.leave();
    vi.advanceTimersByTime(300);
    expect(hold.shouldHoldWidths()).toBe(true);
    expect(onState).toHaveBeenLastCalledWith('waiting');
    vi.advanceTimersByTime(199);
    expect(hold.shouldHoldWidths()).toBe(true);
    expect(release).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(release).toHaveBeenCalledOnce();
    expect(onState).toHaveBeenLastCalledWith('natural');
    expect(hold.shouldHoldWidths()).toBe(false);
  });

  it('does not re-arm waiting for a close after the leave hold has expired', () => {
    const onState = vi.fn<(state: TabBarHoldState) => void>();
    const release = vi.fn<() => void>();
    const hold = createTabHoverHold(onState, release);
    hold.enter();
    hold.leave();
    vi.advanceTimersByTime(500);
    onState.mockClear();
    expect(hold.shouldHoldWidths()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(onState).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up an armed release when the component unmounts', () => {
    const release = vi.fn<() => void>();
    const hold = createTabHoverHold(vi.fn(), release);
    hold.leave();
    hold.stop();
    vi.advanceTimersByTime(1000);
    expect(release).not.toHaveBeenCalled();
  });
});
