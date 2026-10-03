export interface KeyboardShortcut {
  key: string;
  shift?: boolean;
  alt?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  /** Repeat with the helper's timer. Defaults to one trigger per key press. */
  repeat?: boolean;
  onTrigger: () => void;
}

type KeyChord = Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey'>;

interface HeldShortcut {
  chord: KeyChord;
  timer?: ReturnType<typeof setTimeout>;
}

type ShortcutKeyEvent = Pick<
  KeyboardEvent,
  | 'key'
  | 'code'
  | 'shiftKey'
  | 'altKey'
  | 'ctrlKey'
  | 'metaKey'
  | 'repeat'
  | 'isComposing'
  | 'defaultPrevented'
  | 'preventDefault'
>;

export interface KeyboardRepeatOptions {
  delayMs?: number;
  intervalMs?: number;
}

/** Own the hold timer; ignore OS repeats and refresh callbacks without restarting held keys. */
export function createHeldKeyboardShortcuts(
  initialShortcuts: readonly KeyboardShortcut[],
  { delayMs = 400, intervalMs = 80 }: KeyboardRepeatOptions = {}
) {
  let shortcuts = initialShortcuts;
  const held = new Map<string, HeldShortcut>();

  function findShortcut(event: KeyChord) {
    return shortcuts.find(
      (candidate) =>
        candidate.key.toLowerCase() === event.key.toLowerCase() &&
        (candidate.shift ?? false) === event.shiftKey &&
        (candidate.alt ?? false) === event.altKey &&
        (candidate.ctrl ?? false) === event.ctrlKey &&
        (candidate.meta ?? false) === event.metaKey
    );
  }

  function release(code: string) {
    const press = held.get(code);
    if (press === undefined) return;
    clearTimeout(press.timer);
    held.delete(code);
  }

  function releaseChangedModifiers(event: KeyChord) {
    for (const [code, { chord }] of held) {
      if (
        chord.shiftKey !== event.shiftKey ||
        chord.altKey !== event.altKey ||
        chord.ctrlKey !== event.ctrlKey ||
        chord.metaKey !== event.metaKey
      ) {
        release(code);
      }
    }
  }

  function stop() {
    for (const code of held.keys()) release(code);
  }

  return {
    update(next: readonly KeyboardShortcut[]) {
      shortcuts = next;
      for (const [code, { chord }] of held) {
        if (findShortcut(chord) === undefined) release(code);
      }
    },
    keydown(this: void, event: ShortcutKeyEvent) {
      releaseChangedModifiers(event);
      if (event.isComposing) {
        stop();
        return;
      }
      if (event.defaultPrevented) return;
      const shortcut = findShortcut(event);
      if (shortcut === undefined) return;
      event.preventDefault();
      // Native repeats neither trigger an action nor reset our timer.
      if (event.repeat || held.has(event.code)) return;

      const press: HeldShortcut = {
        chord: {
          key: event.key,
          code: event.code,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
        },
      };
      held.set(event.code, press);
      shortcut.onTrigger();
      const tick = () => {
        const current = findShortcut(press.chord);
        if (current?.repeat !== true) {
          release(event.code);
          return;
        }
        current.onTrigger();
        if (held.get(event.code) === press) press.timer = setTimeout(tick, intervalMs);
      };
      if (shortcut.repeat === true && held.get(event.code) === press) press.timer = setTimeout(tick, delayMs);
    },
    keyup(this: void, event: KeyChord) {
      release(event.code);
      releaseChangedModifiers(event);
    },
    stop,
  };
}
