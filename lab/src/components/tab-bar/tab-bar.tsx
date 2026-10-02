import { cn } from '@monorepo/utils';
import { Plus, X } from 'lucide-react';
import { useEffect } from 'react';

// The same 15 / 20 / 40 alpha hierarchy as the time wheel picker's wireframe.
const WIREFRAME_FRAME = 'outline-1 -outline-offset-1 outline-neutral-500/20';
const WIREFRAME_ITEM = 'outline-1 -outline-offset-1 outline-neutral-500/15';
const WIREFRAME_SELECTED = 'outline-1 -outline-offset-1 outline-neutral-500/40 outline-dashed';
const WIREFRAME_FOCUS = 'focus-visible:outline-neutral-500/70';

export interface TabBarItem {
  id: string;
  title: string;
}

export interface TabBarProps {
  tabs: readonly TabBarItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
  className?: string;
}

export function TabBar({ tabs, activeId, onSelect, onClose, onAdd, className }: TabBarProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        !event.shiftKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (event.altKey) {
        if (activeId !== null && (key === 'arrowleft' || key === 'arrowright')) {
          event.preventDefault();
          const index = tabs.findIndex((tab) => tab.id === activeId);
          const nextIndex = index + (key === 'arrowleft' ? -1 : 1);
          if (nextIndex >= 0 && nextIndex < tabs.length) onSelect(tabs[nextIndex]!.id);
        }
        return;
      }

      if (key === 't') {
        event.preventDefault();
        onAdd();
      } else if (key === 'w' && activeId !== null) {
        event.preventDefault();
        onClose(activeId);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeId, tabs, onAdd, onClose, onSelect]);

  return (
    <fieldset
      aria-label="Tabs"
      aria-keyshortcuts="Shift+Alt+ArrowLeft Shift+Alt+ArrowRight"
      className={cn(
        `flex w-full min-w-0 items-center gap-1 p-1 text-base/6 font-normal tracking-normal
        text-neutral-950 dark:text-neutral-50`,
        WIREFRAME_FRAME,
        className
      )}
    >
      {tabs.map((tab) => (
        <div
          key={tab.id}
          data-tab-id={tab.id}
          className={cn(
            // Equal bases and shrink factors divide the available space equally, independent of title length.
            'flex h-9 min-w-0 shrink basis-44 items-center overflow-hidden',
            tab.id === activeId ? WIREFRAME_SELECTED : WIREFRAME_ITEM
          )}
        >
          <button
            type="button"
            aria-pressed={tab.id === activeId}
            title={tab.title}
            onClick={() => onSelect(tab.id)}
            className={cn('h-full min-w-0 flex-1 overflow-hidden text-left', WIREFRAME_ITEM, WIREFRAME_FOCUS)}
          >
            <span className="block truncate px-3">{tab.title}</span>
          </button>
          <button
            type="button"
            aria-label={`Close ${tab.title}`}
            aria-keyshortcuts={tab.id === activeId ? 'Shift+W' : undefined}
            onClick={() => onClose(tab.id)}
            className={cn('flex h-full w-7 shrink-0 items-center justify-center', WIREFRAME_ITEM, WIREFRAME_FOCUS)}
          >
            <X aria-hidden="true" size={14} strokeWidth={1.5} />
          </button>
        </div>
      ))}
      <button
        type="button"
        aria-label="Add tab"
        aria-keyshortcuts="Shift+T"
        onClick={onAdd}
        className={cn('flex size-9 shrink-0 items-center justify-center', WIREFRAME_ITEM, WIREFRAME_FOCUS)}
      >
        <Plus aria-hidden="true" size={18} strokeWidth={1.5} />
      </button>
    </fieldset>
  );
}
