import { cn } from '@monorepo/utils';
import { Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { FC } from 'react';

import { AnimatedTab } from './animated-tab.js';
import { WIREFRAME_CONTENT, WIREFRAME_FEEDBACK, WIREFRAME_FRAME, WIREFRAME_ITEM } from './tab-bar.styles.js';
import type { TabBarProps } from './tab-bar.types.js';
import { sameTabHit } from './tab-geometry.js';
import { TabInteractionContext } from './tab-interaction-context.js';
import { TabInteractionRow } from './tab-interaction-row.js';
import { TabSizingRow } from './tab-sizing-row.js';
import { useTabHoverHold } from './use-tab-hover-hold.js';
import { useTabInteraction } from './use-tab-interaction.js';
import { useTabKeyboard } from './use-tab-keyboard.js';
import { useTabLayout } from './use-tab-layout.js';

export type { TabBarItem, TabBarProps } from './tab-bar.types.js';

export const TabBar: FC<TabBarProps> = ({
  tabs,
  activeId,
  onSelect,
  onClose,
  onAdd,
  onHoldStateChange,
  animationSpeed = 1,
  className,
}) => {
  const { heldWidths, setHeldWidths, holdState, hoverHold } = useTabHoverHold(onHoldStateChange);
  const { targetLayoutRef, addRef, footprints, addGap, close, targetGeometry } = useTabLayout({
    tabs,
    onClose,
    heldWidths,
    setHeldWidths,
    hoverHold,
    animationSpeed,
  });
  useTabKeyboard({ tabs, activeId, onSelect, onAdd, onClose: close });
  const { regionRef, state, activate, handlers } = useTabInteraction({
    tabs,
    target: targetGeometry,
    footprints,
    addGap,
    hoverHold,
    onSelect,
    onClose: close,
    onAdd,
  });

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
        <TabInteractionContext value={{ activeId, state }}>
          <div
            ref={regionRef}
            data-tab-hover-region=""
            data-hold-state={holdState}
            {...handlers}
            className="relative h-9 min-w-0"
          >
            <div
              data-tab-presentation-row=""
              aria-hidden="true"
              className="pointer-events-none flex w-fit min-w-0 items-center"
            >
              <AnimatePresence initial={false} mode="sync">
                {tabs.map((tab) => (
                  <AnimatedTab key={tab.id} tab={tab} footprints={footprints} />
                ))}
              </AnimatePresence>
              <motion.div
                ref={addRef}
                data-tab-presentation-control="add"
                data-hovered={sameTabHit(state.hovered, { control: 'add' }) || undefined}
                data-pressed={sameTabHit(state.pressed, { control: 'add' }) || undefined}
                data-focus-visible={(state.focused?.visible && state.focused.hit.control === 'add') || undefined}
                style={{ marginLeft: addGap }}
                className={cn('flex size-9 shrink-0 items-center justify-center', WIREFRAME_ITEM, WIREFRAME_FEEDBACK)}
              >
                <Plus aria-hidden="true" size={18} strokeWidth={1.5} className={WIREFRAME_CONTENT} />
              </motion.div>
            </div>
            {targetGeometry !== null && (
              <TabInteractionRow tabs={tabs} activeId={activeId} geometry={targetGeometry} activate={activate} />
            )}
          </div>
        </TabInteractionContext>
      </div>
    </fieldset>
  );
};
