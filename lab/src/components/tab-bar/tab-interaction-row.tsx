import type { FC } from 'react';

import type { TabBarItem } from './tab-bar.types.js';
import type { TabHit, TabStripGeometry } from './tab-geometry.js';

interface TabInteractionRowProps {
  tabs: readonly TabBarItem[];
  activeId: string | null;
  geometry: TabStripGeometry;
  activate: (hit: TabHit) => void;
}

/** One semantic tree at final geometry. Painting and pointer dispatch are owned elsewhere. */
export const TabInteractionRow: FC<TabInteractionRowProps> = ({ tabs, activeId, geometry, activate }) => {
  const items = new Map(tabs.map((tab) => [tab.id, tab]));
  return (
    <div data-tab-interaction-row="" className="absolute inset-y-0 left-0 flex items-center opacity-0">
      {geometry.tabs
        .filter((tab) => items.has(tab.id))
        .map((tab) => (
          <div
            key={tab.id}
            data-tab-interaction-id={tab.id}
            className="flex h-full min-w-0 shrink-0"
            style={{ width: tab.width, marginLeft: tab.gap }}
          >
            <button
              type="button"
              data-tab-action="select"
              data-tab-owner={tab.id}
              aria-label={items.get(tab.id)!.title}
              aria-pressed={activeId === tab.id}
              title={items.get(tab.id)!.title}
              className="h-full min-w-0 flex-1"
              onClick={(event) => {
                if (event.detail === 0) activate({ control: 'select', id: tab.id });
              }}
            />
            <button
              type="button"
              data-tab-action="close"
              data-tab-owner={tab.id}
              aria-label={`Close ${items.get(tab.id)!.title}`}
              aria-keyshortcuts={activeId === tab.id ? 'Shift+W' : undefined}
              className="h-full min-w-0 shrink-0"
              style={{ width: tab.close.width }}
              onClick={(event) => {
                if (event.detail === 0) activate({ control: 'close', id: tab.id });
              }}
            />
          </div>
        ))}
      <button
        type="button"
        data-tab-action="add"
        aria-label="Add tab"
        aria-keyshortcuts="Shift+T"
        className="h-full shrink-0"
        style={{
          width: geometry.add.width,
          marginLeft:
            geometry.tabs.length === 0
              ? 0
              : geometry.add.left - (geometry.tabs.at(-1)!.rect.left + geometry.tabs.at(-1)!.width),
        }}
        onClick={(event) => {
          if (event.detail === 0) activate({ control: 'add' });
        }}
      />
    </div>
  );
};
