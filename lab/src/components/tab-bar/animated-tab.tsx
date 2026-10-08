import { cn } from '@monorepo/utils';
import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { useContext, type FC } from 'react';

import {
  WIREFRAME_CONTENT,
  WIREFRAME_CONTROL,
  WIREFRAME_FEEDBACK,
  WIREFRAME_ITEM,
  WIREFRAME_SELECTED,
} from './tab-bar.styles.js';
import type { TabBarItem, TabFootprint } from './tab-bar.types.js';
import { sameTabHit, type TabHit } from './tab-geometry.js';
import { TabInteractionContext } from './tab-interaction-context.js';
import { TabTitle } from './tab-title.js';
import { useTabFootprint } from './use-tab-footprint.js';

interface AnimatedTabProps {
  tab: TabBarItem;
  footprints: Map<string, TabFootprint>;
}

export const AnimatedTab: FC<AnimatedTabProps> = ({ tab, footprints }) => {
  const { elementRef, closeElementRef, closeCapacity, width, gap, isPresent } = useTabFootprint(tab.id, footprints);
  const { activeId, state } = useContext(TabInteractionContext)!;
  const active = isPresent && activeId === tab.id;
  const controlState = (hit: TabHit) => ({
    'data-hovered': (isPresent && sameTabHit(state.hovered, hit)) || undefined,
    'data-pressed': (isPresent && sameTabHit(state.pressed, hit)) || undefined,
    'data-focus-visible': (isPresent && state.focused?.visible && sameTabHit(state.focused.hit, hit)) || undefined,
  });

  return (
    <motion.div
      ref={elementRef}
      data-tab-id={tab.id}
      data-exiting={!isPresent || undefined}
      data-active={active || undefined}
      style={{ width, marginLeft: gap }}
      className={cn(
        'flex h-9 min-w-0 shrink-0 items-center justify-end overflow-hidden',
        active ? WIREFRAME_SELECTED : WIREFRAME_ITEM
      )}
    >
      <div
        data-tab-presentation-control="select"
        {...controlState({ control: 'select', id: tab.id })}
        className={cn(
          `relative flex h-full min-w-0 flex-1 items-center overflow-hidden text-left
          before:pointer-events-none before:absolute before:inset-y-px before:right-0 before:w-px before:bg-neutral-500/15`,
          WIREFRAME_CONTROL,
          WIREFRAME_FEEDBACK
        )}
      >
        <TabTitle title={tab.title} />
      </div>
      <motion.div
        ref={closeElementRef}
        data-tab-presentation-control="close"
        {...controlState({ control: 'close', id: tab.id })}
        style={{ width: closeCapacity }}
        className={cn(
          'flex h-full min-w-0 shrink-0 items-center justify-center',
          WIREFRAME_CONTROL,
          WIREFRAME_FEEDBACK
        )}
      >
        <X aria-hidden="true" size={14} strokeWidth={1.5} className={cn('shrink-0', WIREFRAME_CONTENT)} />
      </motion.div>
    </motion.div>
  );
};
