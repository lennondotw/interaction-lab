import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createHeldKeyboardShortcuts, type KeyboardShortcut } from '../keyboard-shortcuts.js';

type KeyEvent = Parameters<ReturnType<typeof createHeldKeyboardShortcuts>['keydown']>[0];

function keyEvent(key: string, options: Partial<KeyEvent> = {}): KeyEvent {
  return {
    key,
    code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
    shiftKey: true,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    repeat: false,
    isComposing: false,
    defaultPrevented: false,
    preventDefault: vi.fn<() => void>(),
    ...options,
  };
}

describe('held keyboard shortcuts', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('triggers immediately, repeats after the delay, and stops on physical key release', () => {
    const action = vi.fn<() => void>();
    const keyboard = createHeldKeyboardShortcuts([{ key: 'w', shift: true, repeat: true, onTrigger: action }]);
    keyboard.keydown(keyEvent('W'));
    expect(action).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(399);
    expect(action).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(action).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(80);
    expect(action).toHaveBeenCalledTimes(3);
    keyboard.keyup(keyEvent('w'));
    vi.advanceTimersByTime(1000);
    expect(action).toHaveBeenCalledTimes(3);
  });

  it('ignores native repeats without triggering or resetting the owned hold timer', () => {
    const action = vi.fn<() => void>();
    const keyboard = createHeldKeyboardShortcuts([{ key: 'w', shift: true, repeat: true, onTrigger: action }]);
    keyboard.keydown(keyEvent('w'));
    vi.advanceTimersByTime(200);
    const native = keyEvent('w', { repeat: true });
    keyboard.keydown(native);
    keyboard.keydown(native);
    expect(native.preventDefault).toHaveBeenCalledTimes(2);
    expect(action).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    expect(action).toHaveBeenCalledTimes(2);
    keyboard.stop();
  });

  it('does not start a timer from an OS repeat without the original keydown', () => {
    const action = vi.fn<() => void>();
    const keyboard = createHeldKeyboardShortcuts([{ key: 'w', shift: true, repeat: true, onTrigger: action }]);
    keyboard.keydown(keyEvent('w', { repeat: true }));
    vi.advanceTimersByTime(2000);
    expect(action).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('adds once per press for Shift+T even while native repeats arrive', () => {
    const add = vi.fn<() => void>();
    const keyboard = createHeldKeyboardShortcuts([{ key: 't', shift: true, onTrigger: add }]);
    keyboard.keydown(keyEvent('T'));
    keyboard.keydown(keyEvent('T', { repeat: true }));
    vi.advanceTimersByTime(2000);
    expect(add).toHaveBeenCalledTimes(1);
    keyboard.keyup(keyEvent('t'));
    keyboard.keydown(keyEvent('T'));
    expect(add).toHaveBeenCalledTimes(2);
    keyboard.stop();
  });

  it('repeats with fresh callbacks across successive tab closes without restarting the delay', () => {
    const closed: number[] = [];
    const keyboard = createHeldKeyboardShortcuts([]);
    const bindings = (active: number): KeyboardShortcut[] => [
      {
        key: 'w',
        shift: true,
        repeat: true,
        onTrigger: () => {
          closed.push(active);
          keyboard.update(active === 1 ? [] : bindings(active - 1));
        },
      },
    ];
    keyboard.update(bindings(4));
    keyboard.keydown(keyEvent('W'));
    expect(closed).toEqual([4]);
    vi.advanceTimersByTime(400);
    expect(closed).toEqual([4, 3]);
    vi.advanceTimersByTime(160);
    expect(closed).toEqual([4, 3, 2, 1]);
    vi.advanceTimersByTime(1000);
    expect(closed).toEqual([4, 3, 2, 1]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops when Shift is released before the shortcut key', () => {
    const action = vi.fn<() => void>();
    const keyboard = createHeldKeyboardShortcuts([{ key: 'w', shift: true, repeat: true, onTrigger: action }]);
    keyboard.keydown(keyEvent('w'));
    vi.advanceTimersByTime(400);
    keyboard.keyup(keyEvent('Shift', { code: 'ShiftLeft', shiftKey: false }));
    vi.advanceTimersByTime(1000);
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('stops the old chord when another modifier is pressed', () => {
    const action = vi.fn<() => void>();
    const keyboard = createHeldKeyboardShortcuts([{ key: 'w', shift: true, repeat: true, onTrigger: action }]);
    keyboard.keydown(keyEvent('w'));
    keyboard.keydown(keyEvent('Alt', { code: 'AltLeft', altKey: true }));
    vi.advanceTimersByTime(1000);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('does not intercept unmatched modifiers or events already consumed by another owner', () => {
    const action = vi.fn<() => void>();
    const keyboard = createHeldKeyboardShortcuts([{ key: 'w', shift: true, repeat: true, onTrigger: action }]);
    const events = [
      keyEvent('w', { shiftKey: false }),
      keyEvent('w', { altKey: true }),
      keyEvent('w', { ctrlKey: true }),
      keyEvent('w', { metaKey: true }),
      keyEvent('w', { defaultPrevented: true }),
      keyEvent('w', { isComposing: true }),
    ];
    events.forEach((event) => keyboard.keydown(event));
    vi.advanceTimersByTime(1000);
    expect(action).not.toHaveBeenCalled();
    events.forEach((event) => expect(event.preventDefault).not.toHaveBeenCalled());
  });

  it('stops repeating if composition starts during a hold', () => {
    const action = vi.fn<() => void>();
    const keyboard = createHeldKeyboardShortcuts([{ key: 'w', shift: true, repeat: true, onTrigger: action }]);
    keyboard.keydown(keyEvent('w'));
    keyboard.keydown(keyEvent('Process', { isComposing: true }));
    vi.advanceTimersByTime(1000);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it.each(['ArrowLeft', 'ArrowRight'])('supports a configurable hold cadence for %s', (key) => {
    const switchTab = vi.fn<() => void>();
    const keyboard = createHeldKeyboardShortcuts(
      [{ key, shift: true, alt: true, repeat: true, onTrigger: switchTab }],
      { delayMs: 100, intervalMs: 20 }
    );
    keyboard.keydown(keyEvent(key, { altKey: true }));
    vi.advanceTimersByTime(140);
    expect(switchTab).toHaveBeenCalledTimes(4);
    keyboard.stop();
  });

  it('cancels pending and ongoing timers on blur or unmount', () => {
    const action = vi.fn<() => void>();
    const keyboard = createHeldKeyboardShortcuts([{ key: 'w', shift: true, repeat: true, onTrigger: action }]);
    keyboard.keydown(keyEvent('w'));
    keyboard.stop();
    vi.advanceTimersByTime(1000);
    expect(action).toHaveBeenCalledTimes(1);
    keyboard.keydown(keyEvent('w'));
    vi.advanceTimersByTime(400);
    keyboard.stop();
    vi.advanceTimersByTime(1000);
    expect(action).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });
});
