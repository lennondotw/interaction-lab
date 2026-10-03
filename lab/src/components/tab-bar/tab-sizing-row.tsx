import type { FC, Ref } from 'react';

import type { TabBarItem } from './tab-bar.types.js';

interface TabSizingRowProps {
  tabs: readonly TabBarItem[];
  ref: Ref<HTMLDivElement>;
}

export const TabSizingRow: FC<TabSizingRowProps> = ({ tabs, ref }) => (
  <div
    ref={ref}
    data-tab-target-layout=""
    aria-hidden="true"
    className="pointer-events-none invisible absolute inset-0 flex items-center gap-1"
  >
    {tabs.map((tab) => (
      <div key={tab.id} data-tab-target={tab.id} className="h-9 min-w-0 shrink basis-44" />
    ))}
    <div className="size-9 shrink-0" />
  </div>
);
