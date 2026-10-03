import { createHeldKeyboardShortcuts } from '@monorepo/utils';
import { useEffect, useLayoutEffect, useState } from 'react';

import type { TabBarProps } from './tab-bar.types.js';

type TabKeyboardOptions = Pick<TabBarProps, 'tabs' | 'activeId' | 'onSelect' | 'onClose' | 'onAdd'>;

export function useTabKeyboard({ tabs, activeId, onSelect, onClose, onAdd }: TabKeyboardOptions) {
  const [keyboard] = useState(() => createHeldKeyboardShortcuts([]));

  useLayoutEffect(() => {
    const switchTab = (direction: number) => {
      if (activeId === null) return;
      const index = tabs.findIndex((tab) => tab.id === activeId);
      const nextIndex = index + direction;
      if (nextIndex >= 0 && nextIndex < tabs.length) onSelect(tabs[nextIndex]!.id);
    };
    keyboard.update([
      { key: 't', shift: true, onTrigger: onAdd },
      {
        key: 'w',
        shift: true,
        repeat: true,
        onTrigger: () => {
          if (activeId !== null) onClose(activeId);
        },
      },
      ...[false, true].flatMap((alt) => [
        { key: 'ArrowLeft', shift: true, alt, repeat: true, onTrigger: () => switchTab(-1) },
        { key: 'ArrowRight', shift: true, alt, repeat: true, onTrigger: () => switchTab(1) },
      ]),
    ]);
  }, [activeId, tabs, onAdd, onClose, onSelect, keyboard]);

  useEffect(() => {
    window.addEventListener('keydown', keyboard.keydown);
    window.addEventListener('keyup', keyboard.keyup);
    window.addEventListener('blur', keyboard.stop);
    return () => {
      window.removeEventListener('keydown', keyboard.keydown);
      window.removeEventListener('keyup', keyboard.keyup);
      window.removeEventListener('blur', keyboard.stop);
      keyboard.stop();
    };
  }, [keyboard]);
}
