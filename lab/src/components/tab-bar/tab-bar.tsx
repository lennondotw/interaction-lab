import { cn } from '@monorepo/utils';
import { Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { FC } from 'react';

import { AnimatedTab } from './animated-tab.js';
import { WIREFRAME_FOCUS, WIREFRAME_FRAME, WIREFRAME_ITEM } from './tab-bar.styles.js';
import type { TabBarProps } from './tab-bar.types.js';
import { TabSizingRow } from './tab-sizing-row.js';
import { useTabHoverHold } from './use-tab-hover-hold.js';
import { useTabKeyboard } from './use-tab-keyboard.js';
import { useTabLayout } from './use-tab-layout.js';

export type { TabBarItem, TabBarProps } from './tab-bar.types.js';

export const TabBar: FC<TabBarProps> = ({ tabs, activeId, onSelect, onClose, onAdd, onHoldStateChange, className }) => {
  const { heldWidths, setHeldWidths, holdState, hoverHold } = useTabHoverHold(onHoldStateChange);
  const { targetLayoutRef, addRef, footprints, addGap, close } = useTabLayout({
    tabs,
    onClose,
    heldWidths,
    setHeldWidths,
    hoverHold,
  });
  useTabKeyboard({ tabs, activeId, onSelect, onAdd, onClose: close });

  return (
    <fieldset
      aria-label="Tabs"
      aria-keyshortcuts="Shift+ArrowLeft Shift+ArrowRight Shift+Alt+ArrowLeft Shift+Alt+ArrowRight"
      className={cn(
        `w-full min-w-0 p-1 text-base/6 font-normal tracking-normal
        text-neutral-950 dark:text-neutral-50`,
        WIREFRAME_FRAME,
        className
      )}
    >
      <div className="relative min-w-0">
        <TabSizingRow ref={targetLayoutRef} tabs={tabs} />
        <div
          data-tab-hover-region=""
          data-hold-state={holdState}
          onPointerEnter={(event) => {
            if (event.pointerType !== 'touch') hoverHold.enter();
          }}
          onPointerLeave={(event) => {
            if (event.pointerType !== 'touch') hoverHold.leave();
          }}
          className="flex w-fit min-w-0 items-center"
        >
          <AnimatePresence initial={false} mode="sync">
            {tabs.map((tab) => (
              <AnimatedTab
                key={tab.id}
                tab={tab}
                active={tab.id === activeId}
                onSelect={onSelect}
                onClose={close}
                footprints={footprints}
              />
            ))}
          </AnimatePresence>
          <motion.button
            ref={addRef}
            type="button"
            aria-label="Add tab"
            aria-keyshortcuts="Shift+T"
            onClick={onAdd}
            style={{ marginLeft: addGap }}
            className={cn('flex size-9 shrink-0 items-center justify-center', WIREFRAME_ITEM, WIREFRAME_FOCUS)}
          >
            <Plus aria-hidden="true" size={18} strokeWidth={1.5} />
          </motion.button>
        </div>
      </div>
    </fieldset>
  );
};
