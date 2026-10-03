import { cn } from '@monorepo/utils';
import { X } from 'lucide-react';
import { motion } from 'motion/react';
import type { FC } from 'react';

import { WIREFRAME_CONTROL, WIREFRAME_FOCUS, WIREFRAME_ITEM, WIREFRAME_SELECTED } from './tab-bar.styles.js';
import type { TabBarItem, TabBarProps, TabFootprint } from './tab-bar.types.js';
import { TabTitle } from './tab-title.js';
import { useTabFootprint } from './use-tab-footprint.js';

interface AnimatedTabProps {
  tab: TabBarItem;
  active: boolean;
  onSelect: TabBarProps['onSelect'];
  onClose: TabBarProps['onClose'];
  footprints: Map<string, TabFootprint>;
}

export const AnimatedTab: FC<AnimatedTabProps> = ({ tab, active, onSelect, onClose, footprints }) => {
  const { elementRef, width, gap, isPresent } = useTabFootprint(tab.id, footprints);

  return (
    <motion.div
      ref={elementRef}
      data-tab-id={tab.id}
      data-exiting={!isPresent || undefined}
      inert={!isPresent}
      style={{ width, marginLeft: gap }}
      className={cn(
        'flex h-9 min-w-0 shrink-0 items-center overflow-hidden',
        active ? WIREFRAME_SELECTED : WIREFRAME_ITEM
      )}
    >
      <button
        type="button"
        aria-pressed={active}
        aria-label={tab.title}
        title={tab.title}
        onClick={() => onSelect(tab.id)}
        className={cn(
          `relative h-full min-w-0 flex-1 overflow-hidden text-left
          before:pointer-events-none before:absolute before:inset-y-px before:right-0 before:w-px before:bg-neutral-500/15`,
          WIREFRAME_CONTROL,
          WIREFRAME_FOCUS
        )}
      >
        <TabTitle title={tab.title} />
      </button>
      <button
        type="button"
        aria-label={`Close ${tab.title}`}
        aria-keyshortcuts={active ? 'Shift+W' : undefined}
        onClick={() => onClose(tab.id)}
        className={cn('flex h-full w-7 min-w-0 shrink items-center justify-center', WIREFRAME_CONTROL, WIREFRAME_FOCUS)}
      >
        <X aria-hidden="true" size={14} strokeWidth={1.5} className="shrink-0" />
      </button>
    </motion.div>
  );
};
